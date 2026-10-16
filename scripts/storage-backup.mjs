// Server-only runner. Never include credentials, manifests or payloads in the static build.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pathToFileURL} from 'node:url';
import {randomBytes} from 'node:crypto';
import {buildStorageManifest,verifyStorageDirectory} from './storage-restore-manifest.mjs';

const exec=promisify(execFile),tag='schichtfunk-storage-v1';
const fail=code=>{throw new Error(code)};
const required=(env,key)=>env[key]||fail('MISSING_'+key);
const positive=(value,fallback)=>{const n=Number(value??fallback);if(!Number.isSafeInteger(n)||n<1)fail('INVALID_LIMIT');return n};
export function configuration(env=process.env,requireSource=true){
  const repository=required(env,'RESTIC_REPOSITORY');
  if(!repository.startsWith('s3:https://'))fail('INDEPENDENT_HTTPS_S3_REPOSITORY_REQUIRED');
  const dest=new URL(repository.slice(3));
  if(dest.username||dest.password||dest.search||dest.hash||dest.pathname.split('/').filter(Boolean).length<1)fail('INVALID_REPOSITORY');
  if(/(^|\.)supabase\.(co|in)$/i.test(dest.hostname))fail('INDEPENDENT_BACKUP_PROVIDER_REQUIRED');
  const project=required(env,'SF_BACKUP_PROJECT_REF');
  if(!/^[a-z]{20}$/.test(project))fail('INVALID_PROJECT_REF');
  const bucket=env.SF_BACKUP_BUCKET||'personnel-documents';
  if(!/^[a-z0-9][a-z0-9._-]{0,62}$/.test(bucket))fail('INVALID_BUCKET');
  return {repository,project,bucket,host:'sf-'+project,region:requireSource?required(env,'SF_BACKUP_SOURCE_REGION'):null,
    sourceAccess:requireSource?required(env,'SF_BACKUP_SOURCE_ACCESS_KEY_ID'):null,sourceSecret:requireSource?required(env,'SF_BACKUP_SOURCE_SECRET_ACCESS_KEY'):null,
    destinationAccess:required(env,'AWS_ACCESS_KEY_ID'),destinationSecret:required(env,'AWS_SECRET_ACCESS_KEY'),
    destinationRegion:required(env,'AWS_DEFAULT_REGION'),passwordFile:required(env,'RESTIC_PASSWORD_FILE'),
    workRoot:required(env,'SF_BACKUP_WORK_ROOT'),stateRoot:required(env,'SF_BACKUP_STATE_ROOT'),
    restic:env.SF_RESTIC_BIN||'restic',rclone:env.SF_RCLONE_BIN||'rclone',
    maxBytes:positive(env.SF_BACKUP_MAX_BYTES,1073741824),maxAgeHours:positive(env.SF_BACKUP_MAX_AGE_HOURS,26),
    allowEmpty:env.SF_BACKUP_ALLOW_EMPTY==='true'};
}
async function privateDirectory(dir){
  await fs.mkdir(dir,{recursive:true,mode:0o700});
  const s=await fs.lstat(dir);
  if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o077))fail('PRIVATE_DIRECTORY_REQUIRED');
  return fs.realpath(dir);
}
async function passwordGuard(file){
  const s=await fs.lstat(file);
  if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o077))fail('PRIVATE_PASSWORD_FILE_REQUIRED');
  if((await fs.readFile(file,'utf8')).trim().length<24)fail('STRONG_REPOSITORY_PASSWORD_REQUIRED');
}
function baseEnv(){return {PATH:process.env.PATH,HOME:process.env.HOME,LANG:'C.UTF-8',TZ:'UTC'};}
async function command(binary,args,env,cwd){
  try{return (await exec(binary,args,{env,cwd,timeout:3600000,maxBuffer:32*1024*1024})).stdout;}
  catch{fail(binary.endsWith('rclone')?'SOURCE_COMMAND_FAILED':'REPOSITORY_COMMAND_FAILED');}
}
function resticEnv(c){return {...baseEnv(),RESTIC_REPOSITORY:c.repository,RESTIC_PASSWORD_FILE:c.passwordFile,
  RESTIC_CACHE_DIR:path.join(c.workRoot,'cache'),AWS_ACCESS_KEY_ID:c.destinationAccess,
  AWS_SECRET_ACCESS_KEY:c.destinationSecret,AWS_DEFAULT_REGION:c.destinationRegion};}
function sourceEnv(c){return {...baseEnv(),RCLONE_CONFIG_SFSOURCE_TYPE:'s3',RCLONE_CONFIG_SFSOURCE_PROVIDER:'Other',
  RCLONE_CONFIG_SFSOURCE_ENDPOINT:'https://'+c.project+'.storage.supabase.co/storage/v1/s3',
  RCLONE_CONFIG_SFSOURCE_REGION:c.region,RCLONE_CONFIG_SFSOURCE_ACCESS_KEY_ID:c.sourceAccess,
  RCLONE_CONFIG_SFSOURCE_SECRET_ACCESS_KEY:c.sourceSecret,RCLONE_CONFIG_SFSOURCE_FORCE_PATH_STYLE:'true'};}
const restic=(c,args,cwd)=>command(c.restic,['--no-cache',...args],resticEnv(c),cwd);
const rclone=(c,args)=>command(c.rclone,['--config','/dev/null','--log-level','ERROR',...args],sourceEnv(c));
export function inventory(rows,maxBytes){
  if(!Array.isArray(rows))fail('INVALID_SOURCE_INVENTORY');
  const seen=new Set();let total=0;
  const normalized=rows.map(x=>{
    const name=x.Path;
    if(typeof name!=='string'||name.startsWith('/')||name.includes('\\')||name.includes('\0')||name.split('/').some(p=>!p||p==='.'||p==='..'))fail('UNSAFE_OBJECT_PATH');
    if(seen.has(name)||x.IsDir||!Number.isSafeInteger(x.Size)||x.Size<0)fail('INVALID_SOURCE_OBJECT');
    seen.add(name);total+=x.Size;
    if(!Number.isSafeInteger(total)||total>maxBytes)fail('SOURCE_SIZE_LIMIT_EXCEEDED');
    return {path:name,size:x.Size,modified:x.ModTime,hashes:x.Hashes||{}};
  }).sort((a,b)=>a.path.localeCompare(b.path,'en'));
  return {rows:normalized,total};
}
export function assertComplete(remote,manifest){
  const local=manifest.map(x=>({path:x.path,size:x.size}));
  if(JSON.stringify(remote.rows.map(x=>({path:x.path,size:x.size})))!==JSON.stringify(local))fail('INCOMPLETE_SOURCE_COPY');
}
export async function verifyPayload(root,expected){
  const entries=(await fs.readdir(root)).sort();
  if(JSON.stringify(entries)!==JSON.stringify(['manifest.json','metadata.json','objects']))fail('INVALID_RESTORE_LAYOUT');
  for(const name of ['manifest.json','metadata.json'])if(!(await fs.lstat(path.join(root,name))).isFile())fail('INVALID_RESTORE_LAYOUT');
  if(!(await fs.lstat(path.join(root,'objects'))).isDirectory())fail('INVALID_RESTORE_LAYOUT');
  const metadata=JSON.parse(await fs.readFile(path.join(root,'metadata.json'),'utf8'));
  if(metadata.format!==1||metadata.project!==expected.project||metadata.bucket!==expected.bucket)fail('WRONG_SNAPSHOT_SCOPE');
  const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
  const result=await verifyStorageDirectory(manifest,path.join(root,'objects'),expected.bucket);
  if(!result.ok)fail('RESTORE_HASH_MISMATCH');
  return {objects:manifest.length,bytes:manifest.reduce((n,x)=>n+x.size,0)};
}
// Used both by the production export and the fixture drill. Restore only to a fresh local directory.
export async function createVerifiedSnapshot(c,objects,workspace){
  const payload=path.join(workspace,'payload');
  await fs.mkdir(payload,{mode:0o700});
  await fs.rename(objects,path.join(payload,'objects'));
  const manifest=await buildStorageManifest(path.join(payload,'objects'),c.bucket);
  await fs.writeFile(path.join(payload,'manifest.json'),JSON.stringify(manifest),{mode:0o600,flag:'wx'});
  await fs.writeFile(path.join(payload,'metadata.json'),JSON.stringify({format:1,project:c.project,bucket:c.bucket,capturedAt:new Date().toISOString()}),{mode:0o600,flag:'wx'});
  const output=await restic(c,['backup','payload','--json','--host',c.host,'--tag',tag,'--tag',c.project],workspace);
  const summary=output.trim().split('\n').map(s=>JSON.parse(s)).find(x=>x.message_type==='summary');
  if(!/^[a-f0-9]{8,64}$/.test(summary?.snapshot_id||''))fail('SNAPSHOT_ID_MISSING');
  await fs.rm(payload,{recursive:true});
  const restored=path.join(workspace,'verified-restore');
  await fs.mkdir(restored,{mode:0o700});
  await restic(c,['restore',summary.snapshot_id,'--target',restored]);
  const result=await verifyPayload(path.join(restored,'payload'),c);
  // Independent comparison with the pre-backup manifest, not only the restored manifest.
  if(!(await verifyStorageDirectory(manifest,path.join(restored,'payload','objects'),c.bucket)).ok)fail('RESTORE_HASH_MISMATCH');
  return {...result,snapshot:summary.snapshot_id,verifiedAt:new Date().toISOString(),stagingDeletedBeforeRestore:true};
}
export async function restore(c,snapshot,target){
  if(!/^[a-f0-9]{8,64}$/.test(snapshot||''))fail('EXPLICIT_SNAPSHOT_REQUIRED');
  await passwordGuard(c.passwordFile);await privateDirectory(c.workRoot);
  // EEXIST is intentionally fatal. Never restore over a source or an existing export.
  await fs.mkdir(target,{mode:0o700});
  await restic(c,['restore',snapshot,'--target',target]);
  const result=await verifyPayload(path.join(target,'payload'),c);
  return {ok:true,...result,snapshot,verifiedAt:new Date().toISOString(),productionWrite:false};
}
async function writeState(c,name,data){
  const file=path.join(c.stateRoot,name),temporary=file+'.'+process.pid+'.tmp';
  await fs.writeFile(temporary,JSON.stringify(data,null,2)+'\n',{mode:0o600,flag:'wx'});
  await fs.rename(temporary,file);
}
export async function backup(c){
  await passwordGuard(c.passwordFile);await privateDirectory(c.workRoot);await privateDirectory(c.stateRoot);
  const lock=path.join(c.stateRoot,'running.lock');
  try{await fs.mkdir(lock,{mode:0o700});}catch{fail('BACKUP_ALREADY_RUNNING_OR_STALE_LOCK');}
  const start=Date.now();let workspace;
  try{
    workspace=await fs.mkdtemp(path.join(c.workRoot,'export-'));
    const list=async()=>inventory(JSON.parse(await rclone(c,['lsjson','sfsource:'+c.bucket,'--recursive','--files-only','--hash'])),c.maxBytes);
    const before=await list();
    if(!before.rows.length&&!c.allowEmpty)fail('EMPTY_SOURCE_NOT_APPROVED');
    if(!before.rows.length){
      let previous;
      try{previous=JSON.parse(await fs.readFile(path.join(c.stateRoot,'last-success.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
      if(previous?.objects>0)fail('SOURCE_UNEXPECTEDLY_EMPTY');
    }
    const objects=path.join(workspace,'objects');await fs.mkdir(objects,{mode:0o700});
    await rclone(c,['copy','sfsource:'+c.bucket,objects,'--max-transfer',String(c.maxBytes),'--cutoff-mode','hard','--checkers','2','--transfers','2']);
    const manifest=await buildStorageManifest(objects,c.bucket);assertComplete(before,manifest);
    if(JSON.stringify(before)!==JSON.stringify(await list()))fail('SOURCE_CHANGED_DURING_BACKUP');
    const verified=await createVerifiedSnapshot(c,objects,workspace);
    const result={ok:true,mode:'storage',project:c.project,bucket:c.bucket,...verified,durationMs:Date.now()-start};
    await writeState(c,'last-success.json',result);await writeState(c,'last-run.json',result);return result;
  }catch(e){await writeState(c,'last-run.json',{ok:false,code:/^[A-Z_]+$/.test(e.message)?e.message:'BACKUP_FAILED',at:new Date().toISOString()});throw e;}
  finally{try{if(workspace)await fs.rm(workspace,{recursive:true,force:true});}finally{await fs.rmdir(lock);}}
}
export async function health(stateRoot,maxAgeHours=26,now=Date.now(),expected){
  const success=JSON.parse(await fs.readFile(path.join(stateRoot,'last-success.json'),'utf8'));
  const last=JSON.parse(await fs.readFile(path.join(stateRoot,'last-run.json'),'utf8'));
  const age=now-Date.parse(success.verifiedAt);
  if(expected&&(success.project!==expected.project||success.bucket!==expected.bucket))fail('WRONG_HEALTH_SCOPE');
  if(!last.ok||!success.ok||success.mode!=='storage'||!Number.isFinite(age)||age<0||age>maxAgeHours*3600000)fail('BACKUP_NOT_HEALTHY');
  return {ok:true,ageHours:Math.round(age/36000)/100,objects:success.objects};
}
export async function drill(binary='restic'){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'sf-backup-drill-'));
  try{
    const passwordFile=path.join(root,'password');await fs.writeFile(passwordFile,randomBytes(32).toString('base64'),{mode:0o600});
    const objects=path.join(root,'objects');await fs.mkdir(path.join(objects,'synthetic-company'),{recursive:true,mode:0o700});
    await fs.writeFile(path.join(objects,'synthetic-company','fixture.txt'),'FICTITIOUS SchichtFunk restore fixture\n',{mode:0o600});
    await fs.writeFile(path.join(objects,'empty.txt'),'');
    const c={repository:path.join(root,'encrypted-repository'),passwordFile,workRoot:root,restic:binary,host:'fictitious-drill',project:'fictitious',bucket:'personnel-documents'};
    await restic(c,['init']);const start=Date.now();
    const result=await createVerifiedSnapshot(c,objects,root);
    await restic(c,['check','--read-data']);
    return {ok:true,mode:'local-encrypted-fixture',...result,durationMs:Date.now()-start,productionAccess:false};
  }finally{await fs.rm(root,{recursive:true,force:true});}
}
async function main(){
  process.umask(0o077);
  const action=process.argv[2];let result;
  if(action==='drill')result=await drill(process.env.SF_RESTIC_BIN||'restic');
  else if(action==='health')result=await health(required(process.env,'SF_BACKUP_STATE_ROOT'),positive(process.env.SF_BACKUP_MAX_AGE_HOURS,26),Date.now(),{project:required(process.env,'SF_BACKUP_PROJECT_REF'),bucket:process.env.SF_BACKUP_BUCKET||'personnel-documents'});
  else{const c=configuration(process.env,['backup','check-config'].includes(action));
    if(action==='check-config'){await passwordGuard(c.passwordFile);result={ok:true,configured:true,networkAccess:false};}
    else if(action==='init'){await passwordGuard(c.passwordFile);await privateDirectory(c.workRoot);await restic(c,['init']);result={ok:true,initialized:true};}
    else if(action==='backup')result=await backup(c);
    else if(action==='restore')result=await restore(c,process.argv[3],required(process.env,'SF_BACKUP_RESTORE_DIR'));
    else fail('USAGE_CHECK_CONFIG_INIT_BACKUP_RESTORE_HEALTH_DRILL');
  }
  process.stdout.write(JSON.stringify(result)+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(e=>{
  process.stderr.write(JSON.stringify({ok:false,code:/^[A-Z_]+$/.test(e.message)?e.message:'BACKUP_FAILED'})+'\n');process.exitCode=1;
});
