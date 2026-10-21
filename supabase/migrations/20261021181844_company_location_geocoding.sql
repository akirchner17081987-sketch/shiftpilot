-- Prepared migration; apply through the migration API after external geocoding is approved.
-- Coordinates belong to the existing company-scoped location. No company/location data is copied.
alter table public.company_locations
 add column longitude double precision,
 add column latitude double precision,
 add column geocode_address text not null default '',
 add column geocode_status text not null default 'pending' check(geocode_status in ('pending','resolving','verified','not_found','ambiguous','incomplete','error')),
 add column geocode_source text not null default '',
 add column geocode_label text not null default '',
 add column geocode_checked_at timestamptz,
 add column geocode_retry_at timestamptz,
 add constraint company_location_coordinates_valid check (
  (longitude is null and latitude is null) or
  (longitude is not null and latitude is not null and longitude between -180 and 180 and latitude between -90 and 90)),
 add constraint company_location_verified_address check(geocode_status<>'verified' or (longitude is not null and latitude is not null and geocode_address=address));

create function private.sf_reset_location_geocode() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.address is distinct from old.address then
  new.longitude:=null;new.latitude:=null;new.geocode_address:='';new.geocode_status:='pending';
  new.geocode_source:='';new.geocode_label:='';new.geocode_checked_at:=null;new.geocode_retry_at:=null;
 end if;
 return new;
end;
$$;
revoke all on function private.sf_reset_location_geocode() from public,anon,authenticated;
create trigger company_location_reset_geocode before update of address on public.company_locations
for each row execute function private.sf_reset_location_geocode();

-- Global application limit, including concurrent edge instances: at most one lookup every 1.2 seconds.
create table private.location_geocode_rate_limit(singleton boolean primary key default true check(singleton),next_at timestamptz not null);
alter table private.location_geocode_rate_limit enable row level security;
insert into private.location_geocode_rate_limit values(true,'-infinity');
revoke all on private.location_geocode_rate_limit from public,anon,authenticated;
grant select,update on private.location_geocode_rate_limit to service_role;

create function public.sf_claim_location_geocode(p_site_id uuid,p_company_id uuid,p_address text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare s public.company_locations%rowtype;deadline timestamptz;
begin
 select * into s from public.company_locations where id=p_site_id and company_id=p_company_id for update;
 if not found or not s.is_active or s.address<>p_address then return false;end if;
 if s.geocode_address=s.address and (s.geocode_status='verified' or s.geocode_retry_at>clock_timestamp()) then return false;end if;
 select next_at into deadline from private.location_geocode_rate_limit where singleton for update;
 if deadline>clock_timestamp() then return false;end if;
 update private.location_geocode_rate_limit set next_at=clock_timestamp()+interval '1.2 seconds' where singleton;
 update public.company_locations set geocode_address=address,geocode_status='resolving',geocode_retry_at=clock_timestamp()+interval '1 minute' where id=p_site_id and company_id=p_company_id;
 return true;
end;
$$;
revoke all on function public.sf_claim_location_geocode(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.sf_claim_location_geocode(uuid,uuid,text) to service_role;
-- Existing table SELECT grants, company RLS, and manager write RPCs stay in force.

-- Preserve the six previously verified map positions, matched ONLY to each site's own exact address.
-- This migrates existing map data; it does not create sites or copy company profiles.
update public.company_locations s set longitude=v.lon,latitude=v.lat,geocode_address=s.address,
 geocode_status='verified',geocode_source='legacy_verified',geocode_checked_at=clock_timestamp()
from (values
 ('Kalscheurener Str. 19 - 50354 Hürth',6.9058444,50.8922173),
 ('Nonnenstraße 21',12.3419772,51.3278275),
 ('Westring 45 - 45659 Recklinghausen',7.1795349,51.6085523),
 ('Döbichauer Str. 1-3, Halle 23a, 04435 Schkeuditz',12.20510315,51.35291425),
 ('Handelszentrum 5/Stk 2, 5101 Bergheim bei Salzburg, Österreich',13.0403314,47.8424733),
 ('Georgstraße 38, 30159 Hannover',9.7394661,52.3728319)
) as v(address,lon,lat) where s.address=v.address;
