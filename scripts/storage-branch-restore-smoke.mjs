import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';

const url=process.env.SUPABASE_TEST_URL;
const key=process.env.SUPABASE_TEST_ANON_KEY;
const bucket=process.env.SUPABASE_TEST_BUCKET||'privacy-restore-fixture';
if(!url||!key)throw new Error('SUPABASE_TEST_URL and SUPABASE_TEST_ANON_KEY are required');

const objectPath=`codex-restore-test/${randomUUID()}/fixture.txt`;
const original=Buffer.from('SchichtFunk fictitious storage restore fixture\n','utf8');
const sha256=value=>createHash('sha256').update(value).digest('hex');
const manifest={bucket,path:objectPath,size:original.length,sha256:sha256(original)};
const storageUrl=`${url.replace(/\/$/,'')}/storage/v1`;
const encodedPath=objectPath.split('/').map(encodeURIComponent).join('/');
const headers={apikey:key,Authorization:`Bearer ${key}`};

const fail=(step,error)=>{throw new Error(`${step}: ${error?.message||error}`)};
const upload=async bytes=>{
  const response=await fetch(`${storageUrl}/object/${encodeURIComponent(bucket)}/${encodedPath}`,{
    method:'POST',headers:{...headers,'content-type':'text/plain','cache-control':'max-age=0','x-upsert':'false'},body:bytes
  });
  if(!response.ok)fail('upload',`${response.status} ${await response.text()}`);
};
const download=async()=>{
  const response=await fetch(`${storageUrl}/object/${encodeURIComponent(bucket)}/${encodedPath}`,{headers});
  if(!response.ok)fail('download',`${response.status} ${await response.text()}`);
  return Buffer.from(await response.arrayBuffer());
};
const remove=async()=>{
  const response=await fetch(`${storageUrl}/object/${encodeURIComponent(bucket)}`,{
    method:'DELETE',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({prefixes:[objectPath]})
  });
  if(!response.ok)fail('remove',`${response.status} ${await response.text()}`);
  const data=await response.json();
  assert.equal(data?.length,1,'remove must report exactly one object');
};
const listFolder=async()=>{
  const prefix=objectPath.split('/').slice(0,-1).join('/');
  const response=await fetch(`${storageUrl}/object/list/${encodeURIComponent(bucket)}`,{
    method:'POST',headers:{...headers,'content-type':'application/json'},
    body:JSON.stringify({prefix,limit:100,offset:0,sortBy:{column:'name',order:'asc'}})
  });
  if(!response.ok)fail('list',`${response.status} ${await response.text()}`);
  return response.json();
};

let cleanupNeeded=false;
try{
  await upload(original);
  cleanupNeeded=true;
  const exported=await download();
  assert.deepEqual({size:exported.length,sha256:sha256(exported)},{size:manifest.size,sha256:manifest.sha256});

  await remove();
  cleanupNeeded=false;
  const afterDelete=await listFolder();
  assert.equal(afterDelete.some(item=>item.name==='fixture.txt'),false,'source object must be absent before restore');

  await upload(exported);
  cleanupNeeded=true;
  const restored=await download();
  assert.deepEqual({size:restored.length,sha256:sha256(restored)},{size:manifest.size,sha256:manifest.sha256});

  await remove();
  cleanupNeeded=false;
  const afterCleanup=await listFolder();
  assert.equal(afterCleanup.some(item=>item.name==='fixture.txt'),false,'restored fixture must be removed');

  console.log(JSON.stringify({ok:true,manifest,sourceDeleted:true,restoreVerified:true,cleanupVerified:true}));
}finally{
  if(cleanupNeeded)await remove();
}
