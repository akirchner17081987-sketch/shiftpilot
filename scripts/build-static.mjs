import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hardenStaticCsp } from './harden-static-csp.mjs';

const root = new URL('../', import.meta.url);
const output = new URL('../dist/', import.meta.url);
const files = [
  '.htaccess', 'index.html', 'demo.html', 'demo-abschluss.html',
  'qr-time.html', 'impressum.html', 'datenschutz.html',
  'schichtfunk-sw.js', 'site.webmanifest', 'favicon.ico', 'offline.html'
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all(files.map(file => cp(new URL(file, root), new URL(file, output))));
await cp(new URL('assets/', root), new URL('assets/', output), { recursive: true });
const externalScripts=await hardenStaticCsp(output);

// Every directly loaded module/style belongs to this build's exact contents.
// Stable filenames with an older manual version must not reuse stale HTTP caches.
for (const page of files.filter(file=>file.endsWith('.html'))) {
  const target=new URL(page,output);
  let html=await readFile(target,'utf8');
  const tags=[...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"[^>]*>/g)];
  for (const match of tags) {
    const url=new URL(match[1],'https://build.invalid/');
    if(url.origin!=='https://build.invalid'||!url.pathname.startsWith('/assets/')||! /\.(?:m?js|css)$/.test(url.pathname))continue;
    const content=await readFile(new URL('.'+url.pathname,output));
    url.searchParams.set('sfv',createHash('sha256').update(content).digest('hex').slice(0,16));
    const reference=url.pathname+url.search;
    html=html.replace(match[0],match[0].replace(match[1],reference));
  }
  await writeFile(target,html);
}

// Content-based release ID: identical output has the same ID, including local QA.
async function fingerprint(directory, prefix='') {
  const parts=[];
  for(const name of (await readdir(directory)).sort()){
    const path=new URL(name,directory),entry=await stat(path);
    if(entry.isDirectory())parts.push(...await fingerprint(new URL(name+'/',directory),prefix+name+'/'));
    else parts.push(prefix+name,await readFile(path));
  }
  return parts;
}
const releaseHash=createHash('sha256');
for(const part of await fingerprint(output))releaseHash.update(part);
const version=releaseHash.digest('hex').slice(0,20);
await writeFile(new URL('pwa-release.json',output),JSON.stringify({version})+'\n');
for(const page of ['index.html','qr-time.html']){
  const file=new URL(page,output),html=await readFile(file,'utf8');
  await writeFile(file,html.replace('</head>','<meta name="sf-release" content="'+version+'">\n</head>'));
}
const workerFile=new URL('schichtfunk-sw.js',output);
await writeFile(workerFile,(await readFile(workerFile,'utf8')).replace("const RELEASE='source';","const RELEASE='"+version+"';"));

const requiredOutput = [
  '.htaccess', 'index.html', 'demo.html', 'demo-abschluss.html',
  'qr-time.html', 'impressum.html', 'datenschutz.html',
  'schichtfunk-sw.js', 'site.webmanifest', 'favicon.ico', 'offline.html', 'pwa-release.json',
  'assets/schichtfunk-app-icon-192.png',
  'assets/schichtfunk-app-icon-512.png',
  'assets/schichtfunk-app-icon-maskable-512.png',
  'assets/demo-api-v2.js'
];

for (const file of requiredOutput) {
  const entry = await stat(new URL(file, output));
  if (!entry.isFile() || entry.size === 0) throw new Error(`Required static output is missing or empty: ${file}`);
}

const builtIndex = await readFile(new URL('index.html', output), 'utf8');
if (!/rel="manifest" href="\/site\.webmanifest"/.test(builtIndex)) throw new Error('Static index does not reference the PWA manifest.');
const builtManifest = JSON.parse(await readFile(new URL('site.webmanifest', output), 'utf8'));
if (builtManifest.start_url !== '/' || builtManifest.scope !== '/') throw new Error('PWA manifest start URL or scope is invalid.');

async function sizeOf(path) {
  const entry = await stat(path);
  if (entry.isFile()) return entry.size;
  const children = await readdir(path, { withFileTypes: true });
  return (await Promise.all(children.map(child => sizeOf(join(path, child.name))))).reduce((sum, size) => sum + size, 0);
}

const bytes = await sizeOf(fileURLToPath(output));
const limit = 50 * 1024 * 1024;
if (bytes >= limit) throw new Error(`Static build is ${(bytes / 1024 / 1024).toFixed(2)} MiB; Deploy Now Starter limit is 50 MiB.`);
console.log(`CSP: ${externalScripts} executable inline scripts moved to same-origin assets.`);
console.log(`Static build ready: ${(bytes / 1024 / 1024).toFixed(2)} MiB (${bytes} bytes)`);
