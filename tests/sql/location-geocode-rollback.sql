-- Live integration QA. Synthetic companies/locations only; every change is rolled back.
begin;
do $qa$
declare owner_u uuid:=gen_random_uuid();other_u uuid:=gen_random_uuid();co uuid;other_co uuid;site uuid;other_site uuid;r jsonb;rejected integer:=0;
begin
 insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 values(owner_u,'authenticated','authenticated','sf-geo-qa-'||owner_u||'@example.invalid','{}','{}',now(),now()),
 (other_u,'authenticated','authenticated','sf-geo-qa-'||other_u||'@example.invalid','{}','{}',now(),now());
 insert into public.companies(name,created_by) values('Location Geocode QA',owner_u) returning id into co;
 insert into public.companies(name,created_by) values('Location Geocode Foreign QA',other_u) returning id into other_co;
 insert into public.company_members(company_id,user_id,role,status,access_role,extra_permissions) values(co,owner_u,'OWNER','ACTIVE','OWNER','{}'),(other_co,other_u,'OWNER','ACTIVE','OWNER','{}') on conflict do nothing;
 insert into public.company_locations(company_id,code,name,address) values(co,'GEO','Synthetic address','Example 1, 12345 Ort') returning id into site;
 insert into public.company_locations(company_id,code,name,address) values(other_co,'GEO','Foreign synthetic','Other 2, 23456 Ort') returning id into other_site;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_u,'role','authenticated','aal','aal2')::text,true);
 perform set_config('request.jwt.claim.sub',owner_u::text,true);
 set local role authenticated;
 if (select count(*) from public.company_locations where id in(site,other_site))<>1 then raise exception 'Foreign coordinates visible';end if;
 begin update public.company_locations set longitude=12 where id=site;raise exception 'Direct coordinate write allowed';exception when insufficient_privilege then rejected:=rejected+1;end;
 begin perform public.sf_claim_location_geocode(site,co,'Example 1, 12345 Ort');raise exception 'Service gate open to authenticated';exception when insufficient_privilege then rejected:=rejected+1;end;
 begin perform public.manager_company_profile(other_co);raise exception 'Foreign profile allowed';exception when insufficient_privilege then rejected:=rejected+1;end;
 reset role;
 update private.location_geocode_rate_limit set next_at='-infinity';
 set local role service_role;
 if public.sf_claim_location_geocode(site,other_co,'Example 1, 12345 Ort') then raise exception 'Wrong tenant claim accepted';end if;
 if not public.sf_claim_location_geocode(site,co,'Example 1, 12345 Ort') then raise exception 'Valid service claim rejected';end if;
 if public.sf_claim_location_geocode(other_site,other_co,'Other 2, 23456 Ort') then raise exception 'Global rate limit bypassed';end if;
 update public.company_locations set longitude=12,latitude=51,geocode_address=address,geocode_status='verified',geocode_source='qa' where id=site;
 reset role;
 set local role authenticated;
 r:=public.manager_company_profile(co);
 if jsonb_array_length(r->'sites')<>1 or r->'sites'->0->>'geocode_status'<>'verified' then raise exception 'Profile coordinates missing or not isolated';end if;
 r:=public.manager_save_company_location(co,jsonb_build_object('id',site,'code','GEO','name','Synthetic address','address','Changed 3, 34567 Ort'),1);
 if r->>'geocode_status'<>'pending' or r->>'longitude' is not null or r->>'latitude' is not null or r->>'geocode_address'<>'' then raise exception 'Address change retained stale coordinates';end if;
 reset role;
 if rejected<>3 then raise exception 'Missing rejection checks';end if;
 raise notice 'Location geocoding live QA passed: company RLS, RPC isolation, service-only claims, global rate limit, profile metadata and address invalidation.';
end;
$qa$;
rollback;
