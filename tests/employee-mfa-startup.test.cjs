const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

function harness(role = 'EMPLOYEE', demo = false) {
  const events = [];
  let resolveChallenge, rejectChallenge;
  const challenge = new Promise((resolve, reject) => { resolveChallenge = resolve; rejectChallenge = reject; });
  const B = {
    role, ready: false,
    client: { auth: { getSession: async () => ({data: {session: {user: {id: 'test-user'}, verified: true}}}) } },
    boot: async session => { events.push(['manager', session.verified]); return true; },
    ensureCompany: async () => { events.push(['company']); },
    hydrateEmployee: async () => { events.push(['hydrate']); },
    openEmployeePortal: () => events.push(['portal']),
    showLoading() {}, hideLoading() {}, updateState() {}, installMfaRpcRetry() {},
    enforcePrivilegedMfaEnrollment: async () => events.push(['enrollment']),
    requireMfaChallenge: () => { events.push(['challenge']); return challenge; }
  };
  const context = {SFBackend: B, sessionStorage: {getItem: () => demo ? 'active' : null}, setTimeout, console};
  vm.createContext(context);
  const employee = read('assets/supabase-employee-access-v1.js');
  const wrapper = employee.slice(employee.indexOf('  const staffBoot=B.boot;'), employee.indexOf('\n', employee.indexOf('  const staffBoot=B.boot;')));
  vm.runInContext('const B=SFBackend;'+wrapper, context);
  const mfa = read('assets/supabase-mfa-v1.js');
  vm.runInContext(mfa.slice(mfa.indexOf('  function wrapBoot(){'), mfa.lastIndexOf('\n})();')), context);
  return {B, events, resolveChallenge, rejectChallenge};
}

test('loader wraps the employee boot with MFA before initialization', () => {
  const source = read('assets/conflict-plausibility-v1.js');
  assert.ok(source.indexOf("'assets/supabase-mfa-v1.js'") > source.indexOf("'assets/supabase-employee-access-v1.js'"));
});

for (const role of ['EMPLOYEE', 'PLANNER']) {
  test(`${role}: both fresh and restored sessions wait for MFA before company or personal data`, async () => {
    for (const source of ['fresh login', 'restored session']) {
      const h = harness(role);
      const boot = h.B.boot({user: {id:'test-user'}, source});
      await flush();
      assert.deepEqual(h.events, [['challenge']]);
      h.resolveChallenge(true);
      await boot;
      assert.equal(h.events[1][0], 'company');
      if (role === 'EMPLOYEE') assert.deepEqual(h.events.map(x => x[0]), ['challenge','company','hydrate','portal','enrollment']);
      else assert.deepEqual(h.events, [['challenge'],['company'],['manager',true],['enrollment']]);
    }
  });
}

test('cancelled or failed MFA cannot open the employee portal', async () => {
  const h = harness();
  const boot = h.B.boot({user:{id:'test-user'}});
  h.rejectChallenge(new Error('cancelled'));
  await assert.rejects(boot, /cancelled/);
  assert.deepEqual(h.events, [['challenge']]);
  assert.equal(h.B.ready, false);
});

test('local demo continues without a real MFA challenge', async () => {
  const h = harness('EMPLOYEE', true);
  await h.B.boot({user:{id:'test-user'}});
  assert.deepEqual(h.events.map(x => x[0]), ['company','hydrate','portal']);
});
