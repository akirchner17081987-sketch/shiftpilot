import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';

globalThis.crypto=webcrypto;
const { createToken, safeEqual, sha256Hex, verifyToken }=await import('../supabase/functions/_shared/demo-security.js');

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const demo=read('demo.html');
const api=read('assets/demo-api-v2.js');
const mode=read('assets/demo-mode-v1.js');
const analytics=read('assets/demo-analytics-v1.js');
const authFunction=read('supabase/functions/demo-auth/index.ts');
const analyticsFunction=read('supabase/functions/demo-analytics/index.ts');
const apache=read('.htaccess');

test('demo clients use Supabase Edge Functions and retain Vercel only as fallback code',()=>{
  assert.match(demo,/demo-api-v2\.js/);
  assert.match(demo,/SFDemoAPI\.fetchAuth/);
  assert.doesNotMatch(demo,/fetch\('\/api\/demo-auth'/);
  assert.match(api,/supabase\.co\/functions\/v1/);
  assert.match(api,/text\/plain;charset=UTF-8/);
  assert.match(mode,/SFDemoAPI\?\.fetchAuth/);
  assert.match(analytics,/SFDemoAPI\?\.fetchAnalytics/);
});

test('edge functions enforce origin, custom session token and event allowlist',()=>{
  assert.match(authFunction,/origin_rejected/);
  assert.match(authFunction,/MAX_FAILURES=5/);
  assert.match(authFunction,/DEMO_USER_SHA256/);
  assert.match(analyticsFunction,/verifyToken\(bearer\(req\),secret,'access'\)/);
  assert.match(analyticsFunction,/ALLOWED\[event\]\?\.has\(value\)/);
  assert.match(analyticsFunction,/record_demo_usage/);
});

test('portable HMAC tokens reject tampering and expiry',async()=>{
  const secret='test-secret-with-sufficient-entropy';
  assert.equal(await sha256Hex('abc'),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(safeEqual('same','same'),true);
  const token=await createToken({kind:'access',exp:Date.now()+60_000},secret);
  assert.equal((await verifyToken(token,secret,'access')).kind,'access');
  assert.equal(await verifyToken(`${token}x`,secret,'access'),null);
  assert.equal(await verifyToken(await createToken({kind:'access',exp:Date.now()-1},secret),secret,'access'),null);
});

test('Apache config handles clean routes, SPA fallback and PWA-safe caching',()=>{
  assert.match(apache,/RewriteCond %\{DOCUMENT_ROOT\}\/\$1\.html -f/);
  assert.match(apache,/RewriteCond %\{REQUEST_URI\} !\\\.\[\^\/\]\+\$/);
  assert.match(apache,/RewriteRule \^ \/index\.html \[END\]/);
  assert.match(apache,/Content-Security-Policy/);
  assert.match(apache,/schichtfunk-sw\\\.js/);
  assert.match(apache,/no-cache, no-store, must-revalidate/);
});
