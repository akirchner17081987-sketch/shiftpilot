-- Erase attributed tasks, their report snapshots and author events; anonymize receipt attribution through FK.
CREATE OR REPLACE FUNCTION private.sf_erasure_relations(p_company uuid, p_employees uuid[], p_assignments uuid[], p_shifts uuid[], p_requests uuid[], p_incidents uuid[], p_notifications uuid[], p_checks uuid[])
 RETURNS TABLE(schema_name text, table_name text, key_name text, predicate text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 select * from (values
 ('public','shift_handover_reports','id','employee_id=any($2) or board_id in(select board_id from public.shift_handover_items where company_id=$1 and (employee_id=any($2) or responsible_employee_id=any($2)))'),
 ('public','shift_handover_events','id','employee_id=any($2)'),
 ('public','shift_handover_items','id','employee_id=any($2) or responsible_employee_id=any($2)'),
 ('public','compliance_findings','id','change_request_id=any($5) or check_run_id=any($8)'),
 ('public','compliance_check_runs','id','change_request_id=any($5)'),
 ('public','shift_change_approvals','id','change_request_id=any($5)'),
 ('private','push_dispatches','notification_id','notification_id=any($7)'),
 ('public','notifications','id','id=any($7)'),
 ('public','disruption_offers','id','employee_id=any($2) or incident_id=any($6)'),
 ('public','disruption_incidents','id','id=any($6)'),
 ('public','open_shift_market_claims','id','employee_id=any($2) or assignment_id=any($3)'),
 ('public','shift_swap_requests','id','original_employee_id=any($2) or target_employee_id=any($2) or assignment_id=any($3) or change_request_id=any($5)'),
 ('public','shift_assignment_confirmations','id','employee_id=any($2) or assignment_id=any($3)'),
 ('public','time_qr_breaks','id','employee_id=any($2) or assignment_id=any($3)'),
 ('public','time_qr_punches','id','employee_id=any($2) or assignment_id=any($3)'),
 ('public','time_qr_pilot_employees','employee_id','employee_id=any($2)'),
 ('public','time_qr_independent_sessions','token_hash','employee_id=any($2)'),
 ('public','time_qr_independent_breaks','id','shift_id=any($4)'),
 ('public','time_qr_independent_events','id','shift_id=any($4)'),
 ('public','time_qr_independent_shifts','id','id=any($4)'),
 ('public','time_entries','assignment_id','assignment_id=any($3)'),
 ('public','shift_change_requests','id','id=any($5)'),
 ('public','shift_assignments','id','id=any($3)'),
 ('public','planning_wish_events','id','employee_id=any($2)'),
 ('public','planning_wishes','id','employee_id=any($2)'),
 ('public','absences','id','employee_id=any($2)'),
 ('private','employee_profile_requests','id','employee_id=any($2)'),
 ('private','personnel_expiry_reminder_log','employee_id','employee_id=any($2)'),
 ('private','privacy_lifecycle_requests','id','employee_id=any($2)'),
 ('private','privacy_legal_holds','id','employee_id=any($2)'),
 ('public','employee_access_invites','id','employee_id=any($2)'),
 ('public','employee_personnel_documents','id','employee_id=any($2)'),
 ('public','employee_personnel_notes','id','employee_id=any($2)'),
 ('public','employee_personnel_qualifications','id','employee_id=any($2)'),
 ('public','employee_time_account_openings','employee_id','employee_id=any($2)'),
 ('public','time_account_openings','employee_id','employee_id=any($2)'),
 ('public','employee_personnel_details','employee_id','employee_id=any($2)'),
 ('public','employees','id','id=any($2)')
 ) q
$function$;
