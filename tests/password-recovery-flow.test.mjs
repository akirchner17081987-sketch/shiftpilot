import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../assets/supabase-password-reset-v1.js', import.meta.url), 'utf8');
function setup(initialUrl, session) {
  let html = '';
  const elements = new Map();
  const child = () => ({value:'', focus(){}, addEventListener(){}, setAttribute(){}, removeAttribute(){}});
  const document = {
    getElementById(id){return elements.get(id) || null},
    createElement(){return {set id(v){this._id=v;elements.set(v,this)}, get id(){return this._id}, set innerHTML(v){html=v}, get innerHTML(){return html}, set textContent(v){}, querySelector(sel){if(sel === '#sfSendReauth' && !html.includes('id="sfSendReauth"')) return null; return child()}, querySelectorAll(){return []}, addEventListener(){}, remove(){elements.delete(this._id)}}},
    head:{appendChild(){}}, body:{appendChild(){}}
  };
  const location = new URL(initialUrl);
  const backend = {init: async()=>{}, client:{auth:{getSession:async()=>({data:{session}})}}, closeAuth(){}};
  const context = {window:{SFBackend:backend}, document, location, URL, history:{replaceState(){}}, setTimeout:fn=>fn(), console};
  vm.runInNewContext(source,context);
  return {backend, location, getHtml:()=>html};
}

test('recovery survives URL cleanup during initialization', async()=>{
  const app=setup('https://example.test/?passwordReset=1#type=recovery', {user:{id:'test'}});
  app.backend.init = app.backend.init.bind(app.backend);
  app.location.search=''; app.location.hash='#app';
  await app.backend.init();
  assert.match(app.getHtml(), /id="sfNewPassword"/);
  assert.doesNotMatch(app.getHtml(), /id="sfCurrentPassword"/);
});
test('recovery without session is rejected', async()=>{
  const app=setup('https://example.test/?passwordReset=1', null);
  await app.backend.init();
  assert.match(app.getHtml(), /Link nicht mehr gültig/);
  assert.doesNotMatch(app.getHtml(), /id="sfNewPassword"/);
});
test('ordinary password change still asks for current password', ()=>{
  const app=setup('https://example.test/#app', {user:{id:'test'}});
  app.backend.passwordResetNewDialog();
  assert.match(app.getHtml(), /id="sfCurrentPassword"/);
});
