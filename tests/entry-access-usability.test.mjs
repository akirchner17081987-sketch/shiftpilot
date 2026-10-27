import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Window} from 'happy-dom';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const entrySource=read('assets/sf-entry-access-v1.js');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
async function loginFixture({reset=false,url='https://schichtfunk.de/?bereich=verwaltung',entry=false}={}){
  const w=new Window({url}),calls=[];w.openApp=view=>calls.push({app:view});
  if(entry){const html=read('index.html');w.document.body.innerHTML=html.slice(html.indexOf('<div id="sfEntryOverlay"'),html.indexOf('<section id="landingPage">'));}
  w.eval(read('assets/supabase-auth-v1.js'));const B=w.SFBackend;
  B.client={auth:{signInWithPassword:async args=>{calls.push({login:args});return {error:{message:'Fixture rejection'}};},resetPasswordForEmail:async()=>{calls.push({reset:true});return {error:null};}}};
  if(reset)w.eval(read('assets/supabase-password-reset-v1.js'));
  B.authDialog('login');await tick();
  if(entry){w.document.getElementById('sfEntryLoginSlot').append(w.document.getElementById('sfAuthBackdrop'));w.matchMedia=()=>({matches:true});w.eval(entrySource);}
  return {w,B,calls,$:id=>w.document.getElementById(id),close:()=>w.happyDOM.close()};
}

test('login validates and focuses each missing or malformed field before any auth request',async()=>{
  const h=await loginFixture();try{
    const {w,$,calls}=h,submit=$('sfAuthSubmit');submit.click();
    assert.equal(w.document.activeElement,$('sfEmail'));assert.equal($('sfEmail').getAttribute('aria-invalid'),'true');assert.match($('sfAuthMsg').textContent,/E-Mail-Adresse eingeben/);
    $('sfEmail').value='invalid';$('sfPassword').value='fixture-password';submit.click();assert.match($('sfAuthMsg').textContent,/gültige E-Mail-Adresse/);assert.equal(w.document.activeElement,$('sfEmail'));
    $('sfEmail').value='fixture@example.invalid';$('sfEmail').dispatchEvent(new w.Event('input'));assert.equal($('sfEmail').hasAttribute('aria-invalid'),false);
    $('sfPassword').value='';submit.click();assert.equal(w.document.activeElement,$('sfPassword'));assert.match($('sfAuthMsg').textContent,/Passwort eingeben/);
    $('sfPassword').value='short';submit.click();assert.match($('sfAuthMsg').textContent,/mindestens 8/);assert.equal(calls.length,0);
    $('sfPassword').value='fixture-password';submit.click();await tick();assert.equal(calls.filter(x=>x.login).length,1);assert.equal($('sfAuthMsg').getAttribute('aria-live'),'polite');
  }finally{await h.close();}
});

test('password visibility is explicit and resets to masked and empty when changing entry area',async()=>{
  const h=await loginFixture({entry:true});try{
    const {$,w}=h;$('sfPassword').value='fixture-password';const toggle=$('sfPasswordVisibility');
    assert.equal($('sfPassword').type,'password');toggle.click();assert.equal($('sfPassword').type,'text');assert.equal(toggle.getAttribute('aria-pressed'),'true');assert.equal($('sfPassword').value,'fixture-password');
    $('sfEntryBack').click();await tick();assert.equal($('sfPassword').type,'password');assert.equal($('sfPassword').value,'');assert.equal(toggle.getAttribute('aria-pressed'),'false');
    w.document.querySelector('[data-entry-area="mitarbeiter"]').click();await tick();assert.equal($('sfAuthTitle').textContent,'Mitarbeiterportal');assert.equal($('sfPassword').type,'password');
  }finally{await h.close();}
});

test('password help has a named modal, labelled field, focus loop and Escape return',async()=>{
  const h=await loginFixture({reset:true});try{
    const {B,w,$}=h;B.passwordResetRequestDialog('fixture@example.invalid');
    const modal=$('sfPasswordResetBackdrop'),dialog=modal.querySelector('[role="dialog"]'),email=$('sfResetEmail');
    assert.equal(dialog.getAttribute('aria-modal'),'true');assert.equal(w.document.getElementById(dialog.getAttribute('aria-labelledby')).textContent,'Passwort vergessen?');
    assert.equal(modal.querySelector('label').control,email);assert.equal(w.document.activeElement,email);
    email.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));assert.equal(w.document.activeElement,$('sfResetSend'));
    $('sfResetSend').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));assert.equal(w.document.activeElement,email);
    email.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await w.happyDOM.whenAsyncComplete();
    assert.equal($('sfPasswordResetBackdrop'),null);assert.equal($('sfEmail').value,'fixture@example.invalid');assert.ok(w.document.activeElement.classList.contains('sf-forgot-link'));
  }finally{await h.close();}
});

test('password help validates locally, prevents duplicate sends and supports retry without account enumeration',async()=>{
  const h=await loginFixture({reset:true});try{
    const {B,w,$,calls}=h;B.passwordResetRequestDialog();$('sfResetSend').click();assert.equal(calls.length,0);assert.equal(w.document.activeElement,$('sfResetEmail'));
    $('sfResetEmail').value='invalid';$('sfResetSend').click();assert.equal(calls.length,0);assert.equal($('sfResetEmail').getAttribute('aria-invalid'),'true');
    let finish;B.client.auth.resetPasswordForEmail=()=>{calls.push({reset:true});return new Promise(resolve=>finish=resolve);};
    $('sfResetEmail').value='fixture@example.invalid';$('sfResetEmail').dispatchEvent(new w.Event('input'));$('sfResetSend').click();$('sfResetSend').click();assert.equal(calls.length,1);assert.equal($('sfResetSend').disabled,true);
    finish({error:{message:'Fixture network error'}});await tick();assert.equal($('sfResetSend').disabled,false);
    $('sfResetSend').click();finish({error:null});await tick();assert.equal(calls.length,2);assert.equal($('sfResetSend').disabled,true);assert.match($('sfResetMsg').textContent,/Wenn für diese E-Mail/);assert.equal($('sfResetMsg').getAttribute('role'),'status');
  }finally{await h.close();}
});

for(const file of ['impressum.html','datenschutz.html'])for(const area of ['verwaltung','mitarbeiter','zeit','zeitkonto'])test(`${file} preserves only the selected ${area} entry across legal links`,async()=>{
  const w=new Window({url:`https://schichtfunk.de/${file}?bereich=${area}&email=fixture%40example.invalid&access_token=do-not-copy#private`});try{
    w.document.body.innerHTML=read(file);w.eval(entrySource);
    for(const link of w.document.querySelectorAll('[data-sf-entry-return]'))assert.equal(link.getAttribute('href'),'/?bereich='+area);
    for(const link of w.document.querySelectorAll('.nav a'))if(/^\/(impressum|datenschutz)/.test(link.getAttribute('href')))assert.match(link.getAttribute('href'),new RegExp('\\?bereich='+area+'$'));
    assert.equal(w.SFBackend,undefined,'legal pages never initialize authentication');assert.equal(w.SFEntryAccess,undefined);
    assert.ok(w.document.querySelectorAll('script[src*="sf-entry-access-v1.js"]').length===1);
  }finally{await w.happyDOM.close();}
});

test('legal pages reject arbitrary return targets and leave external and section links intact',async()=>{
  const w=new Window({url:'https://schichtfunk.de/datenschutz?bereich=https://outside.invalid&returnTo=//outside.invalid'});try{
    w.document.body.innerHTML=read('datenschutz.html')+'<a href="https://outside.invalid/datenschutz">External</a>';
    const headingLinks=[...w.document.querySelectorAll('.toc a')].map(a=>a.getAttribute('href'));w.eval(entrySource);
    for(const link of w.document.querySelectorAll('[data-sf-entry-return]'))assert.equal(link.getAttribute('href'),'/');
    assert.deepEqual([...w.document.querySelectorAll('.toc a')].map(a=>a.getAttribute('href')),headingLinks);assert.equal(w.document.querySelector('a[href^="https://outside.invalid"]').getAttribute('href'),'https://outside.invalid/datenschutz');
  }finally{await w.happyDOM.close();}
});
