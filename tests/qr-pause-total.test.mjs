import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../assets/qr-pause-total-v1.js', import.meta.url), 'utf8');
const { pauseTotalMilliseconds: total, formatPauseTotal: format } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const date = value => `2026-10-06T${value}Z`;
const shift = { state: 'RUNNING', started_at: date('00:00:00'), ended_at: null };
const pause = (start, end) => ({ started_at: date(start), ended_at: end == null ? null : date(end) });
const now = Date.parse(date('02:00:00'));

test('no booking or no pauses yields zero', () => {
  for (const status of [null, {}, { ...shift, breaks: [] }, { ...shift, breaks: null }]) assert.equal(total(status, now), 0);
});
test('sum fractions before formatting, rather than rounding individual pauses', () => {
  assert.equal(format(total({ ...shift, breaks: [pause('00:10:00', '00:10:45'), pause('00:20:00', '00:20:45')] }, now)), '1 Min. 30 Sek.');
});
test('ongoing pause contributes elapsed time and keeps growing', () => {
  const status = { ...shift, state: 'BREAK', breaks: [pause('00:10:00', '00:25:00'), pause('01:45:00', null)] };
  assert.equal(total(status, now), 30 * 60_000);
  assert.equal(total(status, now + 65_000), 31 * 60_000 + 5_000);
});
test('closed pauses remain fixed when the clock advances', () => {
  const status = { ...shift, breaks: [pause('00:10:00', '00:25:00')] };
  assert.equal(total(status, now), total(status, now + 90_000));
});
test('closed shift limits pauses to the booking interval', () => {
  assert.equal(total({ ...shift, state: 'READY', ended_at: date('01:00:00'), breaks: [pause('00:45:00', '01:05:00')] }, now), 15 * 60_000);
});
test('pauses crossing midnight and timezone offsets retain actual duration', () => {
  assert.equal(total({ state: 'RUNNING', started_at: '2026-10-05T21:00:00+02:00', breaks: [{ started_at: '2026-10-05T23:45:00+02:00', ended_at: '2026-10-06T00:15:00+02:00' }] }, now), 30 * 60_000);
});
test('all ten pauses contribute to the total', () => {
  const breaks = Array.from({ length: 10 }, (_, i) => pause(`00:${String(i * 3).padStart(2, '0')}:00`, `00:${String(i * 3 + 2).padStart(2, '0')}:00`));
  assert.equal(total({ ...shift, breaks }, now), 20 * 60_000);
});
test('invalid timestamps and reversed intervals cannot create negative or NaN totals', () => {
  const breaks = [null, {}, { started_at: '', ended_at: '' }, { started_at: 'bad', ended_at: date('00:20:00') }, pause('00:30:00', '00:15:00'), pause('00:10:00', '00:25:00')];
  assert.equal(total({ ...shift, breaks }, now), 15 * 60_000);
  assert.equal(total({ ...shift, started_at: 'bad', breaks }, now), 0);
  assert.equal(total({ ...shift, breaks }, NaN), 0);
});
test('future starts, pauses before the shift and stale open pauses are safe', () => {
  assert.equal(total({ ...shift, state: 'BREAK', breaks: [pause('03:00:00', null)] }, now), 0);
  assert.equal(total({ ...shift, started_at: date('00:20:00'), breaks: [pause('00:10:00', '00:25:00')] }, now), 5 * 60_000);
  assert.equal(total({ ...shift, breaks: [pause('00:10:00', null)] }, now), 0);
});
test('formatting handles subsecond values, long totals and invalid values', () => {
  assert.equal(format(59_999), '0 Min. 59 Sek.');
  assert.equal(format(3_600_000), '60 Min. 0 Sek.');
  for (const value of [-1, NaN, Infinity]) assert.equal(format(value), '0 Min. 0 Sek.');
});
