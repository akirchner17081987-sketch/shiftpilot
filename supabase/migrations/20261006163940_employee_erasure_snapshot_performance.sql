create or replace function private.sf_erasure_scrub(p_value jsonb,p_ids text[],p_names text[]) returns jsonb
language plpgsql immutable set search_path='' as $$
declare k text; v jsonb; cleaned jsonb; result jsonb; s text; token text; escaped text; names text[]:=p_names;
begin
 if p_value is null then return null; end if;
 if jsonb_typeof(p_value)='object' then
  if coalesce(p_value->>'employee_id',p_value->>'employeeId',p_value->>'id','')=any(p_ids) then return null; end if;
  -- Names alone must never remove a different, identified employee with the same name.
  if coalesce(p_value->>'employee_id',p_value->>'employeeId','')<>'' then names:='{}'; end if;
  result:='{}';
  for k,v in select * from jsonb_each(p_value) loop
   if k=any(p_ids) then continue; end if;
   cleaned:=private.sf_erasure_scrub(v,p_ids,names);
   if cleaned is not null then result:=result||jsonb_build_object(k,cleaned); end if;
  end loop;
  return result;
 elsif jsonb_typeof(p_value)='array' then
  result:='[]';
  for v in select value from jsonb_array_elements(p_value) loop
   cleaned:=private.sf_erasure_scrub(v,p_ids,names);
   if cleaned is not null then result:=result||jsonb_build_array(cleaned); end if;
  end loop;
  return result;
 elsif jsonb_typeof(p_value)='string' then
  s:=p_value#>>'{}';
  foreach token in array coalesce(p_ids,'{}')||coalesce(names,'{}') loop
   if token='' then continue; end if;
   if strpos(lower(s),lower(token))=0 then continue; end if;
   if lower(s)=lower(token) then return null; end if;
   escaped:=regexp_replace(token,'([\\.\^$|?*+(){}\[\]])','\\\1','g');
   s:=regexp_replace(s,'\m'||escaped||'\M','[entfernt]','gi');
  end loop;
  return to_jsonb(s);
 end if;
 return p_value;
end $$;
