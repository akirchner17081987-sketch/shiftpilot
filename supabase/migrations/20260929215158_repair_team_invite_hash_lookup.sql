CREATE OR REPLACE FUNCTION private.handle_schichtfunk_company_signup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_token text; v_hash text; v_inv public.company_member_invites%rowtype;
begin
  v_token:=coalesce(new.raw_user_meta_data->>'sf_company_invite','');
  if v_token='' then return new; end if;
  v_hash:=encode(extensions.digest(v_token,'sha256'),'hex');
  select * into v_inv from public.company_member_invites where token_hash=v_hash and status='INVITED' and expires_at>now() for update;
  if v_inv.id is null or lower(coalesce(new.email,''))<>lower(v_inv.email) then return new; end if;
  insert into public.company_members(company_id,user_id,role,status) values(v_inv.company_id,new.id,v_inv.role,'ACTIVE')
  on conflict(company_id,user_id) do update set role=excluded.role,status='ACTIVE';
  update public.company_member_invites set status='CLAIMED',claimed_by=new.id,claimed_at=now() where id=v_inv.id;
  return new;
end $function$
;
