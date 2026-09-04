const crypto = require('node:crypto');

const ACCESS_COOKIE = 'sf_demo_access_v1';
const FAILURE_COOKIE = 'sf_demo_fail_v1';
const SESSION_SECONDS = 60 * 60;
const RATE_WINDOW_SECONDS = 15 * 60;
const MAX_FAILURES = 5;
const attempts = globalThis.__sfDemoLoginAttempts || new Map();
globalThis.__sfDemoLoginAttempts = attempts;

function json(res, status, body, extraHeaders = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  for (const [key, value] of Object.entries(extraHeaders)) res.setHeader(key, value);
  res.end(JSON.stringify(body));
}

function secret() {
  return process.env.DEMO_SESSION_SECRET || '';
}

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function sign(payload) {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

function token(value) {
  const payload = encode(value);
  return `${payload}.${sign(payload)}`;
}

function verify(raw) {
  if (!raw || !secret()) return null;
  const split = raw.lastIndexOf('.');
  if (split < 1) return null;
  const payload = raw.slice(0, split);
  const supplied = Buffer.from(raw.slice(split + 1));
  const expected = Buffer.from(sign(payload));
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return value && Number.isFinite(value.exp) && value.exp > Date.now() ? value : null;
  } catch {
    return null;
  }
}

function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map(part => {
    const index = part.indexOf('=');
    if (index < 0) return ['', ''];
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(([key]) => key));
}

function cookie(name, value, maxAge) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function equalHash(actual, expected) {
  if (!/^[a-f0-9]{64}$/i.test(expected || '')) return false;
  return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected.toLowerCase(), 'hex'));
}

function clientKey(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const address = forwarded || req.socket?.remoteAddress || 'unknown';
  const agent = String(req.headers['user-agent'] || '').slice(0, 240);
  return crypto.createHmac('sha256', secret()).update(`${address}|${agent}`).digest('hex');
}

function currentFailure(req, key) {
  const now = Date.now();
  if (attempts.size > 1000) {
    for (const [storedKey, state] of attempts) if (state.resetAt <= now) attempts.delete(storedKey);
  }
  const memory = attempts.get(key);
  if (memory && memory.resetAt <= now) attempts.delete(key);
  const signed = verify(cookies(req)[FAILURE_COOKIE]);
  const persisted = signed?.kind === 'failure' && signed.key === key
    ? { count: Number(signed.count) || 0, resetAt: Number(signed.exp) || 0 }
    : null;
  const activeMemory = attempts.get(key);
  if (!activeMemory) return persisted;
  if (!persisted) return activeMemory;
  return activeMemory.count >= persisted.count ? activeMemory : persisted;
}

function recordFailure(res, key, previous) {
  const now = Date.now();
  const resetAt = previous?.resetAt > now ? previous.resetAt : now + RATE_WINDOW_SECONDS * 1000;
  const state = { count: (previous?.count || 0) + 1, resetAt };
  attempts.set(key, state);
  res.setHeader('Set-Cookie', cookie(FAILURE_COOKIE, token({ kind: 'failure', key, count: state.count, exp: resetAt }), Math.ceil((resetAt - now) / 1000)));
  return state;
}

function sameOrigin(req) {
  const site = String(req.headers['sec-fetch-site'] || '');
  if (site && site !== 'same-origin') return false;
  const origin = String(req.headers.origin || '');
  if (!origin) return true;
  const proto = String(req.headers['x-forwarded-proto'] || (req.socket?.encrypted ? 'https' : 'http')).split(',')[0];
  return origin === `${proto}://${req.headers.host}`;
}

async function body(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) return JSON.parse(String(req.body) || '{}');
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 4096) throw new Error('request_too_large');
  }
  return JSON.parse(raw || '{}');
}

async function handler(req, res) {
  if (!secret() || !process.env.DEMO_USER_SHA256 || !process.env.DEMO_PASSWORD_SHA256) {
    return json(res, 503, { ok: false, code: 'not_configured' });
  }

  if (req.method === 'GET') {
    const access = verify(cookies(req)[ACCESS_COOKIE]);
    if (!access || access.kind !== 'access') return json(res, 401, { ok: false, code: 'expired' });
    return json(res, 200, { ok: true, expiresAt: new Date(access.exp).toISOString() });
  }

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', cookie(ACCESS_COOKIE, '', 0));
    return json(res, 200, { ok: true });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, DELETE');
    return json(res, 405, { ok: false, code: 'method_not_allowed' });
  }

  if (!sameOrigin(req)) return json(res, 403, { ok: false, code: 'origin_rejected' });

  const key = clientKey(req);
  const failure = currentFailure(req, key);
  if (failure?.count >= MAX_FAILURES && failure.resetAt > Date.now()) {
    const retryAfter = Math.max(1, Math.ceil((failure.resetAt - Date.now()) / 1000));
    return json(res, 429, { ok: false, code: 'rate_limited', retryAfter }, { 'Retry-After': String(retryAfter) });
  }

  let credentials;
  try {
    credentials = await body(req);
  } catch {
    return json(res, 400, { ok: false, code: 'invalid_request' });
  }
  const username = String(credentials.username || '').trim().toLowerCase().slice(0, 254);
  const password = String(credentials.password || '').slice(0, 512);
  const valid = equalHash(sha256(username), process.env.DEMO_USER_SHA256)
    && equalHash(sha256(password), process.env.DEMO_PASSWORD_SHA256);

  if (!valid) {
    const state = recordFailure(res, key, failure);
    if (state.count >= MAX_FAILURES) {
      const retryAfter = Math.max(1, Math.ceil((state.resetAt - Date.now()) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return json(res, 429, { ok: false, code: 'rate_limited', retryAfter });
    }
    return json(res, 401, { ok: false, code: 'invalid_credentials', attemptsRemaining: MAX_FAILURES - state.count });
  }

  attempts.delete(key);
  const expiresAt = Date.now() + SESSION_SECONDS * 1000;
  res.setHeader('Set-Cookie', [
    cookie(ACCESS_COOKIE, token({ kind: 'access', exp: expiresAt }), SESSION_SECONDS),
    cookie(FAILURE_COOKIE, '', 0)
  ]);
  return json(res, 200, { ok: true, expiresAt: new Date(expiresAt).toISOString() });
}

module.exports = handler;
module.exports._test = { ACCESS_COOKIE, FAILURE_COOKIE, MAX_FAILURES, attempts, sha256, token, verify };
