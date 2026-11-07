// Isolated-database rehearsal only. This is deliberately not a migration.
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const dir=dirname(fileURLToPath(import.meta.url));
const root=join(dir,'..','drafts','multi-company-roles');
const manifest=JSON.parse(readFileSync(join(root,'clean-baseline-test-manifest.json'),'utf8'));
if(manifest.status!=='ISOLATED_TEST_ONLY') throw Error('Invalid rehearsal manifest');
const readChecked=({path,sha256})=>{
 if(!/^[a-z0-9-]+\.sql$/.test(path)) throw Error('Invalid rehearsal path');
 const value=readFileSync(join(root,path),'utf8');
 if(createHash('sha256').update(value).digest('hex')!==sha256) throw Error(`Rehearsal input changed: ${path}`);
 return value;
};
const existing=execFileSync(process.execPath,[join(dir,'build-multi-company-test-bundle.mjs')],{encoding:'utf8'});
if(!existing.endsWith('\nROLLBACK;\n')) throw Error('Unexpected rollback bundle');
const index=readChecked(manifest.index);
const tests=manifest.tests.map((item,i)=>{
 const sql=readChecked(item);
 const outer=/^((?:\s*--[^\n]*\n)*)\s*begin;\s*([\s\S]*?)\s*rollback;\s*$/i.exec(sql);
 if(!outer) throw Error(`Expected one outer test transaction: ${item.path}`);
 return `\n-- ${item.path}\nSAVEPOINT sf_case_${i};\n${outer[2]}\nROLLBACK TO SAVEPOINT sf_case_${i};\nRELEASE SAVEPOINT sf_case_${i};\n`;
});
const gate=`DO $gate$ BEGIN
 IF current_setting('sf.isolated_rehearsal', true) IS DISTINCT FROM 'yes' THEN
  RAISE EXCEPTION 'Isolated rehearsal opt-in missing';
 END IF;
 IF to_regclass('public.employees_auth_user_id_uidx') IS NULL OR to_regclass('public.employees_company_auth_user_id_uidx') IS NOT NULL THEN
  RAISE EXCEPTION 'Expected original index baseline absent';
 END IF;
END $gate$;\n`;
const withGate=existing.replace('BEGIN;\n','BEGIN;\n'+gate);
if(withGate===existing) throw Error('Missing transaction start');
process.stdout.write(withGate.slice(0,-'\nROLLBACK;\n'.length)+`\n-- ${manifest.index.path}\n${index}\n`+tests.join('')+'\nROLLBACK;\n');
