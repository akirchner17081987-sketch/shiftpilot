-- Compile the known UUID prefixes into one reusable existence search. Unlike
-- regexp_matches(..., 'g'), this does not enumerate every unrelated UUID in a
-- stored planning result. Prefixes contain only validated hex digits and hyphens.
-- Keep the previous key map and a bounded fallback for older checkpoints and
-- unusually large reference sets. Full IDs are still checked by the scrubber.
create or replace function private.sf_erasure_uuid_map(p_ids text[]) returns jsonb
language sql immutable set search_path='' as $$
 with prefixes as materialized (
  select distinct left(lower(token),28) prefix
  from unnest(coalesce(p_ids,'{}')) token
  where token ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 ), prepared as (
  select coalesce(jsonb_object_agg(prefix,true),'{}'::jsonb) refs,
   count(*) n, string_agg(prefix,'|' order by prefix) pattern
  from prefixes
 ) select refs || case when n between 1 and 512
  then jsonb_build_object('_candidate_pattern','('||pattern||')[0-9a-f]{8}')
  else '{}'::jsonb end from prepared
$$;

CREATE OR REPLACE FUNCTION private.sf_erasure_matches(p_serialized text, p_uuid_refs jsonb, p_other_tokens text[])
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare serialized text:=lower(p_serialized); token text; escaped text;
begin
 if p_serialized is null then return false; end if;
 foreach token in array coalesce(p_other_tokens,'{}') loop
  if token<>'' and strpos(serialized,lower(token))>0 then
   if serialized=lower(token) then return true; end if;
   if left(token,1) ~ '^[[:alnum:]_]$' and right(token,1) ~ '^[[:alnum:]_]$' then
    escaped:=regexp_replace(token,'([\\.\^$|?*+(){}\[\]])','\\\1','g');
    if serialized ~* ('\m'||escaped||'\M') then return true; end if;
   else return true;
   end if;
  end if;
 end loop;
 if p_uuid_refs='{}'::jsonb then return false; end if;
 -- Most recursive leaves are short labels or single UUIDs. Avoid running the
 -- combined pattern for those values; names and legacy tokens were checked above.
 if length(serialized)<36 then return false; end if;
 if length(serialized)=36 then
  if not coalesce(p_uuid_refs ? left(serialized,28),false) then return false; end if;
  return serialized ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
 end if;
 if p_uuid_refs ? '_candidate_pattern' then
  return serialized ~ (p_uuid_refs->>'_candidate_pattern');
 end if;
 -- Consume 28 characters, validating the last eight via lookahead.
 -- Any overlapping UUID can begin no earlier than character 29.
 return exists(select 1 from regexp_matches(serialized,'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}(?=[0-9a-f]{8})','g') m
  where p_uuid_refs ? m[1]);
end $function$;


