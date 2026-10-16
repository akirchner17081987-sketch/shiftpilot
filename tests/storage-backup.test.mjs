import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {configuration,inventory,assertComplete,health,drill,verifyPayload,restore,backup} from '../scripts/storage-backup.mjs';
import {buildStorageManifest} from '../scripts/storage-restore-manifest.mjs';
const env={RESTIC_REPOSITORY:'s3:https://backup.example.invalid/private/storage',SF_BACKUP_PROJECT_REF:'abcdefghijklmnopqrst',
 SF_BACKUP_SOURCE_REGION:'eu-central-1',SF_BACKUP_SOURCE_ACCESS_KEY_ID:'synthetic-source',SF_BACKUP_SOURCE_SECRET_ACCESS_KEY:'synthetic-secret',
 AWS_ACCESS_KEY_ID:'synthetic-dest',AWS_SECRET_ACCESS_KEY:'synthetic-dest-secret',AWS_DEFAULT_REGION:'eu-central-4',
 RESTIC_PASSWORD_FILE:'/private/password',SF_BACKUP_WORK_ROOT:'/private/work',SF_BACKUP_STATE_ROOT:'/private/state'};
test('configuration rejects missing credentials, insecure or same-provider targets and embedded URL secrets',()=>{
 assert.equal(configuration(env).bucket,'personnel-documents');
 for(const repository of ['/tmp/local','s3:http://example.invalid/bucket','s3:https://abcdefgh.supabase.co/bucket','s3:https://user:secret@example.invalid/bucket'])assert.throws(()=>configuration({...env,RESTIC_REPOSITORY:repository}));
 assert.throws(()=>configuration({...env,SF_BACKUP_SOURCE_SECRET_ACCESS_KEY:''}),/MISSING/);
 assert.throws(()=>configuration({...env,SF_BACKUP_MAX_BYTES:'NaN'}),/INVALID_LIMIT/);
 const recovered={...env};delete recovered.SF_BACKUP_SOURCE_ACCESS_KEY_ID;delete recovered.SF_BACKUP_SOURCE_SECRET_ACCESS_KEY;delete recovered.SF_BACKUP_SOURCE_REGION;
 assert.equal(configuration(recovered,false).sourceSecret,null,'restore does not need the lost source credentials');
});
test('inventory rejects traversal, duplicates, special paths and oversize exports',()=>{
 const row={Path:'company/file.pdf',Size:7,IsDir:false,ModTime:'2026-10-16T00:00:00Z'};
 assert.equal(inventory([row],10).total,7);
 for(const Path of ['../secret','/absolute','company/../secret','a\\b','a//b','a/./b','a\0b'])assert.throws(()=>inventory([{...row,Path}],10),/UNSAFE/);
 assert.throws(()=>inventory([row,row],20),/INVALID/);
 assert.throws(()=>inventory([row],6),/LIMIT/);
 assert.throws(()=>assertComplete(inventory([row],10),[]),/INCOMPLETE/);
});
test('freshness monitor rejects overdue and failed runs while retaining last valid recovery point',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'sf-health-'));
 try{
 const now=Date.now(),success={ok:true,mode:'storage',objects:2,verifiedAt:new Date(now).toISOString()};
 await fs.writeFile(path.join(root,'last-success.json'),JSON.stringify(success));await fs.writeFile(path.join(root,'last-run.json'),JSON.stringify({ok:true}));
 assert.equal((await health(root,26,now)).ok,true);
 await assert.rejects(health(root,26,now,{project:'foreign',bucket:'personnel-documents'}),/WRONG_HEALTH_SCOPE/);
 await assert.rejects(health(root,26,now+27*3600000),/NOT_HEALTHY/);
 await fs.writeFile(path.join(root,'last-run.json'),JSON.stringify({ok:false}));await assert.rejects(health(root,26,now),/NOT_HEALTHY/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('restore validation rejects changed, missing and unexpected files, wrong scope and symlinks',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'sf-verify-'));
 try{
 await fs.mkdir(path.join(root,'objects'));await fs.writeFile(path.join(root,'objects','fictitious.txt'),'original');
 const manifest=await buildStorageManifest(path.join(root,'objects'),'personnel-documents');
 await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest));await fs.writeFile(path.join(root,'metadata.json'),JSON.stringify({format:1,project:'fixture',bucket:'personnel-documents'}));
 const scope={project:'fixture',bucket:'personnel-documents'};
 assert.equal((await verifyPayload(root,scope)).objects,1);
 await assert.rejects(verifyPayload(root,{...scope,project:'foreign'}),/WRONG_SNAPSHOT_SCOPE/);
 await fs.writeFile(path.join(root,'objects','fictitious.txt'),'tampered');await assert.rejects(verifyPayload(root,scope),/HASH_MISMATCH/);
 await fs.rm(path.join(root,'objects','fictitious.txt'));await assert.rejects(verifyPayload(root,scope),/HASH_MISMATCH/);
 await fs.writeFile(path.join(root,'objects','fictitious.txt'),'original');await fs.writeFile(path.join(root,'objects','extra.txt'),'extra');await assert.rejects(verifyPayload(root,scope),/HASH_MISMATCH/);
 await fs.rm(path.join(root,'objects','extra.txt'));await fs.symlink('/etc/hostname',path.join(root,'objects','link'));await assert.rejects(verifyPayload(root,scope),/SYMLINK/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('restore requires an exact snapshot and refuses an existing target before invoking any external tool',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'sf-restore-'));
 try{
 const passwordFile=path.join(root,'password');await fs.writeFile(passwordFile,'fictitious-strong-password-for-test-only',{mode:0o600});
 const c={passwordFile,workRoot:root,restic:'/does-not-exist'};
 await assert.rejects(restore(c,'latest',path.join(root,'new')),/EXPLICIT_SNAPSHOT/);
 await assert.rejects(restore(c,'abcd1234',root),{code:'EEXIST'});
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
const binary=process.env.SF_RESTIC_BIN||'restic';let installed=false;
try{execFileSync(binary,['version'],{stdio:'ignore',timeout:5000});installed=true;}catch{}
test('real encrypted repository survives staged source deletion and passes byte-for-byte restore plus repository check',{skip:!installed&&!process.env.SF_BACKUP_REQUIRE_DRILL},async()=>{
 assert.equal(installed,true,'restic is required for the encrypted restore drill');
 const result=await drill(binary);assert.equal(result.ok,true);assert.equal(result.objects,2);
 assert.equal(result.stagingDeletedBeforeRestore,true);assert.equal(result.productionAccess,false);
 assert.match(result.snapshot,/^[a-f0-9]{8,64}$/);
});
const rcloneBinary=process.env.SF_RCLONE_BIN||'rclone';let rcloneInstalled=false;
try{execFileSync(rcloneBinary,['version'],{stdio:'ignore',timeout:5000});rcloneInstalled=true;}catch{}
test('full runner uses real copy and encryption tools, cleans staging, records verified success and alarms on unexpected empty source',{skip:(!installed||!rcloneInstalled)&&!process.env.SF_BACKUP_REQUIRE_DRILL},async()=>{
 assert.ok(installed&&rcloneInstalled,'restic and rclone are required for the complete fixture pipeline');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'sf-full-backup-'));
 try{
 const source=path.join(root,'fixture-source'),work=path.join(root,'work'),state=path.join(root,'state');
 await fs.mkdir(source,{mode:0o700});await fs.mkdir(work,{mode:0o700});await fs.mkdir(state,{mode:0o700});
 await fs.writeFile(path.join(source,'Fiktiv ü.txt'),'FICTITIOUS test content');await fs.writeFile(path.join(source,'empty.txt'),'');
 const passwordFile=path.join(root,'password');await fs.writeFile(passwordFile,'fictitious-repository-password-only-for-test',{mode:0o600});
 const repository=path.join(root,'encrypted-repository');
 execFileSync(binary,['--no-cache','init'],{env:{...process.env,RESTIC_REPOSITORY:repository,RESTIC_PASSWORD_FILE:passwordFile},stdio:'ignore'});
 const adapter=path.join(root,'fixture-rclone');
 // Only the fixture adapter maps the remote source to a local directory; production has no such switch.
 await fs.writeFile(adapter,'#!/usr/bin/env node\nconst {spawnSync}=require("node:child_process");const args=process.argv.slice(2).map(x=>x==="sfsource:personnel-documents"?'+JSON.stringify(source)+':x);const r=spawnSync('+JSON.stringify(rcloneBinary)+',args,{stdio:"inherit"});process.exit(r.status===null?1:r.status);\n',{mode:0o700});
 const c={...configuration(env),repository,passwordFile,workRoot:work,stateRoot:state,restic:binary,rclone:adapter,allowEmpty:true};
 const result=await backup(c);assert.equal(result.objects,2);assert.equal(result.stagingDeletedBeforeRestore,true);
 assert.equal((await health(state,26,Date.now(),{project:c.project,bucket:c.bucket})).ok,true);
 assert.deepEqual(await fs.readdir(work),[]);assert.equal((await fs.stat(path.join(state,'last-success.json'))).mode&0o077,0);
 await fs.rm(source,{recursive:true});await fs.mkdir(source,{mode:0o700});
 await assert.rejects(backup(c),/SOURCE_UNEXPECTEDLY_EMPTY/);
 await assert.rejects(health(state),/NOT_HEALTHY/);
 assert.equal(JSON.parse(await fs.readFile(path.join(state,'last-success.json'),'utf8')).snapshot,result.snapshot);
 assert.deepEqual(await fs.readdir(work),[]);assert.equal((await fs.readdir(state)).includes('running.lock'),false);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
