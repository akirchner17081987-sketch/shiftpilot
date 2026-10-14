-- Linear scan even for large stored auto-plan payloads and overlapping UUIDs.
-- A 28-character UUID prefix is only a candidate filter; scrub still compares full IDs.
create or replace function private.sf_erasure_uuid_map(p_ids text[]) returns jsonb
language sql immutable set search_path='' as $$
 select coalesce(jsonb_object_agg(left(lower(token),28),true),'{}'::jsonb)
 from unnest(coalesce(p_ids,'{}')) token
 where token ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
$$;
create or replace function private.sf_erasure_matches(p_serialized text,p_uuid_refs jsonb,p_other_tokens text[]) returns boolean
language plpgsql immutable set search_path='' as $$
declare serialized text:=lower(p_serialized); token text;
begin
 if p_serialized is null then return false; end if;
 foreach token in array coalesce(p_other_tokens,'{}') loop
  if token<>'' and strpos(serialized,lower(token))>0 then return true; end if;
 end loop;
 if p_uuid_refs='{}'::jsonb then return false; end if;
 -- Consume 28 characters, validating the last eight via lookahead.
 -- Any overlapping UUID can begin no earlier than character 29.
 return exists(select 1 from regexp_matches(serialized,'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}(?=[0-9a-f]{8})','g') m
  where p_uuid_refs ? m[1]);
end $$;
notify pgrst,'reload schema';
