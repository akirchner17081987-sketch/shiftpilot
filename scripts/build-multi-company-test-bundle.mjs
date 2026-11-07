// Generates a rollback-only test script; this is not a production migration.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=join(dirname(fileURLToPath(import.meta.url)),'..','drafts','multi-company-roles');
const manifest=JSON.parse(readFileSync(join(root,'review-bundle-manifest.json'),'utf8'));
if(manifest.status!=='DRAFT_ONLY_NOT_FOR_PRODUCTION'||!Array.isArray(manifest.files))throw Error('Invalid test bundle manifest');
const seen=new Set();
const parts=manifest.files.map(({path,sha256})=>{
 if(!/^[a-z0-9-]+\.sql$/.test(path)||seen.has(path))throw Error('Invalid or duplicate candidate path');
 seen.add(path);
 const content=readFileSync(join(root,path),'utf8');
 if(createHash('sha256').update(content).digest('hex')!==sha256)throw Error(`Candidate changed since review: ${path}`);
 return `\n-- ${path}\n${content}\n`;
});
process.stdout.write('-- TEST ONLY: inspect destination and run only on an isolated test database.\n-- This is not a production migration. The transaction must be rolled back.\nBEGIN;\n'+parts.join('')+'\nROLLBACK;\n');
