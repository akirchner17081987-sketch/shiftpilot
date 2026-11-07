// Generates a deliberately non-executable review draft, never a migration.
import {execFileSync} from 'node:child_process';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const dir=dirname(fileURLToPath(import.meta.url));
const tested=execFileSync(process.execPath,[join(dir,'build-multi-company-clean-baseline-test.mjs')],{encoding:'utf8',maxBuffer:8*1024*1024});
const first='\n-- company-options-candidate.sql\n';
const test='\n-- productionlike-invitation-creation-rollback-test.sql\n';
const start=tested.indexOf(first), end=tested.indexOf(test);
if(start<0 || end<=start || tested.indexOf(first,start+1)!==-1 || tested.indexOf(test,end+1)!==-1) throw Error('Unexpected rehearsal boundaries');
const sql=tested.slice(start,end);
if(!sql.includes('-- employee-identity-index-candidate.sql')) throw Error('Missing index transition');
if(sql.includes('SAVEPOINT sf_case_') || sql.includes('sf-rehearsal-owner@example.invalid')) throw Error('Test fixture leaked into review draft');
const marker='CREATE OR REPLACE FUNCTION private.claim_multi_company_invite(p_token text)';
if(sql.split(marker).length!==2) throw Error('Invitation function must have exactly one definition');
process.stdout.write(`-- REVIEW DRAFT ONLY. NOT A MIGRATION. DO NOT APPLY.\n-- Derived from the checksum-verified isolated rehearsal; the release has not been approved.\n-- Removing the guard or copying SQL into a migration requires a new full review and tests.\nBEGIN;\nDO $review_only$ BEGIN RAISE EXCEPTION 'Review draft is intentionally blocked; not for execution'; END $review_only$;\n${sql}\nROLLBACK;\n`);
