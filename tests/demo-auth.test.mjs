import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const handler = require('../api/demo-auth.js');

const original = { ...process.env };
process.env.DEMO_USER_SHA256 = handler._test.sha256('demo@example.test');
process.env.DEMO_PASSWORD_SHA256 = handler._test.sha256('correct horse battery staple');
process.env.DEMO_SESSION_SECRET = 'test-secret-with-enough-entropy-for-signatures';
process.env.NODE_ENV = 'test';

function response() {
  const headers = new Map();
  return {
    statusCode: 200,
    body: '',
    setHeader(key, value) { headers.set(key.toLowerCase(), value); },
    getHeader(key) { return headers.get(key.toLowerCase()); },
    end(value = '') { this.body = value; }
  };
}

async function call(method, body, cookie = '', ip = '203.0.113.10') {
  const req = {
    method,
    body,
    headers: { host: 'example.test', origin: 'https://example.test', 'x-forwarded-proto': 'https', 'x-forwarded-for': ip, 'user-agent': 'test', cookie },
    socket: {}
  };
  const res = response();
  await handler(req, res);
  return { res, data: JSON.parse(res.body) };
}

function cookieValue(setCookie, name) {
  const rows = Array.isArray(setCookie) ? setCookie : [setCookie];
  const row = rows.find(value => value.startsWith(`${name}=`));
  return row?.split(';', 1)[0] || '';
}

test.after(() => { process.env = original; });

test('rejects invalid credentials without revealing which field failed', async () => {
  const { res, data } = await call('POST', { username: 'demo@example.test', password: 'wrong' });
  assert.equal(res.statusCode, 401);
  assert.equal(data.code, 'invalid_credentials');
  assert.equal(data.attemptsRemaining, 4);
});

test('issues and validates a short-lived HttpOnly access cookie', async () => {
  const login = await call('POST', { username: 'demo@example.test', password: 'correct horse battery staple' }, '', '203.0.113.11');
  assert.equal(login.res.statusCode, 200);
  const setCookie = login.res.getHeader('set-cookie');
  const access = cookieValue(setCookie, handler._test.ACCESS_COOKIE);
  assert.match(access, /sf_demo_access_v1=/);
  assert.match(Array.isArray(setCookie) ? setCookie[0] : setCookie, /HttpOnly/);
  const status = await call('GET', null, access, '203.0.113.11');
  assert.equal(status.res.statusCode, 200);
  assert.equal(status.data.ok, true);
});

test('blocks the fifth failed attempt for the rate-limit window', async () => {
  let result;
  let failureCookie = '';
  for (let attempt = 0; attempt < handler._test.MAX_FAILURES; attempt += 1) {
    result = await call('POST', { username: 'demo@example.test', password: 'wrong' }, failureCookie, '203.0.113.12');
    failureCookie = cookieValue(result.res.getHeader('set-cookie'), handler._test.FAILURE_COOKIE);
  }
  assert.equal(result.res.statusCode, 429);
  assert.equal(result.data.code, 'rate_limited');
  assert.ok(Number(result.res.getHeader('retry-after')) > 0);
});

test('rejects cross-site login submissions', async () => {
  const req = { method: 'POST', body: {}, headers: { host: 'example.test', origin: 'https://evil.test', 'x-forwarded-proto': 'https', 'sec-fetch-site': 'cross-site' }, socket: {} };
  const res = response();
  await handler(req, res);
  assert.equal(res.statusCode, 403);
});
