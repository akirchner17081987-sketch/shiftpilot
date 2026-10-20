create function private.sf_build_audit_archive(company_ uuid,from_ timestamptz,to_ timestamptz,kind_ text)
returns uuid language plpgsql security definer set search_path='' as $$
declare id_ uuid; generation_ uuid; key_ bytea; rows_ jsonb; parts_ jsonb:='[]'; manifest_ jsonb;
 cursor_at_ timestamptz; cursor_id_ uuid; part_ integer:=0; count_ bigint:=0;
begin
 perform pg_advisory_xact_lock(hashtextextended('audit-archive:'||company_::text,0));
 if kind_='WEEKLY' then
  select id into id_ from private.audit_archives where company_id=company_ and kind='WEEKLY' and period_from=from_ and period_to=to_;
  if id_ is not null then return id_; end if;
 end if;
 insert into private.audit_archive_epochs(company_id) values(company_) on conflict do nothing;
 select generation into generation_ from private.audit_archive_epochs where company_id=company_ for share;
 select secret into key_ from private.audit_archive_keys where id;
 insert into private.audit_archives(company_id,kind,period_from,period_to) values(company_,kind_,from_,to_) returning id into id_;
 loop
  select jsonb_agg(to_jsonb(q) order by q.created_at,q.id) into rows_ from (
   select a.* from public.audit_events a where a.company_id=company_ and a.created_at<to_
   and (from_ is null or a.created_at>=from_)
   and (cursor_at_ is null or (a.created_at,a.id)>(cursor_at_,cursor_id_))
   order by a.created_at,a.id limit 250
  ) q;
  exit when rows_ is null;
  insert into private.audit_archive_parts(company_id,archive_id,part,rows) values(company_,id_,part_,rows_);
  parts_:=parts_||jsonb_build_array(jsonb_build_object('part',part_,'count',jsonb_array_length(rows_),
    'sha256',encode(extensions.digest(convert_to(rows_::text,'UTF8'),'sha256'),'hex')));
  count_:=count_+jsonb_array_length(rows_);part_:=part_+1;
  cursor_at_:=(rows_->-1->>'created_at')::timestamptz;cursor_id_:=(rows_->-1->>'id')::uuid;
 end loop;
 manifest_:=jsonb_build_object('format','schichtfunk.audit.v1','archive_id',id_,'company_id',company_,
  'company_name',(select name from public.companies where id=company_),'kind',kind_,
  'period_from',from_,'period_to',to_,'created_at',now(),'generation',generation_,'row_count',count_,'parts',parts_);
 update private.audit_archives set manifest=manifest_,signature=encode(extensions.hmac(convert_to(manifest_::text,'UTF8'),key_,'sha256'),'hex') where id=id_;
 insert into public.audit_events(company_id,event_type,entity_type,entity_id,actor_id,actor_role,metadata)
 values(company_,'AUDIT_ARCHIVE_CREATED','audit_archive',id_,auth.uid(),coalesce((select role from public.company_members where company_id=company_ and user_id=auth.uid()),'SYSTEM'),
  jsonb_build_object('kind',kind_,'row_count',count_,'period_from',from_,'period_to',to_));
 return id_;
end $$;
revoke all on function private.sf_build_audit_archive(uuid,timestamptz,timestamptz,text) from public,anon,authenticated,service_role;
