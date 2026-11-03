-- SchichtFunk – mandantenfaehiges Corporate Design / White Label.
-- Branding bleibt strikt an die serverseitig verifizierte Unternehmenszuordnung gebunden.

create table public.company_branding (
  company_id uuid primary key references public.companies(id) on delete cascade,
  theme_key text not null default 'custom' check (theme_key in ('original','secontec','custom')),
  logo_path text,
  background_path text,
  globe_accents boolean not null default true,
  dark_primary text not null default '#27d6b4' check (dark_primary ~ '^#[0-9A-Fa-f]{6}$'),
  dark_accent text not null default '#42d3df' check (dark_accent ~ '^#[0-9A-Fa-f]{6}$'),
  dark_background text not null default '#08111f' check (dark_background ~ '^#[0-9A-Fa-f]{6}$'),
  dark_surface text not null default '#101d2d' check (dark_surface ~ '^#[0-9A-Fa-f]{6}$'),
  dark_text text not null default '#f4f8ff' check (dark_text ~ '^#[0-9A-Fa-f]{6}$'),
  dark_muted text not null default '#a8b8cc' check (dark_muted ~ '^#[0-9A-Fa-f]{6}$'),
  light_primary text not null default '#087c6b' check (light_primary ~ '^#[0-9A-Fa-f]{6}$'),
  light_accent text not null default '#315f8a' check (light_accent ~ '^#[0-9A-Fa-f]{6}$'),
  light_background text not null default '#d5dfe6' check (light_background ~ '^#[0-9A-Fa-f]{6}$'),
  light_surface text not null default '#ecf1f4' check (light_surface ~ '^#[0-9A-Fa-f]{6}$'),
  light_text text not null default '#1c2d3a' check (light_text ~ '^#[0-9A-Fa-f]{6}$'),
  light_muted text not null default '#435969' check (light_muted ~ '^#[0-9A-Fa-f]{6}$'),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (logo_path is null or logo_path ~ ('^' || company_id::text || '/[A-Za-z0-9_.-]+$')),
  check (background_path is null or background_path ~ ('^' || company_id::text || '/[A-Za-z0-9_.-]+$'))
);

create index company_branding_updated_by_idx
  on public.company_branding(updated_by);

alter table public.company_branding enable row level security;
revoke all on public.company_branding from public, anon;
grant select, insert, update, delete on public.company_branding to authenticated;

create policy company_branding_select on public.company_branding
for select to authenticated using (
  exists (
    select 1 from public.company_members cm
    where cm.company_id=company_branding.company_id
      and cm.user_id=(select auth.uid()) and cm.status='ACTIVE'
  )
  or exists (
    select 1 from public.employees e
    where e.company_id=company_branding.company_id
      and e.auth_user_id=(select auth.uid()) and e.status='active' and e.access_status='ACTIVE'
  )
);

create policy company_branding_insert on public.company_branding
for insert to authenticated with check (
  updated_by=(select auth.uid()) and exists (
    select 1 from public.company_members cm
    where cm.company_id=company_branding.company_id
      and cm.user_id=(select auth.uid()) and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN')
  )
);

create policy company_branding_update on public.company_branding
for update to authenticated
using (exists (
  select 1 from public.company_members cm
  where cm.company_id=company_branding.company_id
    and cm.user_id=(select auth.uid()) and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN')
))
with check (updated_by=(select auth.uid()) and exists (
  select 1 from public.company_members cm
  where cm.company_id=company_branding.company_id
    and cm.user_id=(select auth.uid()) and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN')
));

create policy company_branding_delete on public.company_branding
for delete to authenticated using (exists (
  select 1 from public.company_members cm
  where cm.company_id=company_branding.company_id
    and cm.user_id=(select auth.uid()) and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN')
));

create trigger company_branding_updated_at
before update on public.company_branding
for each row execute function public.set_updated_at();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('company-branding-assets','company-branding-assets',false,5242880,array['image/png','image/jpeg','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy company_branding_assets_select on storage.objects
for select to authenticated using (
  bucket_id='company-branding-assets' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' and (
    exists (
      select 1 from public.company_members cm
      where cm.company_id=((storage.foldername(name))[1])::uuid
        and cm.user_id=(select auth.uid()) and cm.status='ACTIVE'
    )
    or exists (
      select 1 from public.employees e
      where e.company_id=((storage.foldername(name))[1])::uuid
        and e.auth_user_id=(select auth.uid()) and e.status='active' and e.access_status='ACTIVE'
    )
  )
);

create policy company_branding_assets_insert on storage.objects
for insert to authenticated with check (
  bucket_id='company-branding-assets' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and exists (
    select 1 from public.company_members cm
    where cm.company_id=((storage.foldername(name))[1])::uuid
      and cm.user_id=(select auth.uid()) and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN')
  )
);

create policy company_branding_assets_update on storage.objects
for update to authenticated
using (bucket_id='company-branding-assets' and exists (
  select 1 from public.company_members cm
  where cm.company_id=((storage.foldername(name))[1])::uuid
    and cm.user_id=(select auth.uid()) and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN')
))
with check (bucket_id='company-branding-assets' and exists (
  select 1 from public.company_members cm
  where cm.company_id=((storage.foldername(name))[1])::uuid
    and cm.user_id=(select auth.uid()) and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN')
));

create policy company_branding_assets_delete on storage.objects
for delete to authenticated using (
  bucket_id='company-branding-assets' and exists (
    select 1 from public.company_members cm
    where cm.company_id=((storage.foldername(name))[1])::uuid
      and cm.user_id=(select auth.uid()) and cm.status='ACTIVE' and cm.role in ('OWNER','ADMIN')
  )
);

-- Secontec Services, 8h und 9h teilen eine gemeinsame, offizielle Markenbasis.
insert into public.company_branding(
  company_id,theme_key,globe_accents,dark_primary,dark_accent,dark_background,dark_surface,dark_text,dark_muted,
  light_primary,light_accent,light_background,light_surface,light_text,light_muted
)
select c.id,'secontec',true,'#EA5A06','#F28A4A','#101418','#1A2026','#FFFFFF','#C6CDD3',
  '#B74400','#D95300','#E9EDF0','#FFFFFF','#202428','#505A62'
from public.companies c
where lower(c.name) like 'secontec services%'
on conflict(company_id) do nothing;

insert into public.company_branding(company_id,theme_key,globe_accents)
select c.id,'original',true from public.companies c
where lower(c.name) in ('schichtfunk','schichtfunk demo gmbh')
on conflict(company_id) do nothing;
