const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const time = Date.parse('2026-10-06T02:30:00Z');
const iso = milliseconds => new Date(milliseconds).toISOString();
const breakAt = (number, start, end) => ({ number, started_at: iso(time + start), ended_at: end == null ? null : iso(time + end) });
const running = { terminal_name: 'Fiktiver Standort Nord', location_note: 'Fiktiver Eingang 2', ok: true, name: 'Fiktive Testperson', state: 'RUNNING', started_at: iso(time - 5 * 3600_000), ended_at: null, breaks: [breakAt(1, -3600_000, -2670_000), breakAt(2, -2400_000, -1530_000)] };
test.use({ video: 'off', launchOptions: process.env.SF_QR_BROWSER_EXECUTABLE ? { executablePath: process.env.SF_QR_BROWSER_EXECUTABLE } : {} });

// Full production page and asset; every network request is intercepted.
// Login and bookings below are fictitious and never reach Supabase.
async function fixture(page, initial, failAction, clockSkew = 0) {
  let status = structuredClone(initial);
  const calls = [], errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({ time: new Date(time + clockSkew - 1000) });
  await page.clock.pauseAt(new Date(time + clockSkew));
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.hostname === 'qr-pause.test') {
      const file = url.pathname === '/qr-time.html' ? 'qr-time.html' : url.pathname === '/assets/qr-pause-total-v1.js' ? 'assets/qr-pause-total-v1.js' : url.pathname === '/assets/schichtfunk-logo.svg' ? 'assets/schichtfunk-logo.svg' : null;
      if (!file) return route.abort();
      return route.fulfill({ contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'application/javascript' : 'image/svg+xml', body: fs.readFileSync(path.join(root, file)) });
    }
    if (url.hostname === 'zbvloohfjleadjnqhbbh.supabase.co' && url.pathname === '/functions/v1/qr-independent') {
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } });
      const input = request.postDataJSON();
      calls.push(input.action);
      const respond = (body, code = 200) => route.fulfill({ status: code, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) });
      if (input.action === 'LOGIN') return respond({ ok: true, sessionToken: 'f'.repeat(64) });
      if (input.action === failAction) return respond({ ok: false, error: 'Fiktiver Buchungsfehler' }, 400);
      const punched = await page.evaluate(() => Date.now()) - clockSkew;
      if (input.action === 'CLOCK_IN') status = { ...running, state: 'RUNNING', started_at: iso(punched), ended_at: null, breaks: [] };
      if (input.action === 'BREAK_START') { status.state = 'BREAK'; status.breaks.push({ number: status.breaks.length + 1, started_at: iso(punched), ended_at: null }); }
      if (input.action === 'BREAK_END') { status.state = 'RUNNING'; status.breaks.at(-1).ended_at = iso(punched); }
      if (input.action === 'CLOCK_OUT') {
        status.pause_automatically_closed = status.state === 'BREAK';
        if (status.pause_automatically_closed) status.breaks.at(-1).ended_at = iso(punched);
        status.state = 'READY'; status.ended_at = iso(punched);
      }
      return respond({ ...status, as_of: iso(punched), timezone: 'Europe/Berlin', punched_at: input.action === 'STATUS' ? null : iso(punched) });
    }
    external.push(request.url());
    return route.abort();
  });
  await page.goto('http://qr-pause.test/qr-time.html?t=' + 'e'.repeat(64));
  await page.locator('#personnel').fill('FIKTIVER-TEST');
  await page.locator('#startDate').fill('15012020');
  await page.locator('#loginButton').click();
  await expect(page.locator('#clock')).toBeVisible();
  return { calls, errors, external };
}

test('existing running booking shows sum of completed pauses', async ({ page }) => {
  const check = await fixture(page, running);
  await expect(page.locator('#pauseTotal')).toHaveText('30 Min. 0 Sek.');
  await expect(page.locator('#attendanceTotal')).toHaveText('05:00:00');
  await expect(page.locator('#begin')).toHaveText('23:30');
  await expect(page.locator('#beginDate')).toHaveText('05.10.2026');
  await expect(page.locator('#location')).toHaveText('Fiktiver Standort Nord');
  await expect(page.locator('#locationNote')).toHaveText('Fiktiver Eingang 2');
  await page.clock.runFor(125_000);
  await expect(page.locator('#attendanceTotal')).toHaveText('05:02:05');
  await expect(page.locator('#pauseTotal')).toHaveText('30 Min. 0 Sek.');
  expect(check.calls).toEqual(['LOGIN', 'STATUS']);
  expect(check.errors).toEqual([]); expect(check.external).toEqual([]);
  await expect(page.locator('#startDate')).toHaveValue('');
});

test('ongoing pause is added and updates across minute boundary without requests', async ({ page }) => {
  const check = await fixture(page, { ...running, state: 'BREAK', breaks: [...running.breaks, breakAt(3, -59_000, null)] });
  await expect(page.locator('#pauseTotal')).toHaveText('30 Min. 59 Sek.');
  await expect(page.locator('#pauseTotalDetail')).toContainText('laufende Pause ist enthalten');
  await page.clock.runFor(2000);
  await expect(page.locator('#pauseTotal')).toHaveText('31 Min. 1 Sek.');
  await expect(page.locator('#attendanceTotal')).toHaveText('05:00:02');
  await page.locator('#pauseEnd').click();
  await expect(page.locator('#state')).toHaveText('Arbeitszeit läuft');
  await page.clock.runFor(65_000);
  await expect(page.locator('#pauseTotal')).toHaveText('31 Min. 1 Sek.');
  expect(check.calls).toEqual(['LOGIN', 'STATUS', 'BREAK_END']);
  expect(check.errors).toEqual([]); expect(check.external).toEqual([]);
});

test('booking lifecycle accumulates pauses, closes open pause, resets for next booking and logout', async ({ page }) => {
  const check = await fixture(page, { ...running, state: 'READY', started_at: null, breaks: [] });
  await expect(page.locator('#pauseTotal')).toHaveText('0 Min. 0 Sek.');
  await page.locator('#start').click(); await expect(page.locator('#state')).toHaveText('Arbeitszeit läuft');
  await page.locator('#pauseStart').click(); await expect(page.locator('#state')).toHaveText('Pause läuft');
  await page.clock.runFor(90_000); await expect(page.locator('#pauseTotal')).toHaveText('1 Min. 30 Sek.');
  await page.locator('#pauseEnd').click(); await expect(page.locator('#state')).toHaveText('Arbeitszeit läuft');
  await page.clock.runFor(60_000); await expect(page.locator('#pauseTotal')).toHaveText('1 Min. 30 Sek.');
  await page.locator('#pauseStart').click(); await expect(page.locator('#state')).toHaveText('Pause läuft');
  await page.clock.runFor(45_000); await expect(page.locator('#pauseTotal')).toHaveText('2 Min. 15 Sek.');
  await page.locator('#end').click(); await expect(page.locator('#start')).toBeVisible();
  await expect(page.locator('#message')).toContainText('Pause wurde automatisch zum selben Zeitpunkt beendet');
  await page.clock.runFor(60_000); await expect(page.locator('#pauseTotal')).toHaveText('2 Min. 15 Sek.');
  await expect(page.locator('#attendanceTotal')).toHaveText('00:03:15');
  await page.locator('#start').click(); await expect(page.locator('#state')).toHaveText('Arbeitszeit läuft');
  await expect(page.locator('#pauseTotal')).toHaveText('0 Min. 0 Sek.');
  await expect(page.locator('#attendanceTotal')).toHaveText('00:00:00');
  await page.locator('#pauseStart').click(); await expect(page.locator('#state')).toHaveText('Pause läuft');
  await page.clock.runFor(45_000);
  await page.locator('#logout').click(); await expect(page.locator('#clock')).toBeHidden();
  await page.clock.runFor(60_000); await expect(page.locator('#pauseTotal')).toHaveText('0 Min. 0 Sek.');
  await expect(page.locator('#attendanceTotal')).toHaveText('00:00:00');
  await expect(page.locator('#location')).toHaveText('');
  await expect(page.locator('#name')).toHaveText('');
  expect(check.errors).toEqual([]); expect(check.external).toEqual([]);
});

test('failed booking preserves ongoing total and available controls', async ({ page }) => {
  const check = await fixture(page, { ...running, state: 'BREAK', breaks: [...running.breaks, breakAt(3, -60_000, null)] }, 'BREAK_END');
  await page.locator('#pauseEnd').click(); await expect(page.locator('#message')).toContainText('Fiktiver Buchungsfehler');
  await page.clock.runFor(15_000);
  await expect(page.locator('#pauseTotal')).toHaveText('31 Min. 15 Sek.');
  await expect(page.locator('#pauseEnd')).toBeEnabled();
  await expect(page.locator('#attendanceTotal')).toHaveText('05:00:15');
  expect(check.errors).toEqual([]); expect(check.external).toEqual([]);
});

for (const width of [320, 390, 1280]) test(`pause summary fits viewport ${width}px without overlaps`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 900 });
  const check = await fixture(page, { ...running, name: 'Fiktive Testperson mit einem sehr langen vollständigen Namen', terminal_name: 'Fiktiver Standort mit einem sehr langen Namen ohne abgeschnittene Wörter', location_note: 'Fiktives Gebäude · vollständige Standortbeschreibung', state: 'BREAK', breaks: [...running.breaks, breakAt(3, -600_000, null)] });
  await page.locator('.pause-total').scrollIntoViewIfNeeded();
  const geometry = await page.locator('.pause-total').evaluate(el => {
    const rect = el.getBoundingClientRect(), total = el.querySelector('strong'), value = total.getBoundingClientRect(), list = document.querySelector('#breaks').getBoundingClientRect();
    return { fontSize: parseFloat(getComputedStyle(total).fontSize), hintFontSize: parseFloat(getComputedStyle(el.querySelector('small')).fontSize), fits: value.left >= rect.left && value.right <= rect.right && total.scrollWidth <= total.clientWidth, separate: list.top >= rect.bottom, overflow: document.documentElement.scrollWidth > innerWidth, minWidth: rect.left >= 0 && rect.right <= innerWidth };
  });
  expect(geometry).toEqual({ fontSize: 24, hintFontSize: 14, fits: true, separate: true, overflow: false, minWidth: true });
  expect(check.errors).toEqual([]); expect(check.external).toEqual([]);
  const overview = await page.locator('.live-overview').evaluate(el => [...el.querySelectorAll('.detail')].every(cell => {
    const r = cell.getBoundingClientRect();
    return r.left >= 0 && r.right <= innerWidth && cell.scrollWidth <= cell.clientWidth && [...cell.querySelectorAll('h2,small')].every(label => parseFloat(getComputedStyle(label).fontSize) >= 14);
  }));
  expect(overview).toBe(true);
  await testInfo.attach(`qr-live-${width}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
});


test('server snapshot ignores an incorrect phone clock and later clock changes', async ({ page }) => {
  const skew = 3 * 3600_000;
  const check = await fixture(page, running, null, skew);
  await expect(page.locator('#attendanceTotal')).toHaveText('05:00:00');
  await page.clock.runFor(2000);
  await expect(page.locator('#attendanceTotal')).toHaveText('05:00:02');
  await page.clock.setSystemTime(new Date(time + skew + 12 * 3600_000));
  await page.clock.runFor(3000);
  await expect(page.locator('#attendanceTotal')).toHaveText('05:00:05');
  expect(check.calls).toEqual(['LOGIN', 'STATUS']);
  expect(check.errors).toEqual([]); expect(check.external).toEqual([]);
});

test('ready login displays its location and does not invent a service start', async ({ page }) => {
  const check = await fixture(page, { ...running, state: 'READY', started_at: null, breaks: [] });
  await expect(page.locator('#begin')).toHaveText('–');
  await expect(page.locator('#beginDate')).toHaveText('Noch nicht begonnen');
  await expect(page.locator('#attendanceTotal')).toHaveText('00:00:00');
  await expect(page.locator('#location')).toHaveText('Fiktiver Standort Nord');
  await page.clock.runFor(60_000);
  await expect(page.locator('#attendanceTotal')).toHaveText('00:00:00');
  expect(check.calls).toEqual(['LOGIN', 'STATUS']);
  expect(check.errors).toEqual([]); expect(check.external).toEqual([]);
});

test('location strings render as text and are cleared on logout', async ({ page }) => {
  const location = '<img src=x onerror=alert(1)> Fiktiver Standort';
  const check = await fixture(page, { ...running, terminal_name: location, location_note: '<b>Fiktiver Hinweis</b>' });
  await expect(page.locator('#location')).toHaveText(location);
  await expect(page.locator('#location img')).toHaveCount(0);
  await expect(page.locator('#locationNote')).toHaveText('<b>Fiktiver Hinweis</b>');
  await page.locator('#logout').click();
  await expect(page.locator('#location')).toHaveText('');
  await expect(page.locator('#locationNote')).toHaveText('');
  expect(check.errors).toEqual([]); expect(check.external).toEqual([]);
});

test('live overview remains readable with enlarged text on a narrow screen', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const check = await fixture(page, running);
  await page.locator('html').evaluate(el => el.style.fontSize = '200%');
  expect(await page.locator('.live-overview').evaluate(el => [...el.querySelectorAll('.detail')].every(cell => {
    const r = cell.getBoundingClientRect();
    return r.left >= 0 && r.right <= innerWidth && cell.scrollWidth <= cell.clientWidth;
  }))).toBe(true);
  await testInfo.attach('qr-live-large-text', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  expect(check.errors).toEqual([]); expect(check.external).toEqual([]);
});
