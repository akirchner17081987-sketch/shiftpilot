import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

test('reviewed bundle is complete, ordered and always rolls back',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../drafts/multi-company-roles/review-bundle-manifest.json',import.meta.url),'utf8'));
 const script=execFileSync(process.execPath,[new URL('../scripts/build-multi-company-test-bundle.mjs',import.meta.url).pathname],{encoding:'utf8'});
 assert.match(script,/^-- TEST ONLY:/);
 assert.match(script,/\nBEGIN;\n/);
 assert.match(script,/\nROLLBACK;\n$/);
 let previous=-1;
 for(const {path} of manifest.files){const current=script.indexOf(`\n-- ${path}\n`);assert.ok(current>previous,`missing or out of order: ${path}`);previous=current;}
 assert.ok(script.indexOf('-- production-candidate-not-for-deployment.sql')<script.indexOf('-- single-invite-claim-candidate.sql'));
 assert.ok(!script.includes('-- employee-identity-index-candidate.sql'));
});
