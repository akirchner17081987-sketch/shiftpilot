import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const sha256Re=/^[a-f0-9]{64}$/i;
const bucketRe=/^[a-z0-9][a-z0-9._-]{0,62}$/;

function assertBucket(bucket){
  const normalized=String(bucket||'');
  if(!bucketRe.test(normalized))throw new Error('INVALID_BUCKET');
  return normalized;
}

function canonicalRoot(rootDir){
  const root=fs.realpathSync(path.resolve(String(rootDir||'')));
  if(!fs.statSync(root).isDirectory())throw new Error('INVALID_STORAGE_ROOT');
  return root;
}

function relativeObjectPath(root,file){
  const relative=path.relative(root,file);
  if(!relative||relative==='..'||relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative)){
    throw new Error('OBJECT_OUTSIDE_STORAGE_ROOT');
  }
  return relative.split(path.sep).join('/');
}

async function sha256File(file){
  const hash=crypto.createHash('sha256');
  await new Promise((resolve,reject)=>{
    const stream=fs.createReadStream(file);
    stream.on('data',chunk=>hash.update(chunk));
    stream.on('error',reject);
    stream.on('end',resolve);
  });
  return hash.digest('hex');
}

async function walkFiles(root,current=root,rows=[]){
  const entries=fs.readdirSync(current,{withFileTypes:true})
    .sort((a,b)=>a.name.localeCompare(b.name,'en'));
  for(const entry of entries){
    const file=path.join(current,entry.name);
    if(entry.isSymbolicLink())throw new Error('SYMLINK_NOT_ALLOWED');
    if(entry.isDirectory())await walkFiles(root,file,rows);
    else if(entry.isFile())rows.push(file);
    else throw new Error('UNSUPPORTED_STORAGE_ENTRY');
  }
  return rows;
}

export async function buildStorageManifest(rootDir,bucket){
  const normalizedBucket=assertBucket(bucket);
  const root=canonicalRoot(rootDir);
  const files=await walkFiles(root);
  const rows=[];
  for(const file of files){
    const stat=fs.statSync(file);
    rows.push({
      bucket:normalizedBucket,
      path:relativeObjectPath(root,file),
      size:stat.size,
      sha256:await sha256File(file)
    });
  }
  return rows.sort((a,b)=>a.path.localeCompare(b.path,'en'));
}

function indexManifest(rows,label){
  const map=new Map();
  for(const raw of rows||[]){
    const bucket=String(raw?.bucket||'');
    const path=String(raw?.path||'');
    const size=Number(raw?.size);
    const sha256=String(raw?.sha256||'').toLowerCase();
    if(!bucket||!path||!Number.isSafeInteger(size)||size<0||!sha256Re.test(sha256)){
      throw new Error(`INVALID_${label.toUpperCase()}_MANIFEST`);
    }
    const key=`${bucket}/${path}`;
    if(map.has(key))throw new Error(`DUPLICATE_${label.toUpperCase()}_OBJECT`);
    map.set(key,{bucket,path,size,sha256});
  }
  return map;
}

export function compareStorageManifests(expectedRows,restoredRows){
  const expected=indexManifest(expectedRows,'expected');
  const restored=indexManifest(restoredRows,'restored');
  const missing=[],unexpected=[],mismatched=[];
  for(const [key,item] of expected){
    const actual=restored.get(key);
    if(!actual){missing.push(key);continue}
    if(item.size!==actual.size||item.sha256!==actual.sha256)mismatched.push(key);
  }
  for(const key of restored.keys())if(!expected.has(key))unexpected.push(key);
  missing.sort();unexpected.sort();mismatched.sort();
  return {ok:missing.length===0&&unexpected.length===0&&mismatched.length===0,
    expectedCount:expected.size,restoredCount:restored.size,missing,unexpected,mismatched};
}

export async function verifyStorageDirectory(expectedRows,restoredRoot,bucket){
  return compareStorageManifests(expectedRows,await buildStorageManifest(restoredRoot,bucket));
}

export function resolveManifestPath(outputFile,rootDir){
  const root=canonicalRoot(rootDir);
  const requested=path.resolve(outputFile);
  const output=path.join(fs.realpathSync(path.dirname(requested)),path.basename(requested));
  const relative=path.relative(root,output);
  const inside=relative===''||(
    relative!=='..'&&!relative.startsWith(`..${path.sep}`)&&!path.isAbsolute(relative)
  );
  if(inside){
    throw new Error('MANIFEST_MUST_BE_OUTSIDE_STORAGE_ROOT');
  }
  return output;
}

async function runCli(argv){
  const [command,bucket,rootDir,manifestFile]=argv;
  if(!['create','verify'].includes(command)||!bucket||!rootDir||!manifestFile){
    throw new Error('USAGE: create|verify <bucket> <storage-directory> <manifest.json>');
  }
  const output=resolveManifestPath(manifestFile,rootDir);
  if(command==='create'){
    const manifest=await buildStorageManifest(rootDir,bucket);
    fs.writeFileSync(output,`${JSON.stringify(manifest,null,2)}\n`,{encoding:'utf8',flag:'wx'});
    process.stdout.write(`${JSON.stringify({ok:true,count:manifest.length,manifest:output})}\n`);
    return;
  }
  const expected=JSON.parse(fs.readFileSync(output,'utf8'));
  const result=await verifyStorageDirectory(expected,rootDir,bucket);
  process.stdout.write(`${JSON.stringify(result,null,2)}\n`);
  if(!result.ok)process.exitCode=1;
}

const invoked=process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href;
if(invoked)runCli(process.argv.slice(2)).catch(error=>{
  process.stderr.write(`${error?.message||'STORAGE_MANIFEST_FAILED'}\n`);
  process.exitCode=2;
});
