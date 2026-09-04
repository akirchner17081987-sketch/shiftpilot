const demoAuth = require('./demo-auth.js');

const ALLOWED = Object.freeze({
  session_started: new Set(['manager']),
  area_opened: new Set([
    'overview', 'schedule', 'auto', 'disruptions', 'marketplace', 'employees', 'absence', 'time', 'reports', 'settings',
    'employee_dashboard', 'employee_disruptions', 'employee_marketplace', 'employee_shifts', 'employee_changes',
    'employee_swaps', 'employee_time', 'employee_absences', 'employee_account', 'employee_wage', 'employee_profile'
  ]),
  tour: new Set(['started', 'completed', 'skipped']),
  perspective_changed: new Set(['manager', 'employee']),
  scenario_selected: new Set(['outage', 'understaffing', 'vacation', 'deviation', 'swap']),
  scenario_reset: new Set(['prepared_scenario']),
  demo_reset: new Set(['presentation_state']),
  session_finished: new Set(['manual', 'idle', 'maximum'])
});

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.end(body == null ? '' : JSON.stringify(body));
}

function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map(part => {
    const index = part.indexOf('=');
    if (index < 0) return ['', ''];
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(([key]) => key));
}

function sameOrigin(req) {
  const site = String(req.headers['sec-fetch-site'] || '');
  if (site && site !== 'same-origin') return false;
  const origin = String(req.headers.origin || '');
  if (!origin) return true;
  const proto = String(req.headers['x-forwarded-proto'] || (req.socket?.encrypted ? 'https' : 'http')).split(',')[0];
  return origin === `${proto}://${req.headers.host}`;
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) return JSON.parse(String(req.body) || '{}');
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1024) throw new Error('request_too_large');
  }
  return JSON.parse(raw || '{}');
}

function valid(eventName, eventValue) {
  return Object.hasOwn(ALLOWED, eventName) && ALLOWED[eventName].has(eventValue);
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { ok: false, code: 'method_not_allowed' });
  }
  if (!sameOrigin(req)) return json(res, 403, { ok: false, code: 'origin_rejected' });

  const access = demoAuth._test.verify(cookies(req)[demoAuth._test.ACCESS_COOKIE]);
  if (!access || access.kind !== 'access') return json(res, 401, { ok: false, code: 'expired' });

  let input;
  try {
    input = await readBody(req);
  } catch {
    return json(res, 400, { ok: false, code: 'invalid_request' });
  }
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['event', 'value'].includes(key))) {
    return json(res, 400, { ok: false, code: 'invalid_request' });
  }
  const eventName = String(input.event || '');
  const eventValue = String(input.value || '');
  if (!valid(eventName, eventValue)) return json(res, 400, { ok: false, code: 'event_rejected' });

  const projectUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const publishableKey = String(process.env.SUPABASE_PUBLISHABLE_KEY || '');
  const ingestSecret = String(process.env.DEMO_ANALYTICS_INGEST_SECRET || '');
  if (!projectUrl || !publishableKey || !ingestSecret) return json(res, 503, { ok: false, code: 'not_configured' });

  try {
    const response = await fetch(`${projectUrl}/rest/v1/rpc/record_demo_usage`, {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${publishableKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ p_event_name: eventName, p_event_value: eventValue, p_ingest_secret: ingestSecret })
    });
    if (!response.ok) return json(res, 503, { ok: false, code: 'storage_unavailable' });
    res.statusCode = 204;
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.end();
  } catch {
    return json(res, 503, { ok: false, code: 'storage_unavailable' });
  }
}

module.exports = handler;
module.exports._test = { ALLOWED, valid };
