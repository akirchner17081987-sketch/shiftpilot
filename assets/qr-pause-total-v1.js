// Display-only durations; stored booking times and paid time stay server-owned.
export function attendanceMilliseconds(status, now = Date.now()) {
  const start = typeof status?.started_at === 'string' ? Date.parse(status.started_at) : NaN;
  const end = typeof status?.ended_at === 'string' ? Date.parse(status.ended_at) : NaN;
  if (!Number.isFinite(start)) return 0;
  const limit = Number.isFinite(end) ? end : ['RUNNING', 'BREAK'].includes(status?.state) ? now : NaN;
  return Number.isFinite(limit) ? Math.max(0, limit - start) : 0;
}

export function formatAttendance(milliseconds) {
  const seconds = Math.floor(Math.max(0, Number.isFinite(milliseconds) ? milliseconds : 0) / 1000);
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map(value => String(value).padStart(2, '0')).join(':');
}

export function pauseTotalMilliseconds(status, now = Date.now()) {
  const timestamp = value => typeof value === 'string' && value.trim() ? Date.parse(value) : NaN;
  const shiftStart = timestamp(status?.started_at);
  const shiftEnd = timestamp(status?.ended_at);
  if (!Number.isFinite(shiftStart) || !Number.isFinite(now)) return 0;
  const limit = Number.isFinite(shiftEnd) ? shiftEnd : now;
  return (Array.isArray(status?.breaks) ? status.breaks : []).reduce((total, pause) => {
    const start = timestamp(pause?.started_at);
    const recordedEnd = timestamp(pause?.ended_at);
    const open = pause?.ended_at == null && status?.state === 'BREAK' && !Number.isFinite(shiftEnd);
    const end = open ? now : recordedEnd;
    if (!Number.isFinite(start) || !Number.isFinite(end)) return total;
    return total + Math.max(0, Math.min(end, limit) - Math.max(start, shiftStart));
  }, 0);
}

export function formatPauseTotal(milliseconds) {
  const seconds = Math.floor(Math.max(0, Number.isFinite(milliseconds) ? milliseconds : 0) / 1000);
  return `${Math.floor(seconds / 60)} Min. ${seconds % 60} Sek.`;
}
