import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../assets/qr-pause-total-v1.js', import.meta.url), 'utf8');
const { attendanceMilliseconds: attendance, formatAttendance: format } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const started_at = '2026-10-05T20:00:00Z', now = Date.parse('2026-10-06T02:30:05Z');

test('running night service measures elapsed time across midnight', () => {
  assert.equal(format(attendance({ state: 'RUNNING', started_at }, now)), '06:30:05');
});
test('paid pauses stay fully included in attendance', () => {
  const shift = { state: 'BREAK', started_at, breaks: [{ started_at: '2026-10-06T01:30:00Z', ended_at: null }] };
  assert.equal(format(attendance(shift, now)), '06:30:05');
  assert.equal(format(attendance(shift, now + 65_000)), '06:31:10');
});
test('clock-out freezes elapsed attendance at the recorded end', () => {
  const shift = { state: 'READY', started_at, ended_at: '2026-10-06T04:00:00Z' };
  assert.equal(format(attendance(shift, now + 24 * 3600_000)), '08:00:00');
});
test('daylight saving changes use actual elapsed time', () => {
  assert.equal(format(attendance({ state: 'READY', started_at: '2026-03-28T22:00:00+01:00', ended_at: '2026-03-29T06:00:00+02:00' })), '07:00:00');
  assert.equal(format(attendance({ state: 'READY', started_at: '2026-10-24T22:00:00+02:00', ended_at: '2026-10-25T06:00:00+01:00' })), '09:00:00');
});
test('missing, invalid, future and inactive bookings cannot show negative or invented time', () => {
  for (const shift of [null, {}, { state: 'READY', started_at }, { state: 'RUNNING', started_at: 'invalid' }, { state: 'RUNNING', started_at: '2026-10-07T00:00:00Z' }, { state: 'READY', started_at, ended_at: '2026-10-04T00:00:00Z' }]) assert.equal(attendance(shift, now), 0);
  assert.equal(attendance({ state: 'RUNNING', started_at }, NaN), 0);
});
test('duration format preserves seconds and services longer than one day', () => {
  assert.equal(format(999), '00:00:00');
  assert.equal(format(27 * 3600_000 + 61_000), '27:01:01');
  assert.equal(format(NaN), '00:00:00');
  assert.equal(format(-1000), '00:00:00');
});
