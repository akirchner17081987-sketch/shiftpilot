import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pages} from '../scripts/harden-static-csp.mjs';
const root=new URL('../',import.meta.url),read=p=>readFile(new URL(p,root),'utf8');
const vercel=JSON.parse(await read('vercel.json')),policy=vercel.headers.find(r=>r.source==='/(.*)').headers.find(h=>h.key==='Content-Security-Policy').value;
const directives=Object.fromEntries(policy.split(';').map(s=>s.trim().split(/\s+/)).filter(x=>x[0]).map(([key,...v])=>[key,v]));
execFileSync(process.execPath,['scripts/build-static.mjs'],{cwd:root,stdio:'pipe'});
test('IONOS and Vercel enforce the same local-only script policy without inline/eval/hash escape hatches',async()=>{
 const apache=await read('.htaccess');assert.ok(apache.includes('Content-Security-Policy "'+policy+'"'));
 assert.deepEqual(directives['script-src'],["'self'"]);assert.deepEqual(directives['script-src-attr'],["'none'"]);assert.deepEqual(directives['base-uri'],["'none'"]);
 assert.equal(Object.keys(directives).filter(k=>k.startsWith('script-')).length,2);
 assert.deepEqual(directives['worker-src'],["'self'",'blob:']);assert.ok(directives['connect-src'].includes('https://zbvloohfjleadjnqhbbh.supabase.co'));
 assert.match(apache,/AddType application\/javascript \.mjs/);
});
test('all deployed pages contain only existing local script files; extracted module imports stay local',async()=>{
 let count=0;
 for(const p of pages){const html=await read('dist/'+p);assert.doesNotMatch(html,/\son[a-z]+\s*=/i);assert.doesNotMatch(html,/<script\b(?![^>]*\bsrc\s*=)[^>]*>\s*\S/i);assert.doesNotMatch(html,/javascript:/i);
  for(const match of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/gi)){
   const url=new URL(match[1],'https://fixture.invalid/');assert.equal(url.origin,'https://fixture.invalid');const code=await read('dist'+url.pathname);assert.ok(code.trim());
   if(/^\/assets\/page-(?:index|demo|demo-abschluss|qr-time)-[a-f0-9]{24}\./.test(url.pathname)){count++;assert.ok(url.pathname.includes(createHash('sha256').update(code).digest('hex').slice(0,24)));}
   if(url.pathname.endsWith('.mjs'))for(const i of code.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)){const imported=new URL(i[1],url);assert.equal(imported.origin,url.origin);await read('dist'+imported.pathname);}
  }
 }assert.equal(count,13);
});
test('built script and stylesheet references change with their actual contents',async()=>{
 for(const page of pages){const html=await read('dist/'+page);
  for(const match of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"[^>]*>/g)){
   const url=new URL(match[1],'https://fixture.invalid/');if(!url.pathname.startsWith('/assets/')||! /\.(?:m?js|css)$/.test(url.pathname))continue;
   assert.equal(url.searchParams.get('sfv'),createHash('sha256').update(await readFile(new URL('dist'+url.pathname,root))).digest('hex').slice(0,16),url.pathname);
  }
 }
});
test('client libraries and license notices match the pinned npm-integrity manifest',async()=>{
 const manifest=JSON.parse(await read('assets/vendor/client-libraries.json'));assert.equal(manifest.length,5);
 for(const row of manifest){for(const [name,digest] of [[row.file,row.sha256],[row.licenseFile,row.licenseSha256]])assert.equal(createHash('sha256').update(await readFile(new URL('assets/vendor/'+name,root))).digest('hex'),digest);assert.match(row.npmIntegrity,/^sha512-/);}
 for(const file of await readdir(new URL('assets/',root))){if(!file.endsWith('.js'))continue;const code=await read('assets/'+file);assert.doesNotMatch(code,/https:\/\/cdn\.jsdelivr\.net\/npm\//);assert.doesNotMatch(code,/\son(?:click|change|input|mousedown|focus|keydown)\s*=\s*["']/);assert.doesNotMatch(code,/setAttribute\(['"]on[a-z]+['"]/);}
});
test('external actions are fixed functions with no executable-text compiler and preserve explicit assignment identity',async()=>{
 const code=await read('assets/csp-actions-v1.js');assert.doesNotMatch(code,/\beval\s*\(|new\s+Function\s*\(|\bFunction\s*\(/);assert.match(code,/startsWith\(type\+'-'\)/);
 for(const name of ['assignment-quick-delete-v1.js','supabase-absence-planning-guard-v2.js','supabase-legacy-review-v1.js','compliance-ui-v2.js']){const s=await read('assets/'+name);assert.match(s,/dataset\.assignmentId/);assert.doesNotMatch(s,/getAttribute\('onclick'\)/);}
 const sw=await read('schichtfunk-sw.js');assert.match(sw,/schichtfunk-shell-v10-pwa/);assert.match(sw,/const networkFirst=cspCritical\|\|/);
});
