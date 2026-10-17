#!/usr/bin/env node
// Independent disaster restore: only external S3 credentials and the escrowed key.
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {AwsClient} from 'aws4fetch';
import {keyring,readCompletedSnapshot,readFile,error} from '../supabase/functions/_shared/storage-backup-core.mjs';
import {s3Configuration,S3Store,signedS3Fetch} from '../supabase/functions/_shared/storage-backup-s3.mjs';
export async function restoreSnapshot({store,keys,id,destination}){
 const manifest=await readCompletedSnapshot(store,keys,id),root=resolve(destination);
 // An existing directory, file or symlink is always refused. No production writes.
 await mkdir(root,{mode:0o700});
 for(const file of manifest.files){
  const target=join(root,...file.path.split('/'));
  await mkdir(dirname(target),{recursive:true,mode:0o700});
  const bytes=await readFile(store,keys,file);
  await writeFile(target,bytes,{flag:'wx',mode:0o600});
 }
 return {snapshot:id,files:manifest.files.length,bytes:manifest.files.reduce((n,f)=>n+f.size,0)};
}
export async function main(env=process.env,args=process.argv.slice(2)){
 if(args.length!==2||!env.BACKUP_PROJECT_REF?.match(/^[a-z]{20}$/))error('RESTORE_USAGE');
 const config=s3Configuration(env),aws=new AwsClient({...config,service:'s3',retries:0});
 const result=await restoreSnapshot({store:new S3Store(config,signedS3Fetch(aws)),keys:await keyring(env.BACKUP_MASTER_KEY_B64,env.BACKUP_PROJECT_REF,'personnel-documents'),id:args[0],destination:args[1]});
 process.stdout.write(JSON.stringify(result)+'\n');return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{
 const code=/^[A-Z0-9_]{1,64}$/.test(e.message)?e.message:'RESTORE_FAILED';
 process.stderr.write(code+'\n');process.exitCode=1;
});
