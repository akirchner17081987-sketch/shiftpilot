import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
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
