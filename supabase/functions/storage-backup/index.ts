import {createClient} from 'npm:@supabase/supabase-js@2.116.0';
import {AwsClient} from 'npm:aws4fetch@1.0.20';
import {workerHandler,keyring,error,MAX_OBJECT} from '../_shared/storage-backup-core.mjs';
import {S3Store,s3Configuration,signedS3Fetch} from '../_shared/storage-backup-s3.mjs';

const env=Deno.env.toObject(),project=new URL(env.SUPABASE_URL).hostname.split('.')[0];
const configured=['BACKUP_MASTER_KEY_B64','BACKUP_S3_ENDPOINT','BACKUP_S3_BUCKET','BACKUP_S3_REGION','BACKUP_S3_ACCESS_KEY_ID','BACKUP_S3_SECRET_ACCESS_KEY'].every(k=>!!env[k]);
let admin:any;
const auth={persistSession:false,autoRefreshToken:false};
const client=()=>admin||(admin=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth,global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(15000)})}}));
async function rpc(name:string,args={}){const r=await client().rpc(name,args);if(r.error)error('BACKUP_DATABASE_FAILED');return r.data;}
Deno.serve(workerHandler({
 token:env.BACKUP_DISPATCH_TOKEN,configured,
 claim:()=>rpc('storage_backup_worker_claim'),
 save:(job:any,result:any,code:any)=>rpc('storage_backup_worker_commit',{p_id:job.id,p_lease:job.lease,p_result:result,p_error:code}),
 dependencies:async({signal}:{signal:AbortSignal})=>{
  const config=s3Configuration(env),aws=new AwsClient({...config,service:'s3',retries:0});
  const sourceClient=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth,global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.any([signal,AbortSignal.timeout(25000)])})}});
  return {keys:await keyring(env.BACKUP_MASTER_KEY_B64,project,'personnel-documents'),
   store:new S3Store(config,signedS3Fetch(aws,signal)),
   source:async(name:string,size:number)=>{
    const r=await sourceClient.storage.from('personnel-documents').download(name);
    if(r.error||!r.data)throw new Error('SOURCE_DOWNLOAD_FAILED');
    if(r.data.size!==size||r.data.size>MAX_OBJECT)error('SOURCE_SIZE_CHANGED');
    return new Uint8Array(await r.data.arrayBuffer());
   }};
 }
}));
