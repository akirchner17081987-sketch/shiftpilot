// Private credential requests and employee submissions. Every operation is checked again by the server.
(function(){
 'use strict';
 const B=window.SFBackend=window.SFBackend||{};if(B.evidence)return;
 const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const status={requested:'Angefordert',in_review:'Zur Prüfung',changes_requested:'Nachbesserung nötig',approved:'Übernommen',cancelled:'Zurückgezogen',uploading:'Upload vorbereitet',submitted:'Eingereicht'};
 const employee=()=>B.employeeDbId||B.employeePortalData?.employee?.id;
 const scope=()=>[B.companyId,B.user?.id,B.role,employee(),B.ready].join('|');
 const demo=()=>!!B.client?.__sfDemoLocalClientV1;
 const manager=()=>B.ready&&['OWNER','ADMIN'].includes(B.role)&&!!B.companyId;
 const personal=()=>B.ready&&B.role==='EMPLOYEE'&&!!employee()&&!!B.companyId;
 const date=v=>v?new Date(v+'T12:00Z').toLocaleDateString('de-DE'):'Keine Frist';
 let managerState=null,employeeState=null,scheduled=false;
 function css(){if($('sfEvidenceCss'))return;const l=document.createElement('link');l.id='sfEvidenceCss';l.rel='stylesheet';l.href='assets/personnel-evidence-v1.css?v=20261020-1';document.head.append(l)}
 function current(s){return s&&s.owner===scope()&&s.host.isConnected&&(s.mode==='manager'?manager():personal())}
 function message(s,text){if(current(s))s.host.querySelector('[data-evidence-feedback]').textContent=text}
 async function rpc(s,action,payload={}){
  if(!current(s))throw Error('Der Zugang wurde gewechselt. Bitte neu öffnen.');
  if(demo())throw Error('Der Nachweis-Service ist im Demo-Modus nicht verfügbar.');
  const r=await B.client.rpc('personnel_evidence',{p_company_id:B.companyId,p_mode:s.mode,p_action:action,p_payload:{...(s.mode==='employee'?{employee_id:employee()}:{}),...payload}});
  if(!current(s))throw Error('Der Zugang wurde gewechselt. Bitte neu öffnen.');
  if(r.error)throw Error(r.error.message||'Nachweis-Service derzeit nicht erreichbar.');
  return typeof r.data==='string'?JSON.parse(r.data):r.data;
 }
 const label=(text,field)=>`<label>${text}${field}</label>`;
 function rowHtml(s,r){
  const writable=['requested','changes_requested'].includes(r.status),last=r.submissions.find(x=>x.status==='submitted'),pending=r.submissions.find(x=>x.status==='uploading');
  const attempts=r.submissions.map(a=>`<li><div><b>${esc(a.file_name)}</b><span>${esc(status[a.status])} · ${(Number(a.file_size)/1024).toFixed(0)} KB</span></div>${a.uploaded?`<button type="button" data-evidence-file="${esc(a.id)}">Datei öffnen</button>`:''}${a.review_note?`<p class="sf-ev-note">${esc(a.review_note)}</p>`:''}</li>`).join('');
  let actions='';
  if(s.mode==='employee'&&writable){actions=`<form data-evidence-upload><p>PDF, JPG, PNG oder WebP · maximal 10 MB. Bitte ausschließlich den angeforderten Nachweis einreichen.</p>${pending?.uploaded?`<p>Die Datei <b>${esc(pending.file_name)}</b> wurde hochgeladen und wartet noch auf die Einreichung.</p><button type="button" data-evidence-resume="${esc(pending.id)}">Vorbereitete Datei einreichen</button>`:`${label('Datei auswählen','<input type="file" name="file" required accept="application/pdf,image/jpeg,image/png,image/webp">')}<button class="sf-ev-primary" type="submit">Nachweis einreichen</button>`}</form>`}
  if(s.mode==='manager'&&r.status==='in_review'&&last){actions=`<form data-evidence-review data-submission="${esc(last.id)}"><h4>Einreichung prüfen</h4><p>Datei öffnen und Inhalt prüfen. Die Übernahme speichert das Dokument in der Personalakte.</p>${label('Geprüfter Titel',`<input name="title" value="${esc(r.title)}" maxlength="180" minlength="2" required>`)}<div class="sf-ev-fields">${label('Ausgestellt am','<input name="issued_on" type="date">')}${label('Gültig bis','<input name="expires_on" type="date">')}</div>${label('Aussteller','<input name="issuer" maxlength="180">')}${label('Rückmeldung an den Mitarbeiter','<textarea name="note" rows="3" minlength="5" maxlength="2000" required></textarea>')}<label class="sf-ev-check"><input name="save_qualification" type="checkbox" checked> ${r.qualification_id?'Zugehörige Qualifikation mit den geprüften Angaben aktualisieren':'Auch als Qualifikation erfassen'}</label><p>Schichtfreigaben bleiben gesondert zu prüfen.</p><label class="sf-ev-check"><input name="confirmed" type="checkbox"> Ich habe die Datei und die Angaben geprüft.</label><div class="sf-ev-actions"><button type="submit" class="sf-ev-primary" value="approved">Prüfen & in Personalakte übernehmen</button><button type="submit" value="changes_requested" formnovalidate>Nachbesserung anfordern</button></div></form>`}
  if(s.mode==='manager'&&!['approved','cancelled'].includes(r.status))actions+=`<details class="sf-ev-cancel"><summary>Anforderung zurückziehen</summary><form data-evidence-cancel>${label('Begründung für den Mitarbeiter','<textarea name="note" rows="2" required minlength="5" maxlength="2000"></textarea>')}<button type="submit">Anforderung zurückziehen</button></form></details>`;
  return `<details class="sf-ev-row" data-evidence-request="${esc(r.id)}"><summary><span><b>${esc(r.title)}</b><small>${s.mode==='manager'?esc([r.last_name,r.first_name].filter(Boolean).join(', '))+' · ':''}${esc(date(r.due_on))}</small></span><strong class="sf-ev-status ${esc(r.status)}">${esc(status[r.status])}</strong></summary><div class="sf-ev-detail">${r.instructions?`<p class="sf-ev-note">${esc(r.instructions)}</p>`:''}${r.closed_note?`<p class="sf-ev-note">${esc(r.closed_note)}</p>`:''}${attempts?`<h4>Einreichungen & Rückmeldungen</h4><ul class="sf-ev-attempts">${attempts}</ul>`:'<p>Noch keine Einreichung vorhanden.</p>'}${actions}</div></details>`;
 }
 function draw(s,openId){
  if(!current(s))return;
  const f=s.host.querySelector('[data-evidence-filter]').value;
  const list=s.rows.filter(r=>f==='all'||(f==='open'?!['approved','cancelled'].includes(r.status):r.status===f));
  s.host.querySelector('[data-evidence-list]').innerHTML=list.length?list.map(r=>rowHtml(s,r)).join(''):'<p>Keine passenden Nachweisanforderungen in den geladenen Einträgen.</p>';
  if(openId)s.host.querySelector(`[data-evidence-request="${CSS.escape(openId)}"]`)?.setAttribute('open','');
  s.host.querySelector('[data-evidence-summary]').textContent=`${s.rows.length} von ${s.total} Anforderungen geladen`;
  s.host.querySelector('[data-evidence-more]').hidden=s.rows.length>=s.total;
  const count=s.rows.filter(r=>['requested','changes_requested'].includes(r.status)).length;
  if(s.mode==='employee'){s.host.dataset.sfActionCount=String(count);const banner=$('sfEvidenceHome');if(banner)banner.querySelector('span').textContent=count?`${count} Nachweisanforderungen warten auf dich.`:'Nachweise einreichen und Rückmeldungen verfolgen.'}
 }
 async function load(s,more=false,openId){
  if(!current(s)||s.busy||s.loading)return;s.loading=true;const n=++s.sequence;
  message(s,'Nachweise werden geladen …');
  try{const d=await rpc(s,'list',{offset:more?s.rows.length:0});if(!current(s)||n!==s.sequence)return;if(d?.company_id!==B.companyId||!Array.isArray(d.requests))throw Error('Unvollständige Antwort');s.rows=more?s.rows.concat(d.requests):d.requests;s.total=Number(d.total);draw(s,openId);message(s,'')}
  catch(e){if(current(s)&&n===s.sequence)message(s,`Nachweise konnten nicht geladen werden. ${e.message}`)}
  finally{if(n===s.sequence)s.loading=false}
 }
 async function perform(s,task,openId,refresh=true){
  if(!current(s)||s.busy||s.loading)return;s.busy=true;
  const controls=[...s.host.querySelectorAll('button,input,select,textarea')];controls.forEach(x=>x.disabled=true);
  message(s,'Vorgang wird gespeichert …');let saved=false;
  try{await task();saved=true;message(s,'Gespeichert.');B.notifications?.refresh?.();}
  catch(e){message(s,e.message||'Vorgang nicht gespeichert. Bitte erneut versuchen.');}
  finally{s.busy=false;controls.forEach(x=>{if(x.isConnected)x.disabled=false})}
  if(saved&&current(s)&&refresh)await load(s,false,openId);
 }
 async function openFile(s,r,id){
  await perform(s,async()=>{const d=await rpc(s,'file',{request_id:r.id,submission_id:id});const result=await B.client.storage.from('personnel-documents').download(d.path);if(result.error)throw result.error;if(!current(s))return;const url=URL.createObjectURL(result.data),a=document.createElement('a');a.href=url;a.download=d.file_name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000)},r.id,false);
 }
 function bind(s){
  const host=s.host;
  host.querySelector('[data-evidence-refresh]').onclick=()=>load(s);
  host.querySelector('[data-evidence-more]').onclick=()=>load(s,true);
  host.querySelector('[data-evidence-filter]').onchange=()=>{if(!s.busy&&!s.loading)draw(s)};
  host.addEventListener('click',e=>{
   const b=e.target.closest('button'),row=b?.closest('[data-evidence-request]');if(!row||s.busy||s.loading)return;const r=s.rows.find(x=>x.id===row.dataset.evidenceRequest);if(!r)return;
   if(b.dataset.evidenceFile)openFile(s,r,b.dataset.evidenceFile);
   if(b.dataset.evidenceResume)perform(s,()=>rpc(s,'submit',{request_id:r.id,submission_id:b.dataset.evidenceResume,revision:r.revision}),r.id);
  });
  host.addEventListener('submit',e=>{
   const form=e.target;if(!form.matches('[data-evidence-upload],[data-evidence-review],[data-evidence-create],[data-evidence-cancel]'))return;e.preventDefault();if(!current(s)||s.busy||s.loading)return;
   const row=form.closest('[data-evidence-request]'),r=s.rows.find(x=>x.id===row?.dataset.evidenceRequest),values=Object.fromEntries(new FormData(form));
   if(form.matches('[data-evidence-create]')){const target=form.querySelector('[name="employee_id"]'),q=s.qualification;form.dataset.operationId||=crypto.randomUUID();perform(s,async()=>{await rpc(s,'create',{...values,operation_id:form.dataset.operationId,due_on:values.due_on||null,qualification_id:q?.id||null});delete form.dataset.operationId;form.reset();s.qualification=null;const hint=form.querySelector('[data-evidence-linked]');if(hint)hint.remove();target.disabled=false});return}
   if(!r)return;
   if(form.matches('[data-evidence-upload]')){
    const file=form.querySelector('[type="file"]').files[0];if(!file||!['application/pdf','image/jpeg','image/png','image/webp'].includes(file.type)||file.size<1||file.size>10485760){message(s,'Bitte PDF, JPG, PNG oder WebP mit maximal 10 MB auswählen.');return}
    perform(s,async()=>{const d=await rpc(s,'reserve',{request_id:r.id,revision:r.revision,file_name:file.name,mime_type:file.type,file_size:file.size});
     if(!d.uploaded){const up=await B.client.storage.from('personnel-documents').upload(d.path,file,{upsert:false,contentType:file.type,cacheControl:'0'});if(up.error)throw Error('Upload nicht bestätigt. Bitte mit derselben Datei erneut versuchen oder aktualisieren. '+up.error.message)}
     if(!current(s))return;await rpc(s,'submit',{request_id:r.id,revision:r.revision,submission_id:d.id});
    },r.id);return;
   }
   const note=String(values.note||'').trim();if(note.length<5){message(s,'Bitte eine Rückmeldung mit mindestens fünf Zeichen eintragen.');return}
   if(form.matches('[data-evidence-cancel]')){perform(s,()=>rpc(s,'cancel',{request_id:r.id,revision:r.revision,note}),r.id);return}
   const decision=e.submitter?.value;if(decision==='approved'&&!form.querySelector('[name="confirmed"]').checked){message(s,'Bitte die Prüfung der Datei und Angaben bestätigen.');return}
   perform(s,()=>rpc(s,'review',{...values,issued_on:values.issued_on||null,expires_on:values.expires_on||null,request_id:r.id,revision:r.revision,submission_id:form.dataset.submission,decision,confirmed:form.querySelector('[name="confirmed"]').checked,save_qualification:form.querySelector('[name="save_qualification"]').checked}),r.id);
  });
 }
 function contents(){return `<div class="sf-ev-toolbar"><label>Anzeigen<select data-evidence-filter aria-label="Nachweise filtern"><option value="open">Offene Anforderungen</option><option value="in_review">Zur Prüfung</option><option value="approved">Übernommen</option><option value="cancelled">Zurückgezogen</option><option value="all">Alle geladenen Anforderungen</option></select></label><button type="button" data-evidence-refresh>Aktualisieren</button></div><p data-evidence-feedback role="status" aria-live="polite"></p><p data-evidence-summary></p><div data-evidence-list></div><button type="button" data-evidence-more hidden>Weitere 50 laden</button>`}
 function state(host,mode){const s={host,mode,owner:scope(),rows:[],total:0,busy:false,loading:false,sequence:0};bind(s);return s}
 function mountEmployee(){
  const grid=$('sfEmployeePortal')?.querySelector('.sf-portal-grid');if(!grid||!personal())return;
  css();let card=$('sfEmployeeEvidence');
  if(!card){card=document.createElement('section');card.id='sfEmployeeEvidence';card.className='sf-portal-card sf-ev';card.dataset.sfPortalSection='evidence';card.innerHTML='<h3>Meine Nachweise</h3><p>Angeforderte Nachweise einreichen und den Prüfstatus verfolgen.</p>'+contents();grid.append(card)}
  if(!employeeState||employeeState.owner!==scope()||employeeState.host!==card){employeeState=state(card,'employee');load(employeeState)}
  const dashboard=grid.querySelector('.sf-employee-dashboard')||grid.querySelector('[data-sf-portal-section="dashboard"]');
  if(dashboard&&!$('sfEvidenceHome')){const b=document.createElement('button');b.id='sfEvidenceHome';b.type='button';b.className='sf-ev-home';b.innerHTML='<b>Meine Nachweise</b><span>Nachweise einreichen und Rückmeldungen verfolgen.</span>';b.onclick=()=>B.employeePortalNavigate?.('evidence');dashboard.append(b)}
 }
 function launch(){
  const view=$('view-employees');if(!manager()){ $('sfEvidenceLaunch')?.remove();return}
  if(!view||$('sfEvidenceLaunch'))return;css();const b=document.createElement('div');b.id='sfEvidenceLaunch';b.className='sf-ev-launch';b.innerHTML='<div><b>Nachweise anfordern & prüfen</b><p>Mitarbeiter reichen angeforderte Dokumente direkt im Portal ein.</p></div><button type="button">Nachweise öffnen</button>';b.querySelector('button').onclick=()=>openManager();view.querySelector('.page-head')?.insertAdjacentElement('afterend',b);if(!b.isConnected)view.prepend(b);
 }
 async function openManager(options={}){
  if(!manager())return;const owner=scope();if(B.requireSensitiveMfa)try{await B.requireSensitiveMfa()}catch{return}if(owner!==scope()||!manager())return;
  if(managerState?.busy)return;$('sfEvidenceManager')?.remove();css();
  const staff=typeof employees!=='undefined'?employees:[],eligible=staff.filter(e=>e.status==='active').map(e=>({id:e._dbId||B.empDb?.get(String(e.id)),name:[e.last,e.first].filter(Boolean).join(', '),no:e.personnelNo})).filter(e=>e.id);
  const host=document.createElement('div');host.id='sfEvidenceManager';host.className='sf-ev-back';host.innerHTML=`<section class="sf-ev-dialog sf-ev" role="dialog" aria-modal="true" aria-labelledby="sfEvidenceTitle"><header><h2 id="sfEvidenceTitle">Nachweise anfordern & prüfen</h2><button type="button" data-evidence-close aria-label="Nachweise schließen">×</button></header><details data-evidence-new><summary>Neuen Nachweis anfordern</summary><form data-evidence-create>${label('Mitarbeiter',`<select name="employee_id" required><option value="">Bitte auswählen</option>${eligible.map(e=>`<option value="${esc(e.id)}">${esc(e.name)}${e.no?' · '+esc(e.no):''}</option>`).join('')}</select>`)}${label('Angeforderter Nachweis','<input name="title" required minlength="2" maxlength="180" placeholder="z. B. erneuerter Erste-Hilfe-Nachweis">')}${label('Bitte einreichen bis','<input name="due_on" type="date">')}${label('Hinweis für den Mitarbeiter','<textarea name="instructions" rows="3" maxlength="2000"></textarea>')}<button type="submit" class="sf-ev-primary">Nachweis anfordern</button></form></details>${contents()}</section>`;
  document.body.append(host);const s=managerState=state(host,'manager'),opener=document.activeElement;if(options.requestId)host.querySelector('[data-evidence-filter]').value='all';
  const close=()=>{if(s.busy)return;s.sequence++;host.remove();managerState=null;if(opener?.isConnected)opener.focus()};host.querySelector('[data-evidence-close]').onclick=close;
  host.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close()}if(e.key==='Tab'){const f=[...host.querySelectorAll('button,input,select,textarea,summary')].filter(x=>!x.disabled&&x.getClientRects().length),first=f[0],last=f.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}});
  if(options.employeeId){const select=host.querySelector('[name="employee_id"]');select.value=options.employeeId;host.querySelector('[data-evidence-new]').open=true;if(options.qualification){s.qualification=options.qualification;host.querySelector('[name="title"]').value=options.qualification.title;const p=document.createElement('p');p.dataset.evidenceLinked='';p.textContent='Verlängerung der ausgewählten Qualifikation. Bitte diesen Mitarbeiter ausgewählt lassen.';select.after(p);select.onchange=()=>{s.qualification=null;p.remove()}}}
  host.querySelector('[data-evidence-close]').focus();await load(s,false,options.requestId);
 }
 function ensure(){
  if(employeeState&&!current(employeeState)){employeeState.sequence++;employeeState.host.remove();employeeState=null;$('sfEvidenceHome')?.remove()}
  if(managerState&&!current(managerState)){managerState.sequence++;managerState.host.remove();managerState=null}
  launch();mountEmployee();
 }
 function schedule(){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;ensure()})}
 B.evidence={openManager,load:()=>{mountEmployee();if(employeeState)load(employeeState)},clear(){if(employeeState)employeeState.sequence++;if(managerState)managerState.sequence++;$('sfEvidenceManager')?.remove();$('sfEmployeeEvidence')?.remove();$('sfEvidenceHome')?.remove();$('sfEvidenceLaunch')?.remove();employeeState=managerState=null}};
 for(const key of ['finishSignOut','switchCompany']){const old=B[key];if(typeof old==='function')B[key]=function(){B.evidence.clear();const r=old.apply(this,arguments);Promise.resolve(r).finally(schedule);return r}}
 new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-sf-portal-active']});
 window.addEventListener('focus',schedule);schedule();
})();
