import { cp, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const output = new URL('../dist/', import.meta.url);
const files = [
  '.htaccess', 'index.html', 'demo.html', 'demo-abschluss.html',
  'qr-time.html', 'impressum.html', 'datenschutz.html',
  'schichtfunk-sw.js', 'site.webmanifest', 'favicon.ico'
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all(files.map(file => cp(new URL(file, root), new URL(file, output))));
await cp(new URL('assets/', root), new URL('assets/', output), { recursive: true });

const requiredOutput = [
  '.htaccess', 'index.html', 'demo.html', 'demo-abschluss.html',
  'qr-time.html', 'impressum.html', 'datenschutz.html',
  'schichtfunk-sw.js', 'site.webmanifest', 'favicon.ico',
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
if (builtManifest.start_url !== '/#app' || builtManifest.scope !== '/') throw new Error('PWA manifest start URL or scope is invalid.');

async function sizeOf(path) {
  const entry = await stat(path);
  if (entry.isFile()) return entry.size;
  const children = await readdir(path, { withFileTypes: true });
  return (await Promise.all(children.map(child => sizeOf(join(path, child.name))))).reduce((sum, size) => sum + size, 0);
}

const bytes = await sizeOf(fileURLToPath(output));
const limit = 50 * 1024 * 1024;
if (bytes >= limit) throw new Error(`Static build is ${(bytes / 1024 / 1024).toFixed(2)} MiB; Deploy Now Starter limit is 50 MiB.`);
console.log(`Static build ready: ${(bytes / 1024 / 1024).toFixed(2)} MiB (${bytes} bytes)`);
