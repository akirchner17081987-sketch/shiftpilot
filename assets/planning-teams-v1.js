// SchichtFunk – central, company scoped rhythms for planning teams A–E.
(function(){
  if(window.SFPlanningTeams)return;
  const B=window.SFBackend=window.SFBackend||{},R=window.SFRhythm;
  const M=window.SFPlanningTeams={companyId:null,rules:[],busy:false};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const demo=()=>sessionStorage.getItem('sf_demo_session_v1')==='active';
  const staff=()=>typeof employees==='undefined'?[]:employees.filter(e=>!e.deletedAt);
  const memberTeam=e=>e.planningTeam??String((e.qualifications||[]).find(q=>String(q).startsWith('__sp:planningTeam='))||'').split('=')[1]??'';
  const codes=()=>typeof TYPES==='undefined'?[]:TYPES.map(t=>t.id.toUpperCase());
  const label=t=>({FREI:'Frei',ALLE:'Arbeiten (alle freigegebenen Schichten)'}[t]||t);
  M.isLoaded=()=>!demo()&&!!B.companyId&&M.companyId===B.companyId;
  M.canManage=()=>M.isLoaded()&&B.ready&&['OWNER','ADMIN','PLANNER','DISPATCHER'].includes(B.role);
  M.apply=(rows,companyId)=>{if(demo())return;M.companyId=companyId;M.rules=(rows||[]).map(r=>({team:r.team_code,start:r.start_date,pattern:r.pattern.map(t=>window.SFShiftModels?.teamRhythmCode(t)||t),offset:Number(r.start_offset)}));};
  M.get=team=>M.isLoaded()?M.rules.find(r=>r.team===team):null;
  M.suggest=team=>{
    const saved=M.get(team);if(saved)return{...saved,pattern:[...saved.pattern]};
    const peer=staff().find(e=>memberTeam(e)===team)||staff().find(e=>R.teams.includes(memberTeam(e))),legacy=peer?R.config(peer):null;
    const pattern=legacy?.pattern.length?[...legacy.pattern]:['FD','SD','ND'].every(c=>codes().includes(c))?['FD','FD','SD','SD','FREI','ND','ND','FREI','FREI','FREI']:['ALLE','ALLE','ALLE','ALLE','FREI','FREI'];
    return{team,start:legacy?.start||'',pattern,offset:R.teamOffset(team,pattern.length)};
  };
  M.validate=rule=>{
    const pattern=Array.isArray(rule.pattern)?rule.pattern.map(R.normalizeToken):[];
    if(!R.teams.includes(rule.team))throw Error('Bitte Team A bis E auswählen.');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(rule.start||'')||!Number.isFinite(Date.parse(rule.start+'T00:00:00Z'))||new Date(rule.start+'T00:00:00Z').toISOString().slice(0,10)!==rule.start)throw Error('Bitte ein gültiges Startdatum auswählen.');
    if(!pattern.length||pattern.length>365||pattern.some(t=>!['FREI','ALLE',...codes()].includes(t)))throw Error('Bitte 1 bis 365 Tage mit aktiven Schichtmodellen oder Frei auswählen.');
    if(!Number.isInteger(rule.offset)||rule.offset<0||rule.offset>=pattern.length)throw Error('Bitte eine gültige Einstiegsposition auswählen.');
    const missing=staff().filter(e=>memberTeam(e)===rule.team&&pattern.some(t=>!['FREI','ALLE'].includes(t)&&!(e.shifts||[]).map(x=>x.toUpperCase()).includes(t)));
    if(missing.length)throw Error(`Für ${missing.length} zugeordnete Mitarbeiter fehlen Schichtfreigaben für diesen Rhythmus. Bitte zuerst unter Personal → Mitarbeiter → Qualifikationen ergänzen.`);
    return{team:rule.team,start:rule.start,pattern,offset:rule.offset};
  };
  M.save=async rule=>{
    if(!M.canManage())throw Error('Für dieses Unternehmen fehlen aktive Planungsrechte.');
    if(M.busy||B.companySwitching||B.syncing||B.bootPromise||B.employeeStatusSaving||B.shiftModelSaving||B.autoPlanApplying||B.schedulePublishing)throw Error('Daten werden noch gespeichert oder geladen. Bitte versuche es gleich erneut.');
    const valid=M.validate(rule),companyId=B.companyId;M.busy=true;
    try{
      // Finish a pending general sync before blocking further syncs.
      if(B.syncTimer){clearTimeout(B.syncTimer);B.syncTimer=null;await B.sync();if(B.lastSyncError)throw B.lastSyncError;}
      B.teamRhythmSaving=true;
      const q=await B.client.rpc('manager_save_planning_team',{p_company_id:companyId,p_team_code:valid.team,p_start_date:valid.start,p_pattern:valid.pattern,p_start_offset:valid.offset});
      if(q.error)throw q.error;
      if(B.companyId!==companyId)throw Error('Die Teamregel wurde gespeichert. Bitte lade das Unternehmen neu.');
      const row=q.data;M.rules=M.rules.filter(r=>r.team!==valid.team);M.rules.push(row?{team:row.team_code,start:row.start_date,pattern:row.pattern.map(t=>window.SFShiftModels?.teamRhythmCode(t)||t),offset:Number(row.start_offset)}:valid);
      window.clearAutoPlanPreview?.();
      for(const fn of ['renderEmployees','renderPlanEmployeePool','renderCalendar','renderOverview'])window[fn]?.();
      return valid;
    }finally{M.busy=false;B.teamRhythmSaving=false;}
  };
  function styles(){
    if(document.getElementById('sfPlanningTeamsCss'))return;
    const s=document.createElement('style');s.id='sfPlanningTeamsCss';s.textContent=`
      .sf-team-card{background:var(--panel)!important;color:var(--text)!important}.sf-team-card p,.sf-team-card small{color:var(--muted)!important}.sf-team-list{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:16px 0}.sf-team-tile{border:1px solid var(--line);border-radius:12px;padding:14px;background:var(--bg);display:flex;flex-direction:column;gap:8px;min-width:0}.sf-team-tile b{font-size:18px}.sf-team-tile small{line-height:1.5;overflow-wrap:anywhere}.sf-team-tile button{margin-top:auto;min-height:44px}.sf-team-editor{border-top:1px solid var(--line);padding-top:18px}.sf-team-editor h4{font-size:18px;margin:0 0 10px}.sf-team-fields{display:grid;grid-template-columns:1fr 1fr;gap:14px}.sf-team-editor label{font-size:13px;display:block}.sf-team-editor label>span{display:block;margin-bottom:6px}.sf-team-editor input,.sf-team-editor select{background:var(--bg);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:9px;min-height:44px;width:100%;box-sizing:border-box}.sf-team-days{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:14px 0}.sf-team-day{border:1px solid var(--line);border-radius:10px;padding:10px}.sf-team-day button{margin-top:6px;min-height:44px;width:100%;font-size:12px}.sf-team-actions{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0}.sf-team-actions button{min-height:44px}.sf-team-preview{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}.sf-team-preview span{border:1px solid var(--line);border-radius:8px;padding:8px;font-size:12px;background:var(--bg)}.sf-team-message{line-height:1.5;font-size:13px;margin-top:12px}.sf-team-message.error{color:var(--danger,#ef7484)}
      @media(max-width:1000px){.sf-team-list{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:600px){.sf-team-list,.sf-team-fields{grid-template-columns:1fr}.sf-team-tile{display:grid;grid-template-columns:1fr auto}.sf-team-tile small{grid-column:1}.sf-team-tile button{grid-column:2;grid-row:1/4}.sf-team-actions button{flex:1}}
    `;document.head.appendChild(s);
  }
  M.enhance=host=>{
    if(demo()||!host?.querySelector('.sf-set-grid'))return;styles();host.querySelector('#sfPlanningTeams')?.remove();
    const card=document.createElement('section');card.id='sfPlanningTeams';card.className='sf-set-card full sf-team-card';
    card.innerHTML=`<h3>Teamrhythmen A–E</h3><p>Startdatum, Tagesfolge und Einstieg für jedes Team einzeln festlegen. Alle zugeordneten Mitarbeiter übernehmen die Teamregel verbindlich bei manueller Planung und Auto-Planung.</p><div class="sf-team-list">${R.teams.map(t=>{const r=M.get(t),count=staff().filter(e=>memberTeam(e)===t&&e.status==='active').length;return`<div class="sf-team-tile"><b>Team ${t}</b><small>${count} aktive Mitarbeiter</small><small>${r?`${r.pattern.length} Tage · Einstieg Tag ${r.offset+1}<br>Ab ${esc(new Date(r.start+'T12:00:00').toLocaleDateString('de-DE'))}`:'Noch keine zentrale Regel'}</small><button type="button" class="ghost" data-edit-team="${t}" ${M.canManage()?'':'disabled'}>${r?'Bearbeiten':'Einrichten'}</button></div>`;}).join('')}</div><small>Mitarbeiter unter Personal → Mitarbeiter einem Planungsteam zuordnen. Ohne Teamzuordnung gilt die individuelle Schichtregel.</small><div class="sf-team-editor" hidden></div>`;
    host.querySelector('.sf-set-grid').prepend(card);
    card.querySelectorAll('[data-edit-team]').forEach(b=>b.onclick=()=>openEditor(card,b.dataset.editTeam));
  };
  function openEditor(card,team){
    if(!M.canManage()||M.busy)return;
    const rule=M.suggest(team),editor=card.querySelector('.sf-team-editor');let saving=false;
    editor.hidden=false;editor.innerHTML=`<h4 tabindex="-1">Rhythmus für Team ${team}</h4><p>Der Zyklus beginnt am Startdatum an der gewählten Einstiegsposition. Nach dem letzten Tag beginnt die Folge wieder von vorn.</p><form><div class="sf-team-fields"><label><span>Rhythmus beginnt am</span><input id="sfTeamStart" type="date" required value="${esc(rule.start)}"></label><label><span>Einstieg am Startdatum</span><select id="sfTeamOffset"></select></label></div><h4 style="margin-top:20px">Tagesfolge</h4><div class="sf-team-days"></div><div class="sf-team-actions"><button type="button" class="ghost" data-add-day>＋ Tag hinzufügen</button><button type="button" class="ghost" data-preset ${['FD','SD','ND'].every(c=>codes().includes(c))?'':'disabled'}>Vorgabe: 2 FD · 2 SD · Frei · 2 ND · 3 Frei</button></div><div class="sf-team-preview" aria-live="polite"></div><p>Speichern gilt für alle Mitglieder von Team ${team} im ausgewählten Unternehmen. Vorhandene Dienste bleiben bestehen. Eine bisherige Auto-Planungs-Vorschau wird verworfen und kann neu erstellt werden.</p><div class="sf-team-message" role="status"></div><div class="sf-team-actions"><button type="button" class="ghost" data-cancel>Abbrechen</button><button type="submit" class="primary">Team ${team} speichern</button></div></form>`;
    const days=editor.querySelector('.sf-team-days'),offset=editor.querySelector('#sfTeamOffset'),start=editor.querySelector('#sfTeamStart'),message=editor.querySelector('.sf-team-message');
    const preview=()=>{
      const base=Date.parse(start.value+'T00:00:00Z');
      editor.querySelector('.sf-team-preview').innerHTML=Array.from({length:Math.min(rule.pattern.length,10)},(_,i)=>`<span>${Number.isFinite(base)?new Date(base+i*86400000).toLocaleDateString('de-DE',{timeZone:'UTC'}):`${i+1}. Tag`}: <b>${esc(label(rule.pattern[(rule.offset+i)%rule.pattern.length]))}</b></span>`).join('');
    };
    const renderDays=()=>{
      days.innerHTML=rule.pattern.map((t,i)=>`<div class="sf-team-day"><label><span>Tag ${i+1}</span><select data-day="${i}" aria-label="Schicht an Tag ${i+1}">${[...new Set([...codes(),'FREI','ALLE',t])].map(v=>`<option value="${esc(v)}" ${v===t?'selected':''}>${esc(label(v))}</option>`).join('')}</select></label><button type="button" class="ghost" data-remove-day="${i}" ${rule.pattern.length===1?'disabled':''}>Tag ${i+1} entfernen</button></div>`).join('');
      offset.innerHTML=rule.pattern.map((t,i)=>`<option value="${i}" ${i===rule.offset?'selected':''}>Tag ${i+1} · ${esc(label(t))}</option>`).join('');preview();
    };
    days.onchange=e=>{if(saving||e.target.dataset.day===undefined)return;rule.pattern[Number(e.target.dataset.day)]=e.target.value;renderDays();};
    days.onclick=e=>{const button=e.target.closest('[data-remove-day]');if(!button||saving||rule.pattern.length===1)return;const index=Number(button.dataset.removeDay);rule.pattern.splice(index,1);if(index<rule.offset)rule.offset--;rule.offset=Math.min(rule.offset,rule.pattern.length-1);renderDays();};
    offset.onchange=()=>{rule.offset=Number(offset.value);preview();};start.onchange=preview;
    editor.querySelector('[data-add-day]').onclick=()=>{if(!saving&&rule.pattern.length<365){rule.pattern.push('FREI');renderDays();}};
    editor.querySelector('[data-preset]').onclick=()=>{if(saving)return;rule.pattern=['FD','FD','SD','SD','FREI','ND','ND','FREI','FREI','FREI'];rule.offset=R.teamOffset(team,10);renderDays();};
    editor.querySelector('[data-cancel]').onclick=()=>{if(!saving){editor.hidden=true;card.querySelector(`[data-edit-team="${team}"]`)?.focus();}};
    editor.querySelector('form').onsubmit=async e=>{
      e.preventDefault();if(saving)return;saving=true;rule.start=start.value;message.textContent='Teamregel wird gespeichert …';message.classList.remove('error');
      const disabled=new Map([...card.querySelectorAll('button,input,select')].map(el=>[el,el.disabled]));for(const el of disabled.keys())el.disabled=true;
      try{await M.save(rule);M.enhance(card.parentElement.parentElement);window.showSaveToast?.(`Team ${team} gespeichert`,'Alle zugeordneten Mitarbeiter verwenden den zentralen Teamrhythmus.');}
      catch(error){message.textContent=error.message||'Die Teamregel konnte nicht gespeichert werden.';message.classList.add('error');}
      finally{saving=false;for(const [el,state] of disabled)el.disabled=state;}
    };
    renderDays();editor.querySelector('h4').focus();
  }
})();
