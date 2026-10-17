/* Small shared behaviours; business actions remain with their owning module. */
(function(){
 'use strict';
 let queued=false;
 function enhance(){
  queued=false;const portal=document.getElementById('sfEmployeePortal');if(!portal||window.SFBackend?.role!=='EMPLOYEE')return;
  const warning=portal.querySelector('.sf-profile-warning');
  if(warning&&!warning.dataset.compact){
   const message=warning.textContent.replace('Stammdaten unvollständig','').trim();
   const details=document.createElement('details'),summary=document.createElement('summary'),p=document.createElement('p'),button=document.createElement('button');
   warning.dataset.compact='1';summary.textContent='Stammdaten ergänzen lassen';p.textContent=message;button.type='button';button.className='ghost';button.textContent='Profil und Korrekturanfragen öffnen';
   button.onclick=()=>window.SFBackend?.employeePortalNavigate?.('profile');details.append(summary,p,button);warning.replaceChildren(details);
  }
 }
 new MutationObserver(records=>{if(!queued&&records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&(n.id==='sfEmployeePortal'||n.classList?.contains('sf-profile-warning')||n.querySelector?.('.sf-profile-warning'))))){queued=true;requestAnimationFrame(enhance)}}).observe(document.documentElement,{childList:true,subtree:true});
 document.addEventListener('click',e=>{if(!e.target.closest('[data-absence-profile]'))return;window.SFBackend?.employeeProfile?.request?.('employment','Bitte meinen Urlaubsanspruch, Übertrag und Resturlaub prüfen und mitteilen.');});
 enhance();
})();
