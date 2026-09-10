import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const push = read('assets/push-notifications-v1.js');
const loader = read('assets/navigation-compat-v1.js');
const worker = read('schichtfunk-sw.js');
const vercel = JSON.parse(read('vercel.json'));

test('push activation keeps permission request in the explicit button flow', () => {
  assert.match(push, /data-sf-push-enable/);
  assert.match(push, /Notification\.requestPermission\(\)/);
  assert.match(push, /event\.preventDefault\(\);event\.stopPropagation\(\)/);
  assert.match(push, /void enable\(\)/);
});

test('push activation validates every stage and exposes actionable inline errors', () => {
  assert.match(push, /PUSH_PERMISSION_DISMISSED/);
  assert.match(push, /PUSH_SESSION_NOT_READY/);
  assert.match(push, /PUSH_PUBLIC_KEY_INVALID/);
  assert.match(push, /SERVICE_WORKER_REGISTER_TIMEOUT/);
  assert.match(push, /PUSH_SUBSCRIBE_TIMEOUT/);
  assert.match(push, /aria-live','polite/);
  assert.match(push, /Erneut versuchen/);
  assert.doesNotMatch(push, /alert\(/);
});

test('iOS users get the required Home Screen guidance', () => {
  assert.match(push, /isIos\(\)&&!standalone\(\)/);
  assert.match(push, /iOS\/iPadOS 16\.4 oder neuer/);
  assert.match(push, /zum Home-Bildschirm hinzugefügten SchichtFunk-App/);
});

test('service worker and server registration remain wired for push', () => {
  assert.match(push, /register\('\/schichtfunk-sw\.js'/);
  assert.match(push, /pushManager\.subscribe\(\{userVisibleOnly:true,applicationServerKey\}/);
  assert.match(push, /register_push_subscription/);
  assert.match(worker, /addEventListener\('push'/);
  assert.match(worker, /showNotification/);
  assert.match(worker, /addEventListener\('notificationclick'/);
  assert.match(loader, /push-notifications-v1\.js\?v=20260910-4/);
});

test('push hardening preserves QR camera and PWA capabilities', () => {
  const headers = vercel.headers.find(rule => rule.source === '/(.*)')?.headers ?? [];
  const values = Object.fromEntries(headers.map(header => [header.key, header.value]));
  assert.match(values['Permissions-Policy'], /camera=\(self\)/);
  assert.match(worker, /url\.pathname==='\/qr-time'/);
  assert.match(worker, /url\.pathname==='\/qr-time\.html'/);
});
