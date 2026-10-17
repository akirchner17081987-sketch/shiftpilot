// Versioned AES-256-GCM envelopes; HKDF-separated encryption and address keys.
// This module is shared by the Edge worker and the independent offline restore.
const te=new TextEncoder(),td=new TextDecoder('utf-8',{fatal:true});
export const MAX_OBJECT=10*1024*1024,MAX_MANIFEST=2*1024*1024;
export const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
export const error=code=>{throw new Error(code)};
export const digest=async bytes=>hex(await crypto.subtle.digest('SHA-256',bytes));
export function safePath(value){
  if(typeof value!=='string'||!value||value.length>1024||value.includes('\\')||/[\x00-\x1f\x7f]/.test(value)||value.split('/').some(p=>!p||p==='.'||p==='..'))error('UNSAFE_OBJECT_PATH');
  return value;
}
export async function keyring(base64,project,bucket){
  if(!/^[A-Za-z0-9+/]{43}=$/.test(base64||''))error('INVALID_BACKUP_KEY');
  const raw=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));if(raw.length!==32)error('INVALID_BACKUP_KEY');
  const seed=await crypto.subtle.importKey('raw',raw,'HKDF',false,['deriveKey']);
  const derive=(info,algorithm,usages)=>crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:te.encode('SchichtFunk storage v1 '+project),info:te.encode(info)},seed,algorithm,false,usages);
  const enc=await derive('encryption',{name:'AES-GCM',length:256},['encrypt','decrypt']);
  const mac=await derive('addresses',{name:'HMAC',hash:'SHA-256',length:256},['sign']);
  const keyId=hex(await crypto.subtle.sign('HMAC',mac,te.encode('key-id'))).slice(0,16);
  const aad=key=>te.encode(JSON.stringify(['SchichtFunkStorage',1,project,bucket,key]));
  return {keyId,project,bucket,
    async blobKey(sha){if(!/^[a-f0-9]{64}$/.test(sha))error('INVALID_DIGEST');return 'blobs/'+keyId+'/'+hex(await crypto.subtle.sign('HMAC',mac,te.encode(bucket+'|'+sha)));},
    async seal(bytes,key){
      const iv=crypto.getRandomValues(new Uint8Array(12));
      const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(key),tagLength:128},enc,bytes));
      const out=new Uint8Array(17+cipher.length);out.set(te.encode('SFBK1'));out.set(iv,5);out.set(cipher,17);return out;
    },
    async open(bytes,key){
      if(bytes.length<33||td.decode(bytes.subarray(0,5))!=='SFBK1')error('INVALID_ENVELOPE');
      try{return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.subarray(5,17),additionalData:aad(key),tagLength:128},enc,bytes.subarray(17)));}
      catch{error('BACKUP_AUTHENTICATION_FAILED');}
    }
  };
}
export function snapshotKey(keys,id){if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id))error('INVALID_SNAPSHOT_ID');return 'snapshots/'+keys.keyId+'/'+id+'.bin';}
export function completionKey(keys,id){return snapshotKey(keys,id).replace('snapshots/','completed/');}
export function validateManifest(value,keys,id){
  if(value?.format!==1||value.project!==keys.project||value.bucket!==keys.bucket||value.id!==id||!Array.isArray(value.files)||value.files.length>2000)error('WRONG_SNAPSHOT_SCOPE');
  const seen=new Set();let bytes=0;
  for(const f of value.files){safePath(f.path);if(seen.has(f.path)||!Number.isSafeInteger(f.size)||f.size<0||f.size>MAX_OBJECT||!/^[a-f0-9]{64}$/.test(f.sha)||!/^[a-f0-9]{64}$/.test(f.cipherSha)||!new RegExp('^blobs/'+keys.keyId+'/[a-f0-9]{64}$').test(f.blob))error('INVALID_MANIFEST');seen.add(f.path);bytes+=f.size;}
  for(const name of seen){const parts=name.split('/');parts.pop();while(parts.length){if(seen.has(parts.join('/')))error('CONFLICTING_OBJECT_PATHS');parts.pop();}}
  if(bytes>1024*1024*1024)error('SNAPSHOT_SIZE_LIMIT');return value;
}
export async function readCompletedSnapshot(store,keys,id){
  const key=completionKey(keys,id),cipher=await store.get(key,4096);
  if(!cipher)error('SNAPSHOT_NOT_COMPLETED');
  const receipt=JSON.parse(td.decode(await keys.open(cipher,key)));
  const manifestKey=snapshotKey(keys,id),manifestCipher=await store.get(manifestKey,MAX_MANIFEST+33);
  if(receipt.id!==id||receipt.format!==1||!manifestCipher||receipt.manifestSha!==await digest(manifestCipher))error('INVALID_COMPLETION_RECEIPT');
  return readManifest(store,keys,id);
}
export async function readManifest(store,keys,id){
  const key=snapshotKey(keys,id),cipher=await store.get(key,MAX_MANIFEST+33);if(!cipher)error('SNAPSHOT_MISSING');
  let value;try{value=JSON.parse(td.decode(await keys.open(cipher,key)));}catch(e){if(e.message==='BACKUP_AUTHENTICATION_FAILED')throw e;error('INVALID_MANIFEST');}
  return validateManifest(value,keys,id);
}
export async function readFile(store,keys,file){
  const cipher=await store.get(file.blob,MAX_OBJECT+33);if(!cipher)error('BACKUP_OBJECT_MISSING');
  if(await digest(cipher)!==file.cipherSha)error('CIPHERTEXT_HASH_MISMATCH');
  const plain=await keys.open(cipher,file.blob);
  if(plain.length!==file.size||await digest(plain)!==file.sha||await keys.blobKey(file.sha)!==file.blob)error('RESTORE_HASH_MISMATCH');
  return plain;
}
export async function ensureObject(store,keys,key,plain){
  let cipher=await store.get(key,Math.max(MAX_OBJECT,MAX_MANIFEST)+33);
  if(!cipher){const fresh=await keys.seal(plain,key);if(await store.putIfAbsent(key,fresh))cipher=fresh;else cipher=await store.get(key,fresh.length);}
  if(!cipher)error('BACKUP_OBJECT_MISSING');
  const recovered=await keys.open(cipher,key);
  if(recovered.length!==plain.length||await digest(recovered)!==await digest(plain))error('IMMUTABLE_OBJECT_MISMATCH');
  return {cipherSha:await digest(cipher)};
}
export async function performStep(job,{store,keys,source}){
  if(job.project!==keys.project||job.bucket!==keys.bucket)error('WRONG_JOB_SCOPE');
  if(job.phase==='COPY'){
    const item=job.item;safePath(item.path);if(!Number.isSafeInteger(item.size)||item.size>MAX_OBJECT||item.size<0)error('OBJECT_SIZE_LIMIT');
    const plain=await source(item.path,item.size);
    if(plain.length!==item.size)error('SOURCE_SIZE_CHANGED');
    const sha=await digest(plain),blob=await keys.blobKey(sha);
    const stored=await ensureObject(store,keys,blob,plain);
    return {path:item.path,size:plain.length,sha,blob,...stored};
  }
  if(job.phase==='PUBLISH'){
    const manifest={format:1,id:job.id,project:job.project,bucket:job.bucket,capturedAt:job.captured_at,files:job.files};
    validateManifest(manifest,keys,job.id);const plain=te.encode(JSON.stringify(manifest));if(plain.length>MAX_MANIFEST)error('MANIFEST_SIZE_LIMIT');
    const key=snapshotKey(keys,job.id);await ensureObject(store,keys,key,plain);
    const recovered=await readManifest(store,keys,job.id);
    if(JSON.stringify(recovered)!==JSON.stringify(manifest))error('MANIFEST_MISMATCH');return {manifest:key};
  }
  if(job.phase==='VERIFY'){await readFile(store,keys,job.item);return {verified:true};}
  if(job.phase==='FINALIZE'){
    const manifest=await readManifest(store,keys,job.id);
    if(JSON.stringify(manifest.files)!==JSON.stringify(job.files))error('MANIFEST_MISMATCH');
    const cipher=await store.get(snapshotKey(keys,job.id),MAX_MANIFEST+33);
    if(!cipher)error('SNAPSHOT_MISSING');
    const receipt=te.encode(JSON.stringify({format:1,id:job.id,manifestSha:await digest(cipher)}));
    await ensureObject(store,keys,completionKey(keys,job.id),receipt);
    await readCompletedSnapshot(store,keys,job.id);return {verified:true};
  }
  error('INVALID_JOB_PHASE');
}
export function workerHandler({token,configured,claim,save,dependencies}){
  return async request=>{
    const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
    if(request.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405);
    const presented=request.headers.get('x-storage-backup-token')||'';
    // Fixed-length digest comparison avoids early-exit secret string comparison.
    if(!token||presented.length>256)return reply({error:'UNAUTHENTICATED'},401);
    const a=new Uint8Array(await crypto.subtle.digest('SHA-256',te.encode(presented))),b=new Uint8Array(await crypto.subtle.digest('SHA-256',te.encode(token)));
    let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];if(diff)return reply({error:'UNAUTHENTICATED'},401);
    if(!configured)return reply({error:'BACKUP_NOT_CONFIGURED'},503);
    let job;
    try{
      job=await claim();if(!job)return reply({status:'IDLE'});
      const result=await performStep(job,await dependencies({signal:AbortSignal.timeout(90000)}));await save(job,result,null);
      return reply({status:'COMMITTED',phase:job.phase});
    }catch(e){
      const code=/^[A-Z0-9_]{1,64}$/.test(e.message)?e.message:'BACKUP_STEP_FAILED';
      if(job)try{await save(job,null,code);}catch{}
      return reply({error:code},503);
    }
  };
}
