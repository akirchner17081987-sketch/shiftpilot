import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { safeEqual, workerTokenAccepted } from '../supabase/functions/_shared/worker-auth.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const worker=fs.readFileSync(path.join(root,'supabase/functions/privacy-worker/index.ts'),'utf8');

test('constant-work comparison handles equal, unequal and empty strings',()=>{
  assert.equal(safeEqual('alpha-0123456789','alpha-0123456789'),true);
  assert.equal(safeEqual('alpha-0123456789','bravo-0123456789'),false);
  assert.equal(safeEqual('short','a-much-longer-token'),false);
  assert.equal(safeEqual('',''),true);
});

test('worker token rotation accepts current and temporary previous token only',()=>{
  const oldToken='old-secret-aaaaaaaaaaaaaaaaaaaaaaaa';
  const newToken='new-secret-bbbbbbbbbbbbbbbbbbbbbbbb';

  // Before rotation: only the current token works.
  assert.equal(workerTokenAccepted(oldToken,oldToken,''),true);
  assert.equal(workerTokenAccepted(newToken,oldToken,''),false);

  // Staged cutover: deploy new current token while retaining the old one only
  // in the explicit previous slot. Both callers can complete during overlap.
  assert.equal(workerTokenAccepted(newToken,newToken,oldToken),true);
  assert.equal(workerTokenAccepted(oldToken,newToken,oldToken),true);
  assert.equal(workerTokenAccepted('wrong-secret-cccccccccccccccccccc',newToken,oldToken),false);
  assert.equal(workerTokenAccepted('',newToken,oldToken),false);

  // Rotation complete: removing the previous slot immediately revokes old use.
  assert.equal(workerTokenAccepted(oldToken,newToken,''),false);
  assert.equal(workerTokenAccepted(newToken,newToken,''),true);
});

test('privacy worker wires staged rotation without logging token material',()=>{
  assert.match(worker,/workerTokenAccepted\(supplied,current,previous\)/);
  assert.match(worker,/PRIVACY_WORKER_TOKEN_PREVIOUS/);
  assert.match(worker,/x-privacy-worker-token/);
  assert.match(worker,/return json\(\{error:'UNAUTHENTICATED'\},401\)/);
  assert.doesNotMatch(worker,/console\.(log|error|warn)\([^)]*(supplied|current|previous|PRIVACY_WORKER_TOKEN)/i);
});
