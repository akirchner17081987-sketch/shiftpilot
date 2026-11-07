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
let existing=execFileSync(process.execPath,[join(dir,'build-multi-company-test-bundle.mjs')],{encoding:'utf8'});
if(!existing.endsWith('\nROLLBACK;\n')) throw Error('Unexpected rollback bundle');
// The public SQL wrapper requires the private function to exist when it is
// created. Put the reviewed final definition at the earlier location instead
// of creating an obsolete function and replacing it later.
const start='CREATE OR REPLACE FUNCTION private.claim_multi_company_invite(p_token text)';
const end=/end \$function\$\s*;/i;
const first=existing.indexOf(start);
const second=existing.indexOf(start,first+start.length);
if(first<0||second<0||existing.indexOf(start,second+start.length)!==-1) throw Error('Unexpected invitation definitions');
const oldEnd=end.exec(existing.slice(first));
const newEnd=end.exec(existing.slice(second));
if(!oldEnd||!newEnd) throw Error('Unable to delimit invitation definitions');
const finalDefinition=existing.slice(second,second+newEnd.index+newEnd[0].length);
existing=existing.slice(0,first)+finalDefinition+existing.slice(first+oldEnd.index+oldEnd[0].length,second)+existing.slice(second+newEnd.index+newEnd[0].length);
const index=readChecked(manifest.index);
// The two legacy disruption tests originally relied on pre-existing QA users.
// Construct equivalent synthetic records inside each test's savepoint instead.
const disruptionSetup=`DO $sf_fixture$
DECLARE owner_ uuid:=gen_random_uuid(); person_ uuid:=gen_random_uuid(); a_ uuid:=gen_random_uuid(); b_ uuid:=gen_random_uuid();
BEGIN
 INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES
 (owner_,'sf-rehearsal-owner@example.invalid',now(),'{}'),(person_,'sf-rehearsal-person@example.invalid',now(),'{}');
 INSERT INTO public.companies(id,name,created_by) VALUES
 (a_,'QA Mehrunternehmen Verwaltung',owner_),(b_,'QA Mehrunternehmen B 1107',owner_);
 INSERT INTO public.company_members(company_id,user_id,role,status,access_role) VALUES
 (a_,owner_,'OWNER','ACTIVE','OWNER'),(b_,owner_,'OWNER','ACTIVE','OWNER');
 INSERT INTO public.company_compliance_policy(company_id) VALUES(a_),(b_) ON CONFLICT(company_id) DO NOTHING;
 INSERT INTO public.employees(company_id,first_name,last_name,personnel_no,auth_user_id,access_status,status) VALUES
 (a_,'QA','Synthetic A','QA-1107-A',person_,'ACTIVE','active'),
 (b_,'QA','Synthetic B','QA-1107-B',person_,'ACTIVE','active');
END $sf_fixture$;\n`;
const tests=manifest.tests.map((item,i)=>{
 const sql=readChecked(item);
 const outer=/^((?:\s*--[^\n]*\n)*)\s*begin;\s*([\s\S]*?)\s*rollback;\s*$/i.exec(sql);
 if(!outer) throw Error(`Expected one outer test transaction: ${item.path}`);
 let body=outer[2],setup='';
 if(item.path.startsWith('productionlike-disruption-')){
  const oldOwner='a.kirchner17081987+sfqa1105@gmail.com',oldPerson='a.kirchner17081987+sfgemeinsam1106@gmail.com';
  if(!body.includes(oldOwner)||!body.includes(oldPerson)) throw Error(`Expected QA accounts missing: ${item.path}`);
  body=body.replaceAll(oldOwner,'sf-rehearsal-owner@example.invalid').replaceAll(oldPerson,'sf-rehearsal-person@example.invalid');
  setup=disruptionSetup;
 }
 return `\n-- ${item.path}\nSAVEPOINT sf_case_${i};\n${setup}${body}\nROLLBACK TO SAVEPOINT sf_case_${i};\nRELEASE SAVEPOINT sf_case_${i};\n`;
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
