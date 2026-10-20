// Company opt-in and reviewable, atomic initial staggering of individual rhythms.
(function(){
  if(window.SFRhythmStaggering)return;
  const B=window.SFBackend=window.SFBackend||{},esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ctx=()=>window.SFPlanningRuleSettings?.context(),enabled=()=>!!ctx()?.C.policy.solidPlanningRules?.automaticRhythmStaggering;
  const admin=()=>!!ctx()&&['OWNER','ADMIN'].includes(B.role),demo=()=>sessionStorage.getItem('sf_demo_session_v1')==='active';
  const signature=()=>JSON.stringify({company:B.companyId,employees,assignments,absences,TYPES,globalSoll,dailySoll,policy:window.SFCompliance?.policy,dates:window.autoPlanningDates?.(),hours:document.getElementById('autoRespectHours')?.checked});
  let busy=false,proposal=null;
  function available(){if(!admin()||demo())throw Error('Nur Inhaber und Administratoren können Rhythmuseinstiege ändern.');if(busy||B.companySwitching||B.syncing||B.bootPromise||B.employeeStatusSaving||B.shiftModelSaving||B.autoPlanApplying||B.schedulePublishing||B.teamRhythmSaving||B.planningRulesSaving||window.SFMonthOptimizer?.isBusy())throw Error('Bitte laufende Speicherung oder Planung abwarten.');}
  async function save(value,changes=[],expected=B.planningRulesBaseline||{}){
    available();const company=B.companyId;busy=true;
    try{
      if(B.syncTimer){clearTimeout(B.syncTimer);B.syncTimer=null;await B.sync();if(B.lastSyncError)throw B.lastSyncError;}
      B.teamRhythmSaving=true;
      const q=await B.client.rpc('manager_save_rhythm_staggering',{p_company_id:company,p_enabled:value,p_expected:expected,p_changes:changes});if(q.error)throw Error(q.error.message||String(q.error));
      if(B.companyId!==company||!B.ready)throw Error('Gespeichert. Bitte das Unternehmen neu laden.');
      if(q.data?.company_id!==company)throw Error('Die Speicherantwort passt nicht zum Unternehmen. Bitte neu laden.');
      B.planningRulesBaseline=q.data.solid_planning_rules;window.SFCompliance.policy.solidPlanningRules={...q.data.solid_planning_rules,timezone:B.companyTimeZone||'Europe/Berlin'};
      for(const row of q.data.employees||[]){const e=employees.find(e=>String(e._dbId||B.empDb?.get(String(e.id)))===row.id);if(e){const key=company+'|'+String(e.id),previous=B.employeeSyncState?.get(key);e.qualifications=row.qualifications;e.rhythmStart=row.start;if(previous){const payload=JSON.parse(previous);payload.qualifications=row.qualifications;B.employeeSyncState.set(key,JSON.stringify(payload));}}}
      proposal=null;window.clearAutoPlanPreview?.();for(const fn of ['renderEmployees','renderPlanEmployeePool','renderCalendar','renderOverview'])window[fn]?.();return q.data;
    }finally{B.teamRhythmSaving=false;busy=false;}
  }
  async function calculate(progress=()=>{}){
    available();if(!enabled())throw Error('Bitte die automatische Staffelung zuerst für dieses Unternehmen aktivieren.');
    if(document.getElementById('autoPlanPeriod')?.value!=='month')throw Error('Bitte in der Auto-Planung einen einzelnen Kalendermonat auswählen.');
    if(document.getElementById('autoRespectHours')?.checked===false)throw Error('Bitte persönliche Wochenstunden berücksichtigen aktivieren, bevor Einstiege berechnet werden.');
    if(window.SFCompliance?.policy?.solidPlanningRules?.enabled)throw Error('Das aktivierte Unternehmensregelwerk steuert die Rhythmen zentral. Individuelle Einstiege werden hier nicht verändert.');
    const company=B.companyId;busy=true;
    try{
      if(B.syncTimer){clearTimeout(B.syncTimer);B.syncTimer=null;await B.sync();if(B.lastSyncError)throw B.lastSyncError;}
      if(B.companyId!==company)throw Error('Das Unternehmen wurde gewechselt.');
      const sig=signature(),check=()=>{if(B.companyId!==company||signature()!==sig)throw Error('Die Planungsdaten wurden geändert. Bitte Staffelung erneut berechnen.');};
      const eligible=[],locked=[];
      for(const e of employees.filter(e=>e.status==='active'&&!e.deletedAt)){
        const r=window.SFRhythm.config(e),kind=e.rhythmKind||(e.qualifications||[]).find(q=>q.startsWith('__sp:rhythmKind='))?.split('=')[1];if(kind!=='cycle'||r.mode!=='required'||r.team||!r.start||!r.pattern.includes('ALLE')||!r.pattern.includes('FREI')||r.pattern.some(t=>!['ALLE','FREI'].includes(t)))continue;
        if(assignments.some(a=>String(a.employeeId)===String(e.id))){locked.push(e.id);continue;}
        eligible.push({id:String(e.id),start:r.start,length:r.pattern.length,permissions:e.shifts?.length||1});
      }
      if(!eligible.length)throw Error(locked.length?'Alle passenden Mitarbeiter haben bereits gespeicherte Dienste. Ihre Einstiege bleiben geschützt.':'Keine passenden individuellen Arbeits-/Freirhythmen gefunden. Im Mitarbeiterprofil einen verbindlichen ALLE/FREI-Zyklus einrichten.');
      if(eligible.length>30)throw Error('Die Einstiegssuche unterstützt bis zu 30 Mitarbeiter mit individuellen Rhythmen. Größere Belegschaften bitte über Teamrhythmen staffeln.');
      const base=[...assignments],evaluate=async starts=>{
        check();const original=employees;let input;
        try{employees=original.map(e=>starts[String(e.id)]?{...e,rhythmStart:starts[String(e.id)]}:e);input=window.SFMonthOptimizer.buildInput(base);}finally{employees=original;}
        // Use complete blocks, real demand, permissions, absences, rest and hour limits.
        const solved=await window.SFMonthOptimizerCore.optimize(input,{iterations:8,yieldStep:()=>new Promise(r=>setTimeout(r,0))});return solved.quality;
      };
      const found=await window.SFRhythmStaggeringCore.search(eligible,evaluate,{check,progress});check();
      proposal={...found,company,signature:sig,locked,month:document.getElementById('autoPlanMonth').value,expected:structuredClone(B.planningRulesBaseline||{}),changes:found.changes.map(c=>{const e=employees.find(e=>String(e.id)===c.id);return{...c,employee_id:e._dbId||B.empDb?.get(c.id),expected_qualifications:[...(e.qualifications||[])]};})};return proposal;
    }finally{busy=false;}
  }
  async function apply(){const p=proposal;if(!p||!p.improved||!p.changes.length||p.company!==B.companyId||p.signature!==signature())throw Error('Der Vorschlag ist nicht mehr aktuell. Bitte neu berechnen.');return save(true,p.changes,p.expected);}
  function styles(){if(document.getElementById('sfStaggerCss'))return;const s=document.createElement('style');s.id='sfStaggerCss';s.textContent='.sf-stagger{border:1px solid var(--line);border-radius:14px;padding:20px;margin:16px 0;background:var(--panel);color:var(--text)}.sf-stagger p,.sf-stagger small{color:var(--muted);line-height:1.55}.sf-stagger-actions{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0}.sf-stagger button{min-height:44px}.sf-stagger-scroll{overflow:auto;max-width:100%}.sf-stagger table{border-collapse:collapse;width:100%;font-size:13px}.sf-stagger th,.sf-stagger td{padding:8px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}.sf-stagger td[data-work]{background:color-mix(in srgb,var(--accent,#3dd9bc) 20%,transparent)}.sf-stagger [role=status]{white-space:pre-line}@media(max-width:600px){.sf-stagger{padding:14px}.sf-stagger-actions button{width:100%}}';document.head.append(s);}
  function review(host,p){
    const first=p.month+'-01',days=Array.from({length:14},(_,i)=>window.SFRhythmStaggeringCore.plus(first,i));
    host.innerHTML=`<p><b>${p.baseline.open} → ${p.quality.open} offene Pflichtdienste</b> im berechneten Monatsvergleich. Dies ist ein Vorschlag; die endgültige Planung wird anschließend neu erstellt.</p>${p.improved?`<p>${p.changes.length} Einstiege werden versetzt. Muster, Freigaben und persönliche Grenzen bleiben bestehen.</p>`:'<p>Keine bessere Staffelung gefunden. Die gespeicherten Einstiege bleiben bestehen.</p>'}<div class="sf-stagger-scroll"><table><caption>Vorgeschlagene Rhythmustage · erste 14 Tage (Arbeit = verfügbar, kein zugewiesener Dienst)</caption><thead><tr><th>Mitarbeiter</th><th>Einstieg am 1.</th>${days.map(d=>`<th>${Number(d.slice(-2))}.</th>`).join('')}</tr></thead><tbody>${employees.filter(e=>window.SFRhythm.config(e).mode==='required').map(e=>{const c=p.changes.find(c=>c.id===String(e.id)),copy=c?{...e,rhythmStart:c.start}:e,r=window.SFRhythm.config(copy),index=window.SFRhythm.check(copy,(e.shifts||[])[0],first).index;return`<tr><th>${esc(e.personnelNo||e.last||e.id)}${p.locked.includes(e.id)?' · fest':''}</th><td>${Number.isInteger(index)?'Tag '+(index+1):'–'}${c?' · geändert':''}</td>${days.map(d=>{const work=window.SFRhythm.check(copy,(e.shifts||[])[0],d).expected!=='FREI';return`<td ${work?'data-work':''}>${work?'Arbeit':'Frei'}</td>`;}).join('')}</tr>`;}).join('')}</tbody></table></div><p>Vollständige Arbeitsblöcke müssen in die persönlichen Wochen- und Monatsgrenzen passen. Blöcke, die zu viele Stunden in derselben Kalenderwoche erzeugen, bleiben offen. Fehlende Gesamtkapazität lässt sich durch Staffelung nicht ersetzen.</p>${p.locked.length?`<p>${p.locked.length} Mitarbeiter mit gespeicherten Diensten behalten ihren Einstieg.</p>`:''}<div class="sf-stagger-actions">${p.improved&&p.changes.length?'<button class="primary" type="button" data-stagger-apply>Einstiege übernehmen</button>':''}<button class="ghost" type="button" data-stagger-cancel>Vorschlag schließen</button></div><p role="status" aria-live="polite"></p>`;
    host.querySelector('[data-stagger-cancel]').onclick=()=>{proposal=null;host.innerHTML='';};
    host.querySelector('[data-stagger-apply]')?.addEventListener('click',async event=>{event.target.disabled=true;const message=host.querySelector('[role=status]');try{message.textContent='Einstiege werden gemeinsam gespeichert …';await apply();host.innerHTML='<p role="status">Einstiege gespeichert. Jetzt die Monatsplanung neu berechnen.</p>';window.SFSettingsV2?.refreshPlanning();}catch(e){message.textContent=e.message;event.target.disabled=false;}});
  }
  function autoCard(){
    const auto=document.getElementById('view-auto');if(!auto)return;auto.querySelector('#sfAutoStagger')?.remove();if(!enabled()||demo())return;styles();const card=document.createElement('section');card.id='sfAutoStagger';card.className='sf-stagger';card.innerHTML='<h3>Arbeitsblöcke automatisch staffeln</h3><p>Für den gewählten Monat passende Einstiege in bestehende individuelle Arbeits-/Freirhythmen ermitteln. Der Vorschlag wird vor dem Speichern geprüft. Mitarbeiter mit gespeicherten Diensten behalten ihren Einstieg.</p><div class="sf-stagger-actions"><button type="button" class="ghost" data-stagger-calculate>Staffelung berechnen</button></div><p role="status" aria-live="polite"></p><div data-stagger-review></div>';auto.append(card);const button=card.querySelector('button');button.disabled=!admin()||busy;
    button.onclick=async()=>{button.disabled=true;const message=card.querySelector('[role=status]');try{message.textContent='Vollständige Arbeitsblöcke und Bedarfsdeckung werden verglichen …';const p=await calculate(n=>{message.textContent=`Staffelung wird berechnet · ${n} Varianten geprüft …`;});message.textContent='Berechnung abgeschlossen.';review(card.querySelector('[data-stagger-review]'),p);}catch(e){message.textContent=e.message;}finally{button.disabled=!admin();}};
  }
  function enhance(host){if(demo()||!host?.querySelector('.sf-set-grid')||!ctx())return;styles();host.querySelector('#sfStaggerSettings')?.remove();const company=B.companyId,card=document.createElement('section');card.id='sfStaggerSettings';card.className='sf-set-card full sf-stagger';card.innerHTML=`<h3>Automatische Rhythmusstaffelung</h3><p>Nur für das ausgewählte Unternehmen aktivieren. In der Auto-Planung werden bedarfsgerechte Einstiege in individuelle ALLE/FREI-Rhythmen berechnet und vor dem Speichern als Treppe angezeigt. Die Staffelung ist ein separater Vorbereitungsschritt für die Monatsplanung.</p><label><input type="checkbox" data-stagger-enabled ${enabled()?'checked':''} ${admin()?'':'disabled'}> Staffelungsvorschläge für dieses Unternehmen aktivieren</label><div class="sf-stagger-actions"><button class="primary" type="button" ${admin()?'':'disabled'}>Einstellung speichern</button></div><p role="status" aria-live="polite"></p>`;host.querySelector('.sf-set-grid').prepend(card);let expected=structuredClone(B.planningRulesBaseline||{});card.querySelector('button').onclick=async event=>{event.target.disabled=true;const message=card.querySelector('[role=status]');try{if(B.companyId!==company)throw Error('Bitte das Unternehmen neu laden.');await save(card.querySelector('input').checked,[],expected);expected=structuredClone(B.planningRulesBaseline||{});message.textContent='Gespeichert. Auto-Planung → Monat wählen → Staffelung berechnen → Einstiege übernehmen → Planung neu berechnen.';autoCard();}catch(e){message.textContent=e.message;}finally{event.target.disabled=false;}};}
  window.SFRhythmStaggering={enabled,save,calculate,apply,enhance,isBusy:()=>busy};
  const render=window.renderAutoPlanning;if(render)window.renderAutoPlanning=function(){const result=render.apply(this,arguments);autoCard();return result;};
  window.SFSettingsV2?.refreshPlanning();autoCard();
})();
