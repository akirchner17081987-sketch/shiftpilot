-- Native lexical parsing avoids expanding every JSON node into SQL rows.
-- Keep per-column tokens so checkpoint writes do not reindex an unchanged plan.
alter table private.employee_erasure_reference_index add column field_tokens jsonb not null default '{}';

create or replace function private.sf_erasure_reference_tokens(p_value jsonb)
returns table(uuid_prefixes text[],terms text[]) language sql immutable set search_path='' as $$
 with serialized as materialized(select lower(p_value::text) s),
 decoded as materialized (
  -- Consume escaped backslash pairs before control escapes. Literal "\\nName"
  -- and an actual newline followed by Name must remain distinguishable.
  select regexp_replace(s,$rx$\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4})$rx$,' ','g') s from serialized
 )
 select coalesce((select array_agg(distinct m[1]) from serialized,
  regexp_matches(s,'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}(?=[0-9a-f]{8})','g') m),'{}'::text[]),
 coalesce((select tsvector_to_array(to_tsvector('pg_catalog.simple',regexp_replace(s,'[^[:alnum:]_]+',' ','g'))) from decoded),'{}'::text[])
$$;

create or replace function private.sf_erasure_reference_query(p_ids text[],p_names text[])
returns jsonb language plpgsql immutable set search_path='' as $$
declare token text; word_ text; terms_ text[]:='{}'; fallback_ boolean:=false;
begin
 foreach token in array private.sf_erasure_other_ids(p_ids)||coalesce(p_names,'{}') loop
  if token='' then continue;end if;
  if left(token,1) !~ '^[[:alnum:]_]$' or right(token,1) !~ '^[[:alnum:]_]$' then fallback_:=true;continue;end if;
  select word into word_ from unnest(tsvector_to_array(to_tsvector('pg_catalog.simple',regexp_replace(lower(token),'[^[:alnum:]_]+',' ','g')))) word
   order by length(word) desc,word limit 1;
  -- The parser intentionally omits oversized lexemes; never skip those sources.
  if word_ is null then fallback_:=true;else terms_:=array_append(terms_,word_);end if;
 end loop;
 return jsonb_build_object('prefixes',coalesce((select jsonb_agg(k) from jsonb_object_keys(private.sf_erasure_uuid_map(p_ids)) k where length(k)=28),'[]'),
  'terms',to_jsonb(terms_),'fallback',fallback_);
end $$;

create function private.sf_erasure_reference_fields(p_value jsonb,p_previous jsonb,p_old_value jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare field_ record; tokens_ record; result_ jsonb:='{}';
begin
 for field_ in select key,value from jsonb_each(p_value) loop
  if p_previous ? field_.key and p_old_value->field_.key is not distinct from field_.value then
   result_:=result_||jsonb_build_object(field_.key,p_previous->field_.key);
  else
   select * into tokens_ from private.sf_erasure_reference_tokens(field_.value);
   result_:=result_||jsonb_build_object(field_.key,jsonb_build_object('uuid_prefixes',tokens_.uuid_prefixes,'terms',tokens_.terms));
  end if;
 end loop;
 return result_;
end $$;

create function private.sf_erasure_store_reference_fields(p_source oid,p_row uuid,p_company uuid,p_fields jsonb) returns void
language sql security definer set search_path='' as $$
 insert into private.employee_erasure_reference_index(source_oid,row_id,company_id,uuid_prefixes,terms,field_tokens)
 select p_source,p_row,p_company,
  coalesce((select array_agg(distinct token) from jsonb_each(p_fields) f cross join lateral jsonb_array_elements_text(f.value->'uuid_prefixes') token),'{}'::text[]),
  coalesce((select array_agg(distinct token) from jsonb_each(p_fields) f cross join lateral jsonb_array_elements_text(f.value->'terms') token),'{}'::text[]),p_fields
 on conflict(source_oid,row_id) do update set company_id=excluded.company_id,uuid_prefixes=excluded.uuid_prefixes,terms=excluded.terms,field_tokens=excluded.field_tokens
$$;

create or replace function private.sf_erasure_refresh_reference_index() returns trigger
language plpgsql security definer set search_path='' as $$
declare columns_ text[]; value_ jsonb; old_value_ jsonb; previous_ jsonb; fields_ jsonb;
begin
 if tg_op='DELETE' then
  delete from private.employee_erasure_reference_index where source_oid=tg_relid and row_id=old.id;
  return old;
 end if;
 select json_columns into columns_ from private.employee_erasure_index_sources where source_oid=tg_relid;
 if not found then return new;end if;
 select jsonb_object_agg(k,v) into value_ from jsonb_each(to_jsonb(new)) q(k,v) where k=any(columns_);
 if tg_op='UPDATE' then
  select jsonb_object_agg(k,v) into old_value_ from jsonb_each(to_jsonb(old)) q(k,v) where k=any(columns_);
  if old.id=new.id and old.company_id=new.company_id and value_=old_value_ then return new;end if;
  if old.id<>new.id then delete from private.employee_erasure_reference_index where source_oid=tg_relid and row_id=old.id;end if;
 end if;
 select field_tokens into previous_ from private.employee_erasure_reference_index where source_oid=tg_relid and row_id=new.id;
 fields_:=private.sf_erasure_reference_fields(value_,coalesce(previous_,'{}'),old_value_);
 perform private.sf_erasure_store_reference_fields(tg_relid,new.id,new.company_id,fields_);
 return new;
end $$;

create or replace function private.server_backfill_employee_erasure_references() returns jsonb
language plpgsql security definer set search_path='' as $$
declare source_ record; row_ record; fields_ jsonb; cols_sql_ text; started_ timestamptz:=clock_timestamp(); processed_ int:=0; cursor_ uuid;
begin
 perform private.sf_assert_service_role();
 for source_ in select * from private.employee_erasure_index_sources where not ready order by schema_name,table_name for no key update loop
  select string_agg(format('%L,to_jsonb(t.%I)',x,x),',') into cols_sql_ from unnest(source_.json_columns) x;
  cursor_:=source_.backfill_cursor;
  for row_ in execute format('select id,company_id,jsonb_build_object(%s) value from %I.%I t where ($1 is null or id>$1) order by id limit 100 for share',cols_sql_,source_.schema_name,source_.table_name) using cursor_ loop
   fields_:=private.sf_erasure_reference_fields(row_.value,'{}',null);
   perform private.sf_erasure_store_reference_fields(source_.source_oid,row_.id,row_.company_id,fields_);
   cursor_:=row_.id;processed_:=processed_+1;
   update private.employee_erasure_index_sources set backfill_cursor=cursor_,indexed_rows=indexed_rows+1 where source_oid=source_.source_oid;
   if clock_timestamp()-started_>=interval '2 seconds' then return jsonb_build_object('complete',false,'processed',processed_);end if;
  end loop;
  execute format('select exists(select 1 from %I.%I where $1 is null or id>$1)',source_.schema_name,source_.table_name) into source_.ready using cursor_;
  if not source_.ready then update private.employee_erasure_index_sources set ready=true where source_oid=source_.source_oid;end if;
  if source_.ready then return jsonb_build_object('complete',false,'processed',processed_);end if;
 end loop;
 return jsonb_build_object('complete',true,'processed',processed_);
end $$;

revoke all on function private.sf_erasure_reference_fields(jsonb,jsonb,jsonb),private.sf_erasure_store_reference_fields(oid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function private.sf_erasure_reference_fields(jsonb,jsonb,jsonb),private.sf_erasure_store_reference_fields(oid,uuid,uuid,jsonb) to service_role;
update private.employee_erasure_index_sources set ready=false,backfill_cursor=null,indexed_rows=0;
