// Service-only transfer operations; raw PostgreSQL JSON strings preserve 64-bit values.
export const BUCKET='audit-archives';
export const sha256=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(b=>b.toString(16).padStart(2,'0')).join('');
const unwrap=result=>{if(result.error)throw result.error;return result.data;};
const partPath=(prefix,part)=>prefix+'part-'+part+'.json';
export async function transferArchive(admin,id,token){
 const call=async(action,args={})=>unwrap(await admin.rpc('server_audit_archive_storage',{p_action:action,p_archive_id:id,p_token:token,p_args:args}));
 let job;
 try{
  job=await call('claim');if(!job)return {ok:true,skipped:true};
  const lease={lease:job.lease},store=admin.storage.from(BUCKET);
  if(job.state==='DELETE'){
   const paths=[job.prefix+'manifest.json',...Array.from({length:job.part_count},(_,i)=>partPath(job.prefix,i))];
   for(let i=0;i<paths.length;i+=100)unwrap(await store.remove(paths.slice(i,i+100)));
   const remaining=unwrap(await store.list(job.prefix.replace(/\/$/,''),{limit:1}));
   if(remaining.length)throw Error('Dateilöschung nicht bestätigt');
   return await call('purged',lease);
  }
  const verified=async(path,text,expected)=>{
   if(new TextEncoder().encode(text).byteLength>15000000)throw Error('Archivpaket zu groß');
   if(await sha256(text)!==expected)throw Error('Archiv-Prüfsumme stimmt nicht');
   const upload=await store.upload(path,new Blob([text],{type:'application/json'}),{upsert:false,contentType:'application/json',cacheControl:'0'});
   if(upload.error&&!(['409','400'].includes(String(upload.error.statusCode))&&/exist|duplicate/i.test(upload.error.message||'')))throw upload.error;
   const blob=unwrap(await store.download(path)),read=await blob.text();
   if(await sha256(read)!==expected||read!==text)throw Error('Rückleseprüfung fehlgeschlagen');
  };
  const parts=[];
  for(const descriptor of job.manifest.parts){
   const part=await call('part',{...lease,part:descriptor.part});
   await verified(partPath(job.prefix,descriptor.part),part.data,descriptor.sha256);
   parts.push({sha256:descriptor.sha256});
  }
  const headHash=await sha256(job.head);
  await verified(job.prefix+'manifest.json',job.head,headHash);
  return await call('complete',{...lease,head_sha256:headHash,parts});
 }catch(error){
  if(job?.lease)await call('fail',{lease:job.lease,error:String(error?.message||'Auslagerung fehlgeschlagen').slice(0,1000)}).catch(()=>{});
  throw error;
 }
}
export async function authorizedPart(caller,admin,{company_id,archive_id,part}){
 if(!Number.isInteger(part)||part<0)throw Error('Ungültiges Archivpaket');
 const access=async action=>unwrap(await caller.rpc('manager_audit_archive',{p_action:action,p_company_id:company_id,p_args:{archive_id,part,storage_v:1}}));
 const first=await access('part');
 if(!first?.storage)return first;
 const info=await access('open'),descriptor=info.manifest.parts[part];
 if(!descriptor)throw Error('Ungültiges Archivpaket');
 const blob=unwrap(await admin.storage.from(BUCKET).download(company_id+'/'+archive_id+'/part-'+part+'.json'));
 const text=await blob.text();
 if(await sha256(text)!==descriptor.sha256)throw Error('Archiv-Prüfsumme stimmt nicht');
 // Check permissions and privacy generation again after the external read.
 const final=await access('part'),latest=await access('open');
 if(!final?.storage||latest.signature!==info.signature)throw Error('Archivzugriff hat sich geändert');
 return {part,data:text};
}
