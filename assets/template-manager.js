(()=>{
  const K='schichtfunk_templates_v1';
  const PK='schichtfunk_shift_template_prefs_v2';
  const LEGACY_K='shiftpilot_templates_v1';
  const LEGACY_PK='shiftpilot_shift_template_prefs_v2';
  if(localStorage.getItem(K)===null&&localStorage.getItem(LEGACY_K)!==null)localStorage.setItem(K,localStorage.getItem(LEGACY_K));
  if(localStorage.getItem(PK)===null&&localStorage.getItem(LEGACY_PK)!==null)localStorage.setItem(PK,localStorage.getItem(LEGACY_PK));
  let mode='shift',editId=null,standardEditId=null;
  const read=()=>{try{return JSON.parse(localStorage.getItem(K)||'[]')}catch{return[]}};
  const write=v=>localStorage.setItem(K,JSON.stringify(v));
  const readPrefs=()=>{try{return JSON.parse(localStorage.getItem(PK)||'{}')}catch{return{}}};
  const writePrefs=v=>localStorage.setItem(PK,JSON.stringify(v));
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const types=()=>typeof TYPES!=='undefined'?TYPES:[];
  const soll=()=>typeof globalSoll!=='undefined'?globalSoll:{};
  const appStore=()=>typeof store!=='undefined'?store:null;

  function refreshApp(){
    try{typeof renderLibrary==='function'&&renderLibrary()}catch{}
    try{typeof renderCalendar==='function'&&renderCalendar()}catch{}
    try{typeof renderSettings==='function'&&renderSettings()}catch{}
    try{typeof renderOverview==='function'&&renderOverview()}catch{}
    try{typeof currentWeekDates==='function'&&typeof renderSoll==='function'&&renderSoll(currentWeekDates())}catch{}
    setTimeout(applyLibraryVisibility,0);
  }
  function close(){document.getElementById('tplMgr')?.remove()}
  function setFoot(saveVisible=false){
    const f=document.querySelector('#tplMgr .tpl-foot'); if(!f)return;
    f.innerHTML=`<button class="ghost" onclick="tplClose()">Schließen</button>${saveVisible?'<button class="primary" onclick="tplSave()">Vorlage speichern</button>':''}`;
  }
  function tabs(active='standard'){
    return `<div class="tpl-main-tabs"><button class="${active==='standard'?'active':''}" onclick="tplStandardList()">Standard-Schichtvorlagen</button><button class="${active==='own'?'active':''}" onclick="tplList()">Eigene Vorlagen</button></div>`;
  }
  function applyPrefs(){
    const p=readPrefs();
    types().forEach(t=>{const x=p[t.id];if(!x)return;if(x.color)t.cls=x.color});
    applyLibraryVisibility();
  }
  function applyLibraryVisibility(){
    const p=readPrefs();
    document.querySelectorAll('#view-schedule .shift-chip').forEach(ch=>{
      const id=(ch.querySelector('b')?.textContent||'').trim();
      ch.style.display=p[id]?.active===false?'none':'';
    });
  }
  function persistStandard(id,data){
    const t=types().find(x=>x.id===id);if(!t)return;
    t.start=data.start||t.start;t.end=data.end||t.end;if(data.color)t.cls=data.color;
    const g=soll();g[id]=Math.max(0,Number(data.soll||0));
    const p=readPrefs();p[id]={...(p[id]||{}),active:data.active!==false,color:t.cls,lastSoll:Math.max(0,Number(data.soll||0))};writePrefs(p);
    try{appStore()?.set('shiftTimes',Object.fromEntries(types().map(x=>[x.id,{start:x.start,end:x.end}])))}catch{}
    try{appStore()?.set('globalSoll',g)}catch{}
    refreshApp();
  }
  function standardList(){
    standardEditId=null;editId=null;
    const p=readPrefs(),g=soll();
    document.getElementById('tplContent').innerHTML=tabs('standard')+`<div class="tpl-list-head"><div><h3>Standard-Schichtvorlagen</h3><p>Die Kürzel bleiben fest, damit bestehende Dienstpläne und Mitarbeiterfreigaben gültig bleiben.</p></div><button class="primary" onclick="tplEditor()">＋ Eigene Vorlage</button></div><div class="tpl-standard-list">${types().map(t=>{const pref=p[t.id]||{},active=pref.active!==false;return `<div class="tpl-standard-row ${active?'':'inactive'}"><div class="tpl-standard-main"><span class="tpl-color-dot ${esc(t.cls||'teal')}"></span><div><b>${esc(t.id)}</b><small>${esc(t.start)}–${esc(t.end)} · SOLL ${Number(g[t.id]??0)} · ${active?'Aktiv':'Deaktiviert'}</small></div></div><div class="tpl-row-actions"><button class="ghost" onclick="tplEditStandard('${esc(t.id)}')">Bearbeiten</button><button class="ghost" onclick="tplToggleStandard('${esc(t.id)}')">${active?'Deaktivieren':'Aktivieren'}</button></div></div>`}).join('')}</div>`;
    setFoot(false);
  }
  function editStandard(id){
    const t=types().find(x=>x.id===id);if(!t)return;standardEditId=id;editId=null;
    const p=readPrefs()[id]||{},g=soll();
    document.getElementById('tplContent').innerHTML=tabs('standard')+`<button class="tpl-backlink" onclick="tplStandardList()">← Zurück zu Standardvorlagen</button><div class="tpl-editor-title"><h3>${esc(id)} bearbeiten</h3><p>Zeit, SOLL-Stärke, Farbe und Sichtbarkeit dieser Standard-Schicht festlegen.</p></div><div class="tpl-form"><label>Kürzel (fest)<input value="${esc(id)}" disabled></label><label>Status<select id="tplStdActive"><option value="1" ${p.active!==false?'selected':''}>Aktiv</option><option value="0" ${p.active===false?'selected':''}>Deaktiviert</option></select></label><label>Beginn<input id="tplStdStart" type="time" value="${esc(t.start)}"></label><label>Ende<input id="tplStdEnd" type="time" value="${esc(t.end)}"></label><label>SOLL-Stärke<input id="tplStdSoll" type="number" min="0" value="${Number(g[id]??0)}"></label><label>Farbe<select id="tplStdColor"><option value="blue">Blau</option><option value="amber">Amber</option><option value="pink">Pink</option><option value="teal">Türkis</option><option value="cyan">Cyan</option><option value="violet">Violett</option></select></label></div><div class="tpl-inline-note">Deaktivieren blendet die Vorlage aus der Schichtbibliothek aus. Bestehende Zuweisungen bleiben erhalten.</div><div class="tpl-editor-actions"><button class="ghost" onclick="tplStandardList()">Abbrechen</button><button class="primary" onclick="tplSaveStandard()">Änderungen speichern</button></div>`;
    const c=document.getElementById('tplStdColor');if(c)c.value=t.cls||p.color||'teal';setFoot(false);
  }
  function saveStandard(){
    if(!standardEditId)return;persistStandard(standardEditId,{start:document.getElementById('tplStdStart')?.value,end:document.getElementById('tplStdEnd')?.value,soll:document.getElementById('tplStdSoll')?.value,color:document.getElementById('tplStdColor')?.value,active:document.getElementById('tplStdActive')?.value!=='0'});
    standardList();
    try{typeof showSaveToast==='function'&&showSaveToast('Schichtvorlage gespeichert',`${standardEditId} wurde aktualisiert.`)}catch{}
  }
  function toggleStandard(id){
    const p=readPrefs(),g=soll(),t=types().find(x=>x.id===id);if(!t)return;
    const cur=p[id]||{},next=cur.active===false;
    if(next){const restore=Number(cur.lastSoll??g[id]??1);g[id]=restore>0?restore:1}else{p[id]={...cur,lastSoll:Number(g[id]??0)};g[id]=0}
    p[id]={...(p[id]||{}),active:next,color:t.cls,lastSoll:Number(p[id]?.lastSoll??g[id]??1)};writePrefs(p);
    try{appStore()?.set('globalSoll',g)}catch{}
    refreshApp();standardList();
  }

  function fields(){let b=document.getElementById('tplFields');if(!b)return;if(mode==='shift')b.innerHTML='<label>Kürzel<input id="tplCode" placeholder="z. B. O4"></label><label>SOLL-Stärke<input id="tplSoll" type="number" min="0" value="1"></label><label>Beginn<input id="tplStart" type="time" value="06:00"></label><label>Ende<input id="tplEnd" type="time" value="14:00"></label>';if(mode==='day')b.innerHTML='<label class="full">Wochentag<select id="tplDay"><option>Montag</option><option>Dienstag</option><option>Mittwoch</option><option>Donnerstag</option><option>Freitag</option><option>Samstag</option><option>Sonntag</option></select></label>';if(mode==='week')b.innerHTML='<p class="full tpl-note">Speichert die aktuellen SOLL-Stärken und Standard-Schichtzeiten als Wochenmuster.</p>';if(mode==='current')b.innerHTML='<p class="full tpl-note">Speichert die aktuell sichtbare Woche inklusive vorhandener Mitarbeiter-Zuweisungen.</p>'}
  function choose(t){mode=t;document.querySelectorAll('.tpl-type').forEach(x=>x.classList.toggle('active',x.dataset.type===t));fields()}
  function editor(t=null){editId=t?.id||null;standardEditId=null;mode=t?.type||'shift';document.getElementById('tplContent').innerHTML=tabs('own')+`<button class="tpl-backlink" onclick="tplList()">← Zurück zu eigenen Vorlagen</button><div class="tpl-types"><button class="tpl-type ${mode==='shift'?'active':''}" data-type="shift" onclick="tplChoose('shift')">◷<b>Schichtvorlage</b></button><button class="tpl-type ${mode==='day'?'active':''}" data-type="day" onclick="tplChoose('day')">▦<b>Tagesvorlage</b></button><button class="tpl-type ${mode==='week'?'active':''}" data-type="week" onclick="tplChoose('week')">▣<b>Wochenvorlage</b></button><button class="tpl-type ${mode==='current'?'active':''}" data-type="current" onclick="tplChoose('current')">★<b>Aktuellen Plan übernehmen</b></button></div><div class="tpl-form"><label class="full">Name<input id="tplName" value="${esc(t?.name||'')}" placeholder="z. B. Standard Frühdienst"></label><label class="full">Beschreibung<textarea id="tplDesc" rows="2">${esc(t?.description||'')}</textarea></label><div id="tplFields" class="tpl-form full"></div></div>`;fields();setTimeout(()=>{if(!t)return;if(t.type==='shift'){tplCode.value=t.code||'';tplSoll.value=t.soll??1;tplStart.value=t.start||'06:00';tplEnd.value=t.end||'14:00'}if(t.type==='day'&&window.tplDay)tplDay.value=t.day||'Montag'},0);setFoot(true)}
  function save(){const n=document.getElementById('tplName')?.value.trim();if(!n)return alert('Bitte einen Namen eingeben.');let d={name:n,description:tplDesc.value.trim(),type:mode,active:true,updatedAt:new Date().toISOString()};if(mode==='shift')Object.assign(d,{code:tplCode.value.trim()||n.slice(0,8),soll:Number(tplSoll.value||0),start:tplStart.value,end:tplEnd.value});if(mode==='day')d.day=tplDay.value;if(mode==='week')Object.assign(d,{globalSoll:JSON.parse(JSON.stringify(soll())),shiftTimes:types().map(x=>({id:x.id,start:x.start,end:x.end}))});if(mode==='current')Object.assign(d,{weekStart:typeof weekStart!=='undefined'&&typeof iso==='function'?iso(weekStart):'',assignments:typeof assignments!=='undefined'&&typeof currentWeekDates==='function'?assignments.filter(a=>currentWeekDates().map(iso).includes(a.date)).map(a=>({...a})):[]});let a=read();if(editId)a=a.map(x=>x.id===editId?{...x,...d,id:x.id}:x);else a.push({...d,id:'tpl_'+Date.now(),createdAt:new Date().toISOString()});write(a);list()}
  function summary(t){if(t.type==='shift')return `${t.code} · ${t.start}–${t.end} · SOLL ${t.soll}`;if(t.type==='day')return t.day;if(t.type==='week')return 'SOLL-Stärken & Schichtzeiten';return `${(t.assignments||[]).length} Zuweisungen`}
  function list(){editId=null;standardEditId=null;const a=read();document.getElementById('tplContent').innerHTML=tabs('own')+`<div class="tpl-list-head"><div><h3>Eigene Vorlagen</h3><p>Zusätzliche Muster für Schichten, Tage und ganze Wochen.</p></div><button class="primary" onclick="tplEditor()">＋ Neue Vorlage</button></div>${a.length?a.map(t=>`<div class="tpl-row ${t.active===false?'inactive':''}"><div><b>${esc(t.name)}</b><small>${t.type} · ${esc(summary(t))} · ${t.active===false?'Deaktiviert':'Aktiv'}</small></div><div><button class="ghost" onclick="tplEdit('${t.id}')">Bearbeiten</button><button class="ghost" onclick="tplDup('${t.id}')">Duplizieren</button><button class="ghost" onclick="tplToggle('${t.id}')">${t.active===false?'Aktivieren':'Deaktivieren'}</button><button class="ghost" onclick="tplDelete('${t.id}')">Löschen</button></div></div>`).join(''):'<div class="tpl-empty">Noch keine eigenen Vorlagen vorhanden.</div>'}`;setFoot(false)}
  function open(target='standard'){document.getElementById('tplMgr')?.remove();document.body.insertAdjacentHTML('beforeend','<div class="tpl-back" id="tplMgr"><div class="tpl-modal"><div class="tpl-head"><div><div class="eyebrow">VORLAGEN</div><h2>Vorlagenverwaltung</h2><p>Standard-Schichten und eigene Muster an einem Ort verwalten.</p></div><button class="iconbtn" onclick="tplClose()">✕</button></div><div class="tpl-body" id="tplContent"></div><div class="tpl-foot"></div></div></div>');target==='new'?editor():target==='own'?list():standardList()}
  function edit(id){const t=read().find(x=>x.id===id);if(t)editor(t)}
  function dup(id){let a=read(),t=a.find(x=>x.id===id);if(!t)return;a.push({...JSON.parse(JSON.stringify(t)),id:'tpl_'+Date.now(),name:t.name+' – Kopie'});write(a);list()}
  function toggle(id){write(read().map(x=>x.id===id?{...x,active:x.active===false}:x));list()}
  function del(id){if(confirm('Vorlage wirklich löschen?')){write(read().filter(x=>x.id!==id));list()}}

  window.openTemplateManager=open;window.tplClose=close;window.tplChoose=choose;window.tplEditor=editor;window.tplSave=save;window.tplEdit=edit;window.tplDup=dup;window.tplToggle=toggle;window.tplDelete=del;window.tplList=list;window.tplStandardList=standardList;window.tplEditStandard=editStandard;window.tplSaveStandard=saveStandard;window.tplToggleStandard=toggleStandard;

  document.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    const txt=(b.textContent||'').trim().toLowerCase();
    if(txt.includes('vorlagen verwalten')){e.preventDefault();e.stopPropagation();open('standard')}
  },true);
  const newBtn=document.getElementById('newTemplateBtn');if(newBtn)newBtn.onclick=()=>open('new');

  applyPrefs();
  if(typeof window.renderLibrary==='function'){
    const base=window.renderLibrary;window.renderLibrary=function(){const r=base.apply(this,arguments);setTimeout(applyLibraryVisibility,0);return r}
  }
  setTimeout(applyLibraryVisibility,250);
})();
