const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseErasureRequest(value){
 if(!value||!UUID.test(value.companyId||'')||!UUID.test(value.employeeId||'')||!UUID.test(value.operationId||'')
  ||typeof value.confirmation!=='string'||value.confirmation.length>300||value.acknowledged!==true
  ||typeof value.fingerprint!=='string'||!/^([a-f0-9]{32})$/.test(value.fingerprint))throw Error('INVALID_REQUEST');
 return{companyId:value.companyId,employeeId:value.employeeId,operationId:value.operationId,confirmation:value.confirmation.trim(),acknowledged:true,fingerprint:value.fingerprint};
}
async function rpc(admin,name,args){const result=await admin.rpc(name,args);if(result.error)throw Error(result.error.message||'Die Löschung wurde nicht abgeschlossen.');return result.data;}
export async function runEmployeeErasure(admin,request,actor){
 const staged=await rpc(admin,'server_stage_employee_erasure',{
  p_company_id:request.companyId,p_employee_id:request.employeeId,p_actor:actor,p_operation_id:request.operationId,
  p_confirmation:request.confirmation,p_acknowledged:request.acknowledged,p_fingerprint:request.fingerprint
 });
 const plan=staged.plan;
 if(staged.status!=='DATABASE_DONE'){
  const paths=plan.storage_paths||[];
  for(let start=0;start<paths.length;start+=100){
   const removed=await admin.storage.from('personnel-documents').remove(paths.slice(start,start+100));
   if(removed.error)throw Error('Dokumentdateien konnten noch nicht vollständig gelöscht werden. Bitte die Löschung erneut starten.');
  }
  // The database independently verifies absence of metadata and unlisted orphan files
  // before removing any personnel, planning or accounting records.
  await rpc(admin,'server_commit_employee_erasure',{p_job_id:staged.job_id,p_actor:actor});
 }
 if(plan.delete_auth&&plan.auth_user_id){
  const lookup=await admin.auth.admin.getUserById(plan.auth_user_id);
  if(lookup.error&&lookup.error.status!==404&&lookup.error.code!=='user_not_found')throw Error('Der Mitarbeiterzugang konnte noch nicht geprüft werden. Bitte erneut starten.');
  if(!lookup.error&&lookup.data.user){
   const deleted=await admin.auth.admin.deleteUser(plan.auth_user_id,false);
   if(deleted.error)throw Error('Der Mitarbeiterzugang konnte noch nicht vollständig gelöscht werden. Bitte erneut starten.');
  }
 }
 return await rpc(admin,'server_finish_employee_erasure',{p_job_id:staged.job_id,p_actor:actor});
}
