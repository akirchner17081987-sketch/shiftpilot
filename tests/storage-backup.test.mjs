import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile as fsRead,mkdtemp,rm,mkdir,symlink,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {createHash,createHmac,hkdfSync,createDecipheriv,randomBytes} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {AwsClient} from 'aws4fetch';
import {keyring,digest,snapshotKey,completionKey,validateManifest,readCompletedSnapshot,workerHandler,performStep,MAX_OBJECT} from '../supabase/functions/_shared/storage-backup-core.mjs';
import {S3Store,s3Configuration,signedS3Fetch} from '../supabase/functions/_shared/storage-backup-s3.mjs';
import {restoreSnapshot} from '../scripts/storage-backup-restore.mjs';
const project='aaaaaaaaaaaaaaaaaaaa',bucket='personnel-documents',master=Buffer.alloc(32,23).toString('base64'),token='fixture-dispatch-token-with-at-least-32-characters';
const migration=await fsRead(new URL('../supabase/migrations/20261016190309_serverless_storage_backup.sql',import.meta.url),'utf8');
const bootstrap=`create schema private;create schema storage;create schema vault;create schema net;create schema cron;
create role anon;create role authenticated;create role service_role;grant usage on schema public to anon,authenticated,service_role;
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb,updated_at timestamptz default now(),version text default 'v1');
create table vault.decrypted_secrets(name text,decrypted_secret text);
create table net.calls(url text,headers jsonb,body jsonb);
create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds int) returns bigint language plpgsql as $$begin insert into net.calls values(url,headers,body);return 1;end$$;
create table cron.jobs(name text,schedule text,command text);
create function cron.schedule(text,text,text) returns bigint language plpgsql as $$begin insert into cron.jobs values($1,$2,$3);return 1;end$$;`;
async function database(){const db=new PGlite();await db.exec(bootstrap);await db.exec(migration);return db;}
async function value(db,sql,args=[]){return (await db.query(sql,args)).rows[0]?.v;}
async function enable(db,empty=false){await db.query('update private.storage_backup_config set enabled=true,project_ref=$1,allow_empty=$2',[project,empty]);}
async function inventory(db,files){await db.query('delete from storage.objects');for(const [name,bytes] of files)await db.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',[bucket,name,JSON.stringify({size:bytes.length})]);}
async function s3Fixture(t){
 const objects=new Map(),requests=[];let offline=false,hold=false;
 const server=createServer(async(req,res)=>{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const body=Buffer.concat(chunks);requests.push({method:req.method,url:req.url,headers:req.headers,body});
  if(hold)return;
  if(offline){res.writeHead(503).end();return;}
  // Verify the actual AWS v4 signature, independently of aws4fetch.
  try{
   const auth=req.headers.authorization,match=/Credential=fixture-access\/(\d{8})\/eu-central-1\/s3\/aws4_request, SignedHeaders=([^,]+), Signature=([a-f0-9]{64})/.exec(auth||'');assert.ok(match);
   const [,day,signed,signature]=match,hash=x=>createHash('sha256').update(x).digest('hex'),hmac=(k,x)=>createHmac('sha256',k).update(x).digest();
   const bodyHash=req.headers['x-amz-content-sha256']||hash(body);
   if(bodyHash!=='UNSIGNED-PAYLOAD')assert.equal(bodyHash,hash(body));
   const headers=signed.split(';').map(name=>name+':'+req.headers[name].trim().replace(/\s+/g,' ')+'\n').join('');
   const u=new URL(req.url,'http://localhost'),canonical=[req.method,u.pathname,u.searchParams.toString(),headers,signed,bodyHash].join('\n');
   const signing=hmac(hmac(hmac(hmac('AWS4fixture-secret',day),'eu-central-1'),'s3'),'aws4_request');
   assert.equal(createHmac('sha256',signing).update(['AWS4-HMAC-SHA256',req.headers['x-amz-date'],day+'/eu-central-1/s3/aws4_request',hash(canonical)].join('\n')).digest('hex'),signature);
  }catch{res.writeHead(403).end();return;}
  if(req.method==='GET'){const b=objects.get(req.url);res.writeHead(b?200:404).end(b);}
  else if(req.method==='PUT'){
   if(req.headers['if-none-match']!=='*'){res.writeHead(400).end();return;}
   if(objects.has(req.url)){res.writeHead(412).end();return;}
   objects.set(req.url,body);res.writeHead(200).end();
  }else res.writeHead(405).end();
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));
 const config={endpoint:'http://127.0.0.1:'+server.address().port,bucket:'fixture-backup',prefix:'schichtfunk/v1',region:'eu-central-1',accessKeyId:'fixture-access',secretAccessKey:'fixture-secret'};
 const aws=new AwsClient({...config,service:'s3',retries:0});
 return {objects,requests,store:new S3Store(config,signedS3Fetch(aws)),timedStore:signal=>new S3Store(config,signedS3Fetch(aws,signal)),offline(v){offline=v;},hold(v){hold=v;}};
}
async function worker(db,store,files,keys){return workerHandler({token,configured:true,
 claim:()=>value(db,'select public.storage_backup_worker_claim() as v'),
 save:(j,result,error)=>value(db,'select public.storage_backup_worker_commit($1,$2,$3,$4) as v',[j.id,j.lease,result,error]),
 dependencies:async()=>({store,keys,source:async path=>{const b=files.get(path);if(!b)throw Error('SOURCE_DOWNLOAD_FAILED');return b;}})});}
const request=()=>new Request('https://fixture.invalid',{method:'POST',headers:{'x-storage-backup-token':token}});
async function drive(db,handler,id){for(let i=0;i<40;i++){const phase=await value(db,'select phase as v from private.storage_backup_runs where id=$1',[id]);if(['COMPLETE','FAILED'].includes(phase))return phase;const r=await handler(request());assert.equal(r.status,200,JSON.stringify(await r.json()));}throw Error('TEST_WORKER_STALLED');}

test('AES-GCM envelope interoperates with independent Node crypto and authenticates key, scope and bytes',async()=>{
 const keys=await keyring(master,project,bucket),plain=Buffer.from('Nur fiktive Personaldaten – ÄÖÜ'),sha=await digest(plain),key=await keys.blobKey(sha),cipher=await keys.seal(plain,key);
 const raw=Buffer.from(master,'base64'),salt=Buffer.from('SchichtFunk storage v1 '+project);
 const addressKey=hkdfSync('sha256',raw,salt,Buffer.from('addresses'),32);
 assert.equal(key,'blobs/'+createHmac('sha256',addressKey).update('key-id').digest('hex').slice(0,16)+'/'+createHmac('sha256',addressKey).update(bucket+'|'+sha).digest('hex'));
 const decipher=createDecipheriv('aes-256-gcm',hkdfSync('sha256',raw,salt,Buffer.from('encryption'),32),cipher.subarray(5,17));
 decipher.setAAD(Buffer.from(JSON.stringify(['SchichtFunkStorage',1,project,bucket,key])));decipher.setAuthTag(cipher.subarray(-16));
 assert.deepEqual(Buffer.concat([decipher.update(cipher.subarray(17,-16)),decipher.final()]),plain);
 const altered=cipher.slice();altered[20]^=1;await assert.rejects(()=>keys.open(altered,key),/AUTHENTICATION/);
 await assert.rejects(()=>(async()=>{const k=await keyring(Buffer.alloc(32,24).toString('base64'),project,bucket);return k.open(cipher,key);})(),/AUTHENTICATION/);
 await assert.rejects(()=>(async()=>{const k=await keyring(master,project,'other');return k.open(cipher,key);})(),/AUTHENTICATION/);
 await assert.rejects(()=>keyring('short',project,bucket),/INVALID_BACKUP_KEY/);
});

test('SQL queue + signed HTTP S3 + independent restore survives loss of the original source; unchanged content deduplicates',async t=>{
 const db=await database();let closed=false;t.after(()=>closed?undefined:db.close());const remote=await s3Fixture(t),keys=await keyring(master,project,bucket);
 const same=Buffer.from('%PDF-1.7\nFiktiver Personalnachweis\n'),files=new Map([['firma-a/ä-test.pdf',same],['firma-b/gleich.pdf',same],['firma-b/leer.pdf',Buffer.alloc(0)]]);
 assert.equal(await value(db,'select private.storage_backup_start() as v'),null);assert.equal(await value(db,'select private.storage_backup_dispatch() as v'),0);
 await enable(db);await inventory(db,files);const handler=await worker(db,remote.store,files,keys),first=await value(db,'select private.storage_backup_start() as v');
 assert.equal(await value(db,'select private.storage_backup_start() as v'),first);
 assert.equal(await drive(db,handler,first),'COMPLETE');
 const blobs=()=>[...remote.objects.keys()].filter(k=>k.includes('/blobs/'));assert.equal(blobs().length,2);
 const puts=()=>remote.requests.filter(r=>r.method==='PUT'&&r.url.includes('/blobs/')).length,initialPuts=puts();
 const second=await value(db,'select private.storage_backup_start() as v');assert.equal(await drive(db,handler,second),'COMPLETE');assert.equal(puts(),initialPuts);
 // Version replacement and deletion preserve the old encrypted snapshot.
 files.set('firma-a/ä-test.pdf',Buffer.from('Neue fiktive Version'));files.delete('firma-b/gleich.pdf');await inventory(db,files);
 const third=await value(db,'select private.storage_backup_start() as v');assert.equal(await drive(db,handler,third),'COMPLETE');assert.equal(blobs().length,3);
 assert.equal(await value(db,"select private.storage_backup_health()->'healthy' as v"),true);
 const expected=new Map([['firma-a/ä-test.pdf',same],['firma-b/gleich.pdf',same],['firma-b/leer.pdf',Buffer.alloc(0)]]);
 files.clear();closed=true;await db.close(); // Restore has no database or original Storage access.
 const temp=await mkdtemp(join(tmpdir(),'sf-restore-'));t.after(()=>rm(temp,{recursive:true,force:true}));
 const result=await restoreSnapshot({store:remote.store,keys,id:first,destination:join(temp,'restored')});assert.equal(result.files,3);
 for(const [name,bytes] of expected){const restored=await fsRead(join(temp,'restored',name));assert.deepEqual(restored,bytes);assert.equal(await digest(restored),await digest(bytes));assert.equal((await stat(join(temp,'restored',name))).mode&0o777,0o600);}
 await assert.rejects(()=>restoreSnapshot({store:remote.store,keys,id:first,destination:join(temp,'restored')}),/EEXIST/);
 await mkdir(join(temp,'outside'));await symlink(join(temp,'outside'),join(temp,'linked'));
 await assert.rejects(()=>restoreSnapshot({store:remote.store,keys,id:first,destination:join(temp,'linked')}),/EEXIST/);
 for(const [name,bytes] of remote.objects){assert.ok(!name.includes('firma-'));assert.ok(!bytes.includes(same));}
 assert.ok(remote.requests.every(r=>['GET','PUT'].includes(r.method)));
});

test('upload-before-commit crash retries the same object; stale leases and repeated commits cannot advance the queue',async t=>{
 const db=await database();t.after(()=>db.close());const remote=await s3Fixture(t),keys=await keyring(master,project,bucket),files=new Map([['test.pdf',Buffer.from('Fixture')]]);
 await enable(db);await inventory(db,files);const id=await value(db,'select private.storage_backup_start() as v');
 const old=await value(db,'select public.storage_backup_worker_claim() as v');
 assert.equal(await value(db,'select public.storage_backup_worker_claim() as v'),null);
 const deps={store:remote.store,keys,source:async p=>files.get(p)},result=await performStep(old,deps);
 await db.query("update private.storage_backup_runs set lease_until=now()-interval '1 second' where id=$1",[id]);
 const retry=await value(db,'select public.storage_backup_worker_claim() as v');assert.notEqual(retry.lease,old.lease);
 await assert.rejects(()=>value(db,'select public.storage_backup_worker_commit($1,$2,$3,null) as v',[id,old.lease,result]),/STALE_BACKUP_LEASE/);
 const recovered=await performStep(retry,deps);assert.deepEqual(recovered,result);
 await value(db,'select public.storage_backup_worker_commit($1,$2,$3,null) as v',[id,retry.lease,recovered]);
 await assert.rejects(()=>value(db,'select public.storage_backup_worker_commit($1,$2,$3,null) as v',[id,retry.lease,recovered]),/STALE_BACKUP_LEASE/);
 assert.equal(remote.requests.filter(r=>r.method==='PUT').length,1);
 assert.equal(await drive(db,await worker(db,remote.store,files,keys),id),'COMPLETE');
});

test('wrong key, incomplete snapshot, missing/corrupted objects and oversized remote responses fail closed',async t=>{
 const remote=await s3Fixture(t),keys=await keyring(master,project,bucket),id=crypto.randomUUID(),bytes=Buffer.from('Fixture'),deps={store:remote.store,keys,source:async()=>bytes};
 const file=await performStep({phase:'COPY',project,bucket,item:{path:'safe/test.pdf',size:bytes.length}},deps);
 const job={id,project,bucket,files:[file],captured_at:'2026-10-16T00:00:00Z'};
 await performStep({...job,phase:'PUBLISH'},deps);
 await assert.rejects(()=>readCompletedSnapshot(remote.store,keys,id),/NOT_COMPLETED/);
 await performStep({...job,phase:'FINALIZE'},deps);
 const temp=await mkdtemp(join(tmpdir(),'sf-failure-'));t.after(()=>rm(temp,{recursive:true,force:true}));
 const wrong=await keyring(Buffer.alloc(32,99).toString('base64'),project,bucket);
 await assert.rejects(()=>restoreSnapshot({store:remote.store,keys:wrong,id,destination:join(temp,'wrong')}),/NOT_COMPLETED/);
 const url=new URL(remote.store.url(file.blob)).pathname,original=remote.objects.get(url);remote.objects.delete(url);
 await assert.rejects(()=>restoreSnapshot({store:remote.store,keys,id,destination:join(temp,'missing')}),/BACKUP_OBJECT_MISSING/);
 const corrupt=Buffer.from(original);corrupt[19]^=1;remote.objects.set(url,corrupt);
 await assert.rejects(()=>restoreSnapshot({store:remote.store,keys,id,destination:join(temp,'corrupt')}),/CIPHERTEXT_HASH_MISMATCH/);
 remote.objects.set(url,Buffer.alloc(MAX_OBJECT+34));await assert.rejects(()=>remote.store.get(file.blob,MAX_OBJECT+33),/REMOTE_OBJECT_TOO_LARGE/);
});

test('untrusted callers and missing configuration stop before database or network access',async()=>{
 let calls=0;const handler=workerHandler({token,configured:false,claim:()=>{calls++;},dependencies:()=>{calls++;}});
 assert.equal((await handler(new Request('https://fixture.invalid',{method:'POST'}))).status,401);
 assert.equal((await handler(new Request('https://fixture.invalid',{method:'GET'}))).status,405);
 assert.equal((await handler(request())).status,503);assert.equal(calls,0);
 const ready=workerHandler({token,configured:true,claim:async()=>null});assert.equal((await ready(request())).status,200);
});

test('the invocation deadline aborts a stalled signed HTTP transfer',async t=>{
 const remote=await s3Fixture(t);remote.hold(true);const started=Date.now();
 await assert.rejects(()=>remote.timedStore(AbortSignal.timeout(50)).get('test',1024),/REMOTE_UNAVAILABLE/);
 assert.ok(Date.now()-started<1000);
});

test('SQL grants prevent anon/employee access including forged user metadata; service role has only worker APIs',async t=>{
 const db=await database();t.after(()=>db.close());
 for(const role of ['anon','authenticated']){
  await db.exec(`set role ${role};select set_config('request.jwt.claims','{"role":"authenticated","user_metadata":{"role":"service_role"}}',false);`);
  await assert.rejects(()=>db.query('select public.storage_backup_worker_claim()'),/permission denied/);
  await assert.rejects(()=>db.query('select public.storage_backup_worker_commit(null,null,null,null)'),/permission denied/);
  await assert.rejects(()=>db.query('select * from private.storage_backup_runs'),/permission denied/);
  await db.exec('reset role');
 }
 await db.exec('set role service_role');assert.equal(await value(db,'select public.storage_backup_worker_claim() as v'),null);
 await assert.rejects(()=>db.query('select * from private.storage_backup_runs'),/permission denied/);
 await assert.rejects(()=>db.query('select private.storage_backup_start()'),/permission denied/);
 await db.exec('reset role');
 const funcs=(await db.query("select proname,prosecdef,proconfig from pg_proc where proname like 'storage_backup_%'")).rows;
 for(const f of funcs){assert.ok(f.proconfig.includes('search_path=""'));if(f.proname.startsWith('storage_backup_worker_'))assert.equal(f.prosecdef,false);}
 assert.equal(await value(db,'select count(*)::int as v from cron.jobs'),2);
});

test('source changes cannot publish a completed snapshot; empty and size limits are enforced',async t=>{
 const db=await database();t.after(()=>db.close());await enable(db);
 await assert.rejects(()=>value(db,'select private.storage_backup_start() as v'),/BACKUP_UNEXPECTED_EMPTY/);
 await db.query("insert into storage.objects(bucket_id,name,metadata) values($1,'too-large.pdf','{\"size\":10485761}')",[bucket]);
 await assert.rejects(()=>value(db,'select private.storage_backup_start() as v'),/BACKUP_OBJECT_LIMIT/);
 await db.query("update storage.objects set metadata='{\"size\":null}'");await assert.rejects(()=>value(db,'select private.storage_backup_start() as v'),/BACKUP_INVALID_SIZE/);
 const remote=await s3Fixture(t),keys=await keyring(master,project,bucket),files=new Map([['test.pdf',Buffer.from('One')]]);
 await inventory(db,files);const id=await value(db,'select private.storage_backup_start() as v'),handler=await worker(db,remote.store,files,keys);
 assert.equal((await handler(request())).status,200);assert.equal((await handler(request())).status,200); // COPY, VERIFY
 await db.query("update storage.objects set version='v2'");assert.equal(await value(db,'select public.storage_backup_worker_claim() as v'),null);
 assert.equal(await value(db,'select last_error as v from private.storage_backup_runs where id=$1',[id]),'SOURCE_INVENTORY_CHANGED');
 assert.equal(remote.objects.has(new URL(remote.store.url(completionKey(keys,id))).pathname),false);
 await db.query('delete from storage.objects');await db.query('update private.storage_backup_config set allow_empty=true');
 const empty=await value(db,'select private.storage_backup_start() as v');assert.equal(await drive(db,handler,empty),'COMPLETE');
});

test('S3 outages exhaust bounded retries and never mark a backup healthy; idle dispatcher makes no HTTP request',async t=>{
 const db=await database();t.after(()=>db.close());const remote=await s3Fixture(t),keys=await keyring(master,project,bucket),files=new Map([['test.pdf',Buffer.from('One')]]);
 await enable(db);await inventory(db,files);assert.equal(await value(db,'select private.storage_backup_dispatch() as v'),0);
 const id=await value(db,'select private.storage_backup_start() as v');assert.equal(await value(db,'select private.storage_backup_dispatch() as v'),0); // no Vault token
 await db.query('insert into vault.decrypted_secrets values($1,$2)',['storage_backup_dispatch_token',token]);
 assert.equal(await value(db,'select private.storage_backup_dispatch() as v'),1);assert.equal(await value(db,'select private.storage_backup_dispatch() as v'),0);
 assert.equal(await value(db,'select count(*)::int as v from net.calls'),1);
 remote.offline(true);const handler=await worker(db,remote.store,files,keys);
 for(let i=0;i<3;i++)assert.equal((await handler(request())).status,503);
 assert.equal(await value(db,'select phase as v from private.storage_backup_runs where id=$1',[id]),'FAILED');
 assert.equal(await value(db,"select private.storage_backup_health()->'healthy' as v"),false);
 assert.equal(await value(db,'select private.storage_backup_dispatch() as v'),0);
});

test('restore rejects traversal, duplicate/prefix paths, malformed snapshot IDs and non-IONOS/unsafe endpoints',async()=>{
 const keys=await keyring(master,project,bucket),id=crypto.randomUUID(),base={format:1,id,project,bucket};
 const file=path=>({path,size:0,sha:'a'.repeat(64),cipherSha:'b'.repeat(64),blob:'blobs/'+keys.keyId+'/'+'c'.repeat(64)});
 for(const p of ['../escape','/absolute','a/../b','a\\b','a//b','a\u0000b'])assert.throws(()=>validateManifest({...base,files:[file(p)]},keys,id),/UNSAFE/);
 assert.throws(()=>validateManifest({...base,files:[file('a'),file('a/b')]},keys,id),/CONFLICTING/);
 assert.throws(()=>validateManifest({...base,files:[file('a'),file('a')]},keys,id),/INVALID_MANIFEST/);
 assert.throws(()=>snapshotKey(keys,'-'.repeat(36)),/INVALID_SNAPSHOT_ID/);
 const config={BACKUP_S3_ENDPOINT:'https://s3.eu-central-1.ionoscloud.com',BACKUP_S3_BUCKET:'backup-fixture',BACKUP_S3_REGION:'eu-central-1',BACKUP_S3_ACCESS_KEY_ID:'fixture',BACKUP_S3_SECRET_ACCESS_KEY:'fixture'};
 assert.equal(s3Configuration(config).region,'eu-central-1');
 for(const endpoint of ['http://127.0.0.1','https://s3.eu-central-1.ionoscloud.com.evil.test','https://user:pass@s3.eu-central-1.ionoscloud.com','https://s3.eu-central-1.ionoscloud.com/private'])assert.throws(()=>s3Configuration({...config,BACKUP_S3_ENDPOINT:endpoint}),/INVALID_BACKUP_ENDPOINT/);
});
