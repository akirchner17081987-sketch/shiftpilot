import {error,safePath} from './storage-backup-core.mjs';
// Sign separately: aws4fetch does not preserve a Request input's abort signal.
// Both the per-transfer deadline and the whole-step deadline must reach fetch.
export function signedS3Fetch(aws,deadline){
  return async(input,init)=>fetch(await aws.sign(input,init),{signal:deadline?AbortSignal.any([init.signal,deadline]):init.signal});
}
export function s3Configuration(env){
  const endpoint=env.BACKUP_S3_ENDPOINT||'',bucket=env.BACKUP_S3_BUCKET||'',prefix=env.BACKUP_S3_PREFIX||'schichtfunk/v1';
  if(!/^https:\/\/s3\.eu-[a-z0-9-]+\.ionoscloud\.com\/?$/.test(endpoint))error('INVALID_BACKUP_ENDPOINT');
  if(!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket))error('INVALID_BACKUP_BUCKET');safePath(prefix);
  for(const key of ['BACKUP_S3_ACCESS_KEY_ID','BACKUP_S3_SECRET_ACCESS_KEY','BACKUP_S3_REGION'])if(!env[key])error('BACKUP_NOT_CONFIGURED');
  return {endpoint:endpoint.replace(/\/$/,''),bucket,prefix,region:env.BACKUP_S3_REGION,accessKeyId:env.BACKUP_S3_ACCESS_KEY_ID,secretAccessKey:env.BACKUP_S3_SECRET_ACCESS_KEY};
}
export class S3Store{
  constructor(config,signedFetch){this.config=config;this.fetch=signedFetch;}
  url(key){safePath(key);const c=this.config;return c.endpoint+'/'+[c.bucket,...c.prefix.split('/'),...key.split('/')].map(encodeURIComponent).join('/');}
  async get(key,limit){
    let response;try{response=await this.fetch(this.url(key),{method:'GET',signal:AbortSignal.timeout(25000)});}catch{error('REMOTE_UNAVAILABLE');}
    if(response.status===404){await response.body?.cancel();return null;}
    if(!response.ok){await response.body?.cancel();error('REMOTE_UNAVAILABLE');}
    const parts=[];let size=0;
    for await(const part of response.body){size+=part.length;if(size>limit)error('REMOTE_OBJECT_TOO_LARGE');parts.push(part);}
    const data=new Uint8Array(size);let offset=0;for(const part of parts){data.set(part,offset);offset+=part.length;}return data;
  }
  async putIfAbsent(key,bytes){
    let response;try{response=await this.fetch(this.url(key),{method:'PUT',body:bytes,headers:{'content-type':'application/octet-stream','if-none-match':'*'},signal:AbortSignal.timeout(25000)});}catch{error('REMOTE_UNAVAILABLE');}
    await response.body?.cancel();if(response.status===412)return false;if(!response.ok)error('REMOTE_UNAVAILABLE');return true;
  }
}
