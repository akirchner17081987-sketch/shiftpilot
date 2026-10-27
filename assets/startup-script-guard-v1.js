// Track actual script completion; DOM presence alone does not mean code has executed.
(function(){
 'use strict';
 const key='sf_startup_script_retry_v1';let domReady=false,reloading=false,failed=false;
 const valid=node=>node?.tagName==='SCRIPT'&&!!node.src;
 const ours=node=>{try{const u=new URL(node.src,location.href);return u.origin===location.origin&&u.pathname.startsWith('/assets/')}catch{return false}};
 const fail=()=>{
  failed=true;
  const root=document.getElementById('sfEntryOverlay');
  if(!root||!root.isConnected||root.querySelector('[data-startup-script-error]'))return;
  root.classList.add('sf-startup-failed');
  const box=document.createElement('section');box.dataset.startupScriptError='true';box.setAttribute('role','alert');
  const text=document.createElement('p');text.textContent='SchichtFunk konnte nicht vollständig geladen werden. Bitte lade die Seite erneut.';
  const button=document.createElement('button');button.type='button';button.textContent='Seite erneut laden';button.onclick=()=>location.reload();
  box.append(text,button);(root.querySelector('.sf-entry-access')||root).append(box);
 };
 const deadline=setTimeout(()=>{if(!domReady)fail()},20000);
 document.addEventListener('DOMContentLoaded',()=>{domReady=true;clearTimeout(deadline)},{once:true});
 document.addEventListener('load',event=>{if(valid(event.target))event.target.dataset.sfLoadState='loaded'},true);
 document.addEventListener('error',event=>{
  const node=event.target;if(!valid(node))return;node.dataset.sfLoadState='failed';
  // Before DOMContentLoaded authentication and booking actions have not started.
  // Recover one failed cold load, never an active workspace or a partly entered login.
  if(!domReady&&ours(node)&&!reloading){
   let recent=true;try{recent=Date.now()-Number(sessionStorage.getItem(key)||0)<300000;if(!recent)sessionStorage.setItem(key,String(Date.now()))}catch{}
   if(!recent){reloading=true;location.reload();return}
  }
  if(!domReady)fail();
 },true);
 const wait=node=>new Promise((resolve,reject)=>{
  if(node.dataset.sfLoadState==='loaded'){resolve();return}
  if(node.dataset.sfLoadState==='failed'){reject(new Error('Script wurde nicht geladen.'));return}
  let timer;const clean=()=>{clearTimeout(timer);node.removeEventListener('load',loaded);node.removeEventListener('error',error)};
  const loaded=()=>{clean();resolve()},error=()=>{clean();reject(new Error('Script wurde nicht geladen.'))};
  node.addEventListener('load',loaded,{once:true});node.addEventListener('error',error,{once:true});
  timer=setTimeout(()=>{clean();reject(new Error('Script antwortet nicht.'))},20000);
 });
 window.SFStartupScripts={wait,fail,assertReady(){if(failed||reloading)throw new Error('Der Seitenstart wurde unterbrochen.')},ready(){if(!failed)try{sessionStorage.removeItem(key)}catch{}}};
})();
