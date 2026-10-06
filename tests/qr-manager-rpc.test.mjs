import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../assets/qr-manager-correction-v1.js',import.meta.url),'utf8');
const rpc=source.slice(source.indexOf('  async function rpc('),source.indexOf('  function styles('));
const dateContext=vm.createContext({Intl,Date});
vm.runInContext(source.slice(source.indexOf('  const parts='),source.indexOf('  async function rpc(')),dateContext);
const toInstant=(value,original)=>vm.runInContext(`instant(${JSON.stringify(value)},'Europe/Berlin',${JSON.stringify(original)||'undefined'})`,dateContext);
test('German correction input shows day-month-year and 24-hour time',()=>{
  assert.equal(vm.runInContext("input('2026-09-30T16:45:03.046754Z','Europe/Berlin')",dateContext),'30.09.2026 18:45:03');
  assert.equal(toInstant('01.10.2026 06:00'),'2026-10-01T04:00:00.000Z');
  assert.equal(toInstant('01.10.2026, 18:00:00'),'2026-10-01T16:00:00.000Z');
});
test('unchanged German fields preserve fractional seconds and daylight-saving offset',()=>{
  assert.equal(toInstant('30.09.2026 18:45:03','2026-09-30T16:45:03.046754Z'),'2026-09-30T16:45:03.046754Z');
  assert.equal(toInstant('25.10.2026 02:30:00','2026-10-25T00:30:00.123456Z'),'2026-10-25T00:30:00.123456Z');
});
test('American dates and AM/PM are rejected rather than silently reinterpreted',()=>{
  assert.throws(()=>toInstant('10/01/2026 06:00 AM'),/24-Stunden/);
  assert.throws(()=>toInstant('2026-10-01T06:00'),/24-Stunden/);
  assert.equal(toInstant('10.01.2026 06:00'),'2026-01-10T05:00:00.000Z');
});
test('invalid calendar dates and ambiguous daylight-saving time remain blocked',()=>{
  for(const value of ['31.11.2026 06:00','01.10.2026 24:00','29.03.2026 02:30'])assert.throws(()=>toInstant(value),/nicht|ungültig/);
  assert.throws(()=>toInstant('25.10.2026 02:30'),/doppeldeutig/);
});
function fixture(client){
  let deadline,delay,cleared=false;
  const context=vm.createContext({B:{client},AbortController,setTimeout(fn,ms){deadline=fn;delay=ms;return 1},clearTimeout(){cleared=true}});
  vm.runInContext(rpc,context);
  return{call:()=>vm.runInContext("rpc('manager_qr_independent_detail',{p_shift_id:'fictitious-shift'})",context),expire:()=>deadline(),delay:()=>delay,cleared:()=>cleared};
}
test('signed-in Promise wrapper loads correction data and clears the deadline',async()=>{
  const h=fixture({rpc:async()=>({data:'{"employee_name":"Fiktive Testperson"}'})});
  assert.equal((await h.call()).employee_name,'Fiktive Testperson');assert.equal(h.delay(),20000);assert.equal(h.cleared(),true);
});
test('a hung Promise wrapper times out even without abortSignal',async()=>{
  const h=fixture({rpc:()=>new Promise(()=>{})});const pending=h.call();h.expire();
  await assert.rejects(pending,/20 Sekunden/);assert.equal(h.cleared(),true);
});
test('native PostgREST builders retain cancellation and an independent deadline',async()=>{
  let signal;const promise=new Promise(()=>{});promise.abortSignal=value=>{signal=value;return promise};
  const h=fixture({rpc:()=>promise});const pending=h.call();h.expire();
  await assert.rejects(pending,/20 Sekunden/);assert.equal(signal.aborted,true);assert.equal(h.cleared(),true);
});
test('server validation errors remain visible through a Promise wrapper',async()=>{
  const h=fixture({rpc:async()=>({error:{message:'Die Buchung wurde inzwischen geändert.'}})});
  await assert.rejects(h.call(),error=>error.message.includes('inzwischen geändert'));assert.equal(h.cleared(),true);
});
