import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../assets/qr-manager-correction-v1.js',import.meta.url),'utf8');
const rpc=source.slice(source.indexOf('  async function rpc('),source.indexOf('  function styles('));
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
