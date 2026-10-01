// SchichtFunk \u2013 Mitarbeiterantwort auf ver\u00f6ffentlichte Schicht\u00e4nderungen V1
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(typeof B.openEmployeePortal!=='function')return;

  const terminal=new Set(['APPLIED','REJECTED','CANCELLED','SUPERSEDED','BLOCKED']);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function injectCss(){
    if(document.getElementById('sfEmployeeChangeCss'))return;
    const s=document.createElement('style');s.id='sfEmployeeChangeCss';
    s.textContent=`
      #sfEmployeePortal #sfEmployeeChanges{padding:24px;--ch-ink:#eaf5ff;--ch-muted:#94adc1;--ch-line:#29455b;color:var(--ch-ink)}
      #sfEmployeeChanges .sf-ch-header{display:flex;align-items:center;gap:18px;padding:22px;border:1px solid #2a615b;border-radius:15px;background:radial-gradient(ellipse at 100% 0,#1c645044,transparent 65%),linear-gradient(120deg,#102a38,#0b1a2b);margin-bottom:18px}
      #sfEmployeeChanges .sf-ch-emblem{width:58px;height:58px;flex:0 0 58px;display:grid;place-items:center;border-radius:16px;border:1px solid #34796c;background:#154339;color:#7cf4d6;font-size:30px}
      #sfEmployeeChanges .sf-ch-kicker{color:#69ddc1;font-size:10px;font-weight:800;letter-spacing:.12em}
      #sfEmployeePortal #sfEmployeeChanges h3{font-size:24px;margin:6px 0 8px;line-height:1.3}
      #sfEmployeeChanges .sf-ch-header p{font-size:13px;color:#aec7d8;line-height:1.6;margin:0;max-width:650px}
      #sfEmployeeChanges .sf-ch-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:20px}
      #sfEmployeeChanges .sf-ch-stat{padding:17px 19px;border:1px solid var(--ch-line);border-radius:12px;background:#0b1c2b;min-width:0}
      #sfEmployeeChanges .sf-ch-stat small{display:block;color:var(--ch-muted);font-size:12px}
      #sfEmployeeChanges .sf-ch-stat strong{display:block;font-size:28px;margin:8px 0 5px;line-height:1.2}
      #sfEmployeeChanges .sf-ch-stat span{display:block;color:var(--ch-muted);font-size:11px;line-height:1.5}
      #sfEmployeeChanges .sf-ch-stat.respond{border-color:#846735;background:linear-gradient(120deg,#362a1a,#19212a)}#sfEmployeeChanges .sf-ch-stat.respond strong{color:#ffd38b}
      #sfEmployeeChanges .sf-ch-stat.history strong{color:#83e5cb}
      #sfEmployeeChanges .sf-ch-filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:22px}
      #sfEmployeeChanges .sf-ch-filters button,#sfEmployeeChanges .sf-ch-more{min-height:44px;border:1px solid var(--ch-line);border-radius:9px;background:#102436;color:#b2cada;font:inherit;font-size:12px;font-weight:700;cursor:pointer;padding:10px 13px}
      #sfEmployeeChanges .sf-ch-filters button[aria-pressed="true"]{border-color:#29b799;background:#124337;color:#9bf3de}
      #sfEmployeeChanges .sf-ch-filters em{font-style:normal;margin-left:8px;padding:2px 6px;border-radius:5px;background:#071a2580;font-size:11px}
      #sfEmployeeChanges button:focus-visible{outline:2px solid #51e2c0;outline-offset:3px}#sfEmployeeChanges button:disabled{opacity:.5;cursor:wait}
      #sfEmployeeChanges .sf-ch-group{margin:22px 0}#sfEmployeeChanges .sf-ch-group-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
      #sfEmployeeChanges h4{margin:0;font-size:15px;font-weight:800}#sfEmployeeChanges .sf-ch-group-head>span{color:var(--ch-muted);font-size:11px}
      #sfEmployeeChanges .sf-change-list{display:grid;gap:14px}
      #sfEmployeeChanges .sf-change-card{border:1px solid var(--ch-line);background:#0b1b2a;border-radius:13px;padding:20px;min-width:0}
      #sfEmployeeChanges .sf-change-card.pending{border-left:4px solid #e9b257;border-color:#715d3a;background:linear-gradient(125deg,#29251d,#0d1d2b 60%)}
      #sfEmployeeChanges .sf-change-head{display:flex;align-items:flex-start;gap:12px;margin-bottom:18px;flex-wrap:wrap}
      #sfEmployeeChanges .sf-change-icon{width:38px;height:38px;flex:0 0 38px;display:grid;place-items:center;border-radius:10px;border:1px solid #345b63;background:#13303a;color:#83dfcf;font-size:22px}
      #sfEmployeeChanges .sf-change-title{min-width:0;flex:1}#sfEmployeeChanges .sf-change-title b{display:block;font-size:16px;line-height:1.5;color:#eef7ff}
      #sfEmployeeChanges .sf-change-title small{display:block;margin-top:4px;color:var(--ch-muted);font-size:11px;line-height:1.5}
      #sfEmployeeChanges .sf-change-status{padding:7px 10px;border-radius:99px;border:1px solid #38546c;color:#aac4d6;font-size:11px;font-weight:800;white-space:normal;line-height:1.4}
      #sfEmployeeChanges .sf-change-status.pending{background:#3a2b17;border-color:#96703b;color:#ffd38b}#sfEmployeeChanges .sf-change-status.ok{background:#10342b;border-color:#2b7a64;color:#8de8cf}#sfEmployeeChanges .sf-change-status.no{background:#321b27;border-color:#7b4054;color:#ffafbf}
      #sfEmployeeChanges .sf-change-compare{display:grid;grid-template-columns:minmax(0,1fr) 32px minmax(0,1fr);gap:10px;align-items:stretch;margin-bottom:14px}
      #sfEmployeeChanges .sf-change-snapshot{border:1px solid #2b465b;border-radius:11px;background:#081725;padding:15px;min-width:0}
      #sfEmployeeChanges .sf-change-snapshot.proposed{border-color:#337a6c;background:#0d2b29}
      #sfEmployeeChanges .sf-change-snapshot>small{display:block;color:#89a5b9;font-size:9px;font-weight:800;letter-spacing:.1em;margin-bottom:12px}
      #sfEmployeeChanges .sf-change-snapshot.proposed>small{color:#7adebf}
      #sfEmployeeChanges .sf-ch-service{display:inline-block;padding:5px 9px;border:1px solid #36566a;border-radius:6px;background:#142c3c;color:#b5d8ec;font-size:12px;font-weight:800;margin-bottom:9px}
      #sfEmployeeChanges .sf-change-snapshot b{display:block;font-size:14px;line-height:1.6;color:#eaf5ff}
      #sfEmployeeChanges .sf-change-snapshot .sf-ch-time{display:block;font-size:19px;font-weight:800;color:#eef8ff;line-height:1.5;margin-top:3px}
      #sfEmployeeChanges .sf-change-snapshot .sf-ch-pause{display:block;font-size:11px;color:var(--ch-muted);margin-top:5px}
      #sfEmployeeChanges .sf-change-arrow{display:grid;place-items:center;color:#66b8ad;font-size:24px}
      #sfEmployeeChanges .sf-change-reason{border-radius:9px;border:1px solid #294254;background:#0a1926;padding:12px 14px;font-size:12px;color:#b5cbdb;line-height:1.7;overflow-wrap:anywhere}
      #sfEmployeeChanges .sf-change-reason b{display:block;color:#e5eff8;font-size:10px;letter-spacing:.06em;margin-bottom:3px}
      #sfEmployeeChanges .sf-ch-response{display:flex;align-items:center;justify-content:space-between;gap:20px;border-top:1px solid #52604760;margin-top:18px;padding-top:16px}
      #sfEmployeeChanges .sf-ch-response>p{font-size:12px;line-height:1.6;color:#dcc69e;max-width:470px;margin:0}
      #sfEmployeeChanges .sf-change-actions{display:flex;gap:8px;flex-shrink:0}
      #sfEmployeeChanges .sf-change-actions button{min-height:44px;border-radius:9px;padding:10px 16px;font:inherit;font-size:12px;font-weight:800;cursor:pointer}
      #sfEmployeeChanges .sf-change-reject{background:#271923;border:1px solid #7a4053;color:#ffb0c0}
      #sfEmployeeChanges .sf-change-approve{background:#27d6b4;border:1px solid #27d6b4;color:#05261f}
      #sfEmployeeChanges .sf-change-approve:hover{background:#60e5c8}#sfEmployeeChanges .sf-change-reject:hover{background:#3b2230}
      #sfEmployeeChanges .sf-ch-note{font-size:11px;color:var(--ch-muted);margin:13px 0 0;line-height:1.6}
      #sfEmployeeChanges .sf-ch-empty{display:flex;align-items:center;gap:20px;padding:30px 25px;border:1px dashed #386256;border-radius:13px;background:linear-gradient(120deg,#10332988,#10243588)}
      #sfEmployeeChanges .sf-ch-empty-icon{width:62px;height:62px;flex:0 0 62px;display:grid;place-items:center;color:#83e9cc;border:1px solid #3b7463;border-radius:50%;background:#123d32;font-size:30px}
      #sfEmployeeChanges .sf-ch-empty b{display:block;font-size:18px;margin-bottom:9px;line-height:1.4}#sfEmployeeChanges .sf-ch-empty p{font-size:13px;line-height:1.7;color:var(--ch-muted);margin:0;max-width:640px}
      #sfEmployeeChanges .sf-ch-more{display:block;margin:12px auto 0}
      #sfEmployeeChanges .sf-ch-foot{display:flex;gap:10px;align-items:flex-start;border-top:1px solid var(--ch-line);padding-top:15px;margin-top:24px;font-size:11px;color:var(--ch-muted);line-height:1.7}
      .sf-portal-toast{position:fixed;right:20px;top:84px;z-index:26000;width:min(390px,calc(100vw - 40px));padding:12px 14px;border-radius:10px;border:1px solid #286b59;background:#0d2c25;color:#9af0da;box-shadow:0 18px 60px rgba(0,0,0,.35);font-size:12px;font-weight:700}.sf-portal-toast.bad{border-color:#7a3747;background:#321821;color:#ff9ead}
      @media(max-width:1050px){#sfEmployeeChanges .sf-ch-response{align-items:flex-start;flex-direction:column}}
      @media(max-width:620px){#sfEmployeePortal #sfEmployeeChanges{padding:14px}#sfEmployeeChanges .sf-ch-header{padding:16px;gap:12px;align-items:flex-start}#sfEmployeeChanges .sf-ch-emblem{width:42px;height:42px;flex-basis:42px;font-size:24px;border-radius:11px}#sfEmployeePortal #sfEmployeeChanges h3{font-size:20px}#sfEmployeeChanges .sf-ch-header p{font-size:12px}#sfEmployeeChanges .sf-ch-summary{gap:7px}#sfEmployeeChanges .sf-ch-stat{padding:12px 9px}#sfEmployeeChanges .sf-ch-stat small{font-size:10px;line-height:1.6}#sfEmployeeChanges .sf-ch-stat strong{font-size:25px}#sfEmployeeChanges .sf-ch-stat span{display:none}#sfEmployeeChanges .sf-ch-filters{gap:6px}#sfEmployeeChanges .sf-ch-filters button{font-size:11px;padding:9px 10px}#sfEmployeeChanges .sf-change-card{padding:14px}#sfEmployeeChanges .sf-change-head{display:grid;grid-template-columns:38px minmax(0,1fr)}#sfEmployeeChanges .sf-change-status{grid-column:2;margin-left:0;justify-self:start}#sfEmployeeChanges .sf-change-compare{grid-template-columns:1fr;gap:7px}#sfEmployeeChanges .sf-change-arrow{height:20px;transform:rotate(90deg);font-size:20px}#sfEmployeeChanges .sf-change-snapshot{padding:13px}#sfEmployeeChanges .sf-change-snapshot .sf-ch-time{font-size:18px}#sfEmployeeChanges .sf-change-actions{width:100%}#sfEmployeeChanges .sf-change-actions button{flex:1;padding:10px 12px}#sfEmployeeChanges .sf-ch-group-head{align-items:flex-start}#sfEmployeeChanges .sf-ch-empty{align-items:flex-start;padding:20px 16px;gap:13px}#sfEmployeeChanges .sf-ch-empty-icon{width:42px;height:42px;flex-basis:42px;font-size:23px}#sfEmployeeChanges .sf-ch-empty b{font-size:16px}}
`;
    document.head.appendChild(s);
  }
  function tz(){return B.employeePortalData?.company?.timezone||'Europe/Berlin'}
  function datePart(v){if(!v)return '\u2013';try{return new Intl.DateTimeFormat('de-DE',{timeZone:tz(),weekday:'short',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(v))}catch{return '\u2013'}}
  function timePart(v){if(!v)return '\u2013';try{return new Intl.DateTimeFormat('de-DE',{timeZone:tz(),hour:'2-digit',minute:'2-digit'}).format(new Date(v))}catch{return '\u2013'}}
  function snapshot(s,empty){
    if(!s)return '<b>'+esc(empty||'\u2013')+'</b><span class="sf-ch-pause">Kein Dienst eingeplant</span>';
    const overnight=s.startsAt&&s.endsAt&&new Date(s.endsAt)>new Date(s.startsAt)&&datePart(s.startsAt)!==datePart(s.endsAt);
    return '<span class="sf-ch-service">'+esc(s.type||'Schicht')+'</span><b>'+esc(datePart(s.startsAt))+'</b><span class="sf-ch-time">'+esc(timePart(s.startsAt))+' \u2013 '+esc(timePart(s.endsAt))+'</span><span class="sf-ch-pause">'+(overnight?'Ende am '+esc(datePart(s.endsAt))+' \u00b7 ':'')+(Number(s.breakMinutes)>0?'Pause '+Number(s.breakMinutes)+' Min.':'')+'</span>';
  }
  function approvalFor(r,d){return (d.approvals||[]).find(a=>a.change_request_id===r.id&&a.approval_type==='EMPLOYEE')}
  function actionable(r,d){const a=approvalFor(r,d);return !!r.requires_employee_approval&&!terminal.has(r.status)&&(!a||a.status==='PENDING')}
  function groupFor(r,d){return terminal.has(r.status)?'history':actionable(r,d)?'respond':'processing'}
  function statusInfo(r,a){
    const labels={APPLIED:['\u00dcbernommen','ok'],REJECTED:['Abgelehnt','no'],CANCELLED:['Storniert',''],SUPERSEDED:['Durch neuere Anfrage ersetzt',''],BLOCKED:['Nicht \u00fcbernommen','no'],PENDING_WORKS_COUNCIL:['Weitere Freigabe offen','pending'],READY_TO_APPLY:['Best\u00e4tigt','ok'],PENDING_MANAGER:['Freigabe ausstehend','pending']};
    if(labels[r.status])return labels[r.status];
    if(r.status==='PENDING_EMPLOYEE'||(r.requires_employee_approval&&(!a||a.status==='PENDING')))return ['Antwort erforderlich','pending'];
    return [String(r.status||'Offen').replaceAll('_',' '),''];
  }
  const actionName=a=>a==='DELETE'?'Schicht entf\u00e4llt':a==='CREATE'?'Neuer Dienst':'Schicht\u00e4nderung';
  const actionIcon=a=>a==='DELETE'?'\u2212':a==='CREATE'?'+':'\u21c4';
  const reasonName=code=>({OPERATIONAL:'Betrieblicher Bedarf',STAFF_SHORTAGE:'Personalbedarf',EMPLOYEE_REQUEST:'Mitarbeiterwunsch',SICKNESS:'Krankheitsvertretung',OTHER:'Sonstiges'}[code]||code||'Sonstiges');
  let selected='all',visibleLimit=10,owner='';
  function requestHtml(r,d){
    const needsAnswer=actionable(r,d),[label,cls]=statusInfo(r,approvalFor(r,d));
    const note=r.status==='APPLIED'?'Diese \u00c4nderung wurde in deinen Dienstplan \u00fcbernommen.':r.status==='REJECTED'?'Diese Anfrage wurde abgelehnt.':r.status==='READY_TO_APPLY'?'Best\u00e4tigt \u2013 die \u00dcbernahme in den Dienstplan steht noch aus.':!terminal.has(r.status)&&!needsAnswer?'Deine Antwort ist derzeit nicht erforderlich. Die weitere Freigabe steht noch aus.':'';
    return '<article class="sf-change-card '+(needsAnswer?'pending':'')+'" data-change-request-id="'+esc(r.id)+'"><div class="sf-change-head"><span class="sf-change-icon" aria-hidden="true">'+actionIcon(r.action)+'</span><div class="sf-change-title"><b>'+esc(actionName(r.action))+'</b><small>Angefragt am '+esc(datePart(r.requested_at))+' \u00b7 '+esc(timePart(r.requested_at))+'</small></div><span class="sf-change-status '+cls+'">'+esc(label)+'</span></div><div class="sf-change-compare"><div class="sf-change-snapshot"><small>BISHER</small>'+snapshot(r.old_snapshot,r.action==='CREATE'?'Kein Dienst':'\u2013')+'</div><div class="sf-change-arrow" aria-hidden="true">\u2192</div><div class="sf-change-snapshot proposed"><small>ANGEFRAGT</small>'+snapshot(r.proposed_snapshot,r.action==='DELETE'?'Dienst entf\u00e4llt':'\u2013')+'</div></div><div class="sf-change-reason"><b>GRUND DER \u00c4NDERUNG</b>'+esc(reasonName(r.reason_code))+(r.reason_text?' \u00b7 '+esc(r.reason_text):'')+'</div>'+(needsAnswer?'<div class="sf-ch-response"><p>Pr\u00fcfe die angefragten Zeiten und gib der Planung deine R\u00fcckmeldung.</p><div class="sf-change-actions"><button type="button" class="sf-change-reject" data-sf-change-decision="REJECTED" data-sf-change-id="'+esc(r.id)+'">Ablehnen</button><button type="button" class="sf-change-approve" data-sf-change-decision="APPROVED" data-sf-change-id="'+esc(r.id)+'">\u2713 Best\u00e4tigen</button></div></div>':note?'<p class="sf-ch-note">'+esc(note)+'</p>':'')+'</article>';
  }
  function emptyHtml(hasRequests){
    const message=hasRequests?'In dieser Ansicht gibt es aktuell keine \u00c4nderungen.':'Sobald die Planung einen ver\u00f6ffentlichten Dienst \u00e4ndert, siehst du hier den bisherigen und den angefragten Stand. Wenn deine Zustimmung erforderlich ist, kannst du direkt antworten.';
    return '<div class="sf-ch-empty" role="status"><span class="sf-ch-empty-icon" aria-hidden="true">\u2713</span><div><b>'+(hasRequests?'Keine passenden Anfragen':'Aktuell keine Schicht\u00e4nderungen')+'</b><p>'+message+'</p></div></div>';
  }
  function enhance(){
    injectCss();
    const d=B.employeePortalData,p=document.getElementById('sfEmployeePortal');if(!d||!p)return;
    const section=p.querySelector('#sfEmployeeChanges')||[...p.querySelectorAll('.sf-portal-card')].find(x=>x.querySelector('h3')?.textContent.trim()==='Schicht\u00e4nderungen');if(!section)return;
    const identity=[B.user?.id,d.company?.id,d.employee?.id].join(':');if(identity!==owner){owner=identity;selected='all';visibleLimit=10}
    section.id='sfEmployeeChanges';section.dataset.sfPortalSection='changes';
    const requests=(d.requests||[]).slice().sort((a,b)=>{const rank={respond:0,processing:1,history:2};return rank[groupFor(a,d)]-rank[groupFor(b,d)]||new Date(b.requested_at)-new Date(a.requested_at)});
    const counts={all:requests.length,respond:0,processing:0,history:0};requests.forEach(r=>counts[groupFor(r,d)]++);section.dataset.sfChangeCount=String(counts.all);
    const filtered=requests.filter(r=>selected==='all'||groupFor(r,d)===selected),shown=filtered.slice(0,visibleLimit);
    const labels={respond:['Deine Antwort wird ben\u00f6tigt','Bitte pr\u00fcfen und antworten'],processing:['In Bearbeitung','Weitere Freigaben stehen aus'],history:['Bisherige \u00c4nderungen','Abgeschlossene Anfragen']};
    const groups=['respond','processing','history'].map(key=>{const items=shown.filter(r=>groupFor(r,d)===key);return items.length?'<section class="sf-ch-group" aria-label="'+esc(labels[key][0])+'"><div class="sf-ch-group-head"><h4>'+esc(labels[key][0])+'</h4><span>'+counts[key]+' '+(counts[key]===1?'Anfrage':'Anfragen')+'</span></div><div class="sf-change-list">'+items.map(r=>requestHtml(r,d)).join('')+'</div></section>':''}).join('');
    section.innerHTML='<header class="sf-ch-header"><span class="sf-ch-emblem" aria-hidden="true">\u21c4</span><div><div class="sf-ch-kicker">DEIN DIENSTPLAN \u00b7 DEINE R\u00dcCKMELDUNG</div><h3>Schicht\u00e4nderungen</h3><p>Was \u00e4ndert sich an deinem Dienst? Vergleiche die Zeiten, antworte auf offene Anfragen und behalte den Verlauf im Blick.</p></div></header><div class="sf-ch-summary" aria-label="Status\u00fcbersicht">'+['respond','processing','history'].map(key=>'<div class="sf-ch-stat '+key+'"><small>'+esc(key==='respond'?'Antwort erforderlich':key==='processing'?'In Bearbeitung':'Abgeschlossen')+'</small><strong data-change-count="'+key+'">'+counts[key]+'</strong><span>'+esc(labels[key][1])+'</span></div>').join('')+'</div><div class="sf-ch-filters" role="group" aria-label="\u00c4nderungen nach Status filtern">'+[['all','Alle'],['respond','Antwort erforderlich'],['processing','In Bearbeitung'],['history','Abgeschlossen']].map(([key,label])=>'<button type="button" data-change-filter="'+key+'" aria-pressed="'+(selected===key)+'">'+esc(label)+'<em>'+counts[key]+'</em></button>').join('')+'</div><div class="sf-ch-results" aria-live="polite">'+(groups||emptyHtml(requests.length>0))+'</div>'+(shown.length<filtered.length?'<button type="button" class="sf-ch-more" data-change-more>Weitere \u00c4nderungen anzeigen ('+(filtered.length-shown.length)+')</button>':'')+'<footer class="sf-ch-foot"><span aria-hidden="true">\u24d8</span><span>Eine Anfrage ist noch keine ge\u00e4nderte Schicht. Ma\u00dfgeblich ist dein ver\u00f6ffentlichter Dienstplan unter \u201eMeine Schichten\u201c.</span></footer>';
    section.querySelectorAll('[data-sf-change-decision]').forEach(btn=>btn.addEventListener('click',()=>respond(btn.dataset.sfChangeId,btn.dataset.sfChangeDecision)));
    section.querySelectorAll('[data-change-filter]').forEach(btn=>btn.addEventListener('click',()=>{selected=btn.dataset.changeFilter;visibleLimit=10;enhance();section.querySelector('[data-change-filter="'+selected+'"]')?.focus({preventScroll:true})}));
    section.querySelector('[data-change-more]')?.addEventListener('click',()=>{const count=shown.length;visibleLimit+=10;enhance();const next=section.querySelectorAll('.sf-change-card')[count];if(next){next.tabIndex=-1;next.focus({preventScroll:true})}});
  }
  function toast(text,bad=false){
    document.querySelector('.sf-portal-toast')?.remove();const e=document.createElement('div');e.className='sf-portal-toast'+(bad?' bad':'');e.textContent=text;document.body.appendChild(e);setTimeout(()=>e.remove(),5200);
  }

  async function respond(id,decision){
    if(!id||!B.client||B.role!=='EMPLOYEE')return;
    const approve=decision==='APPROVED';
    const ok=confirm(approve?'Diese Schicht\u00e4nderung verbindlich best\u00e4tigen?':'Diese Schicht\u00e4nderung ablehnen? Die bisherige Planung bleibt bestehen.');
    if(!ok)return;
    try{
      B.showLoading?.(approve?'Schicht\u00e4nderung wird best\u00e4tigt \u2026':'Schicht\u00e4nderung wird abgelehnt \u2026');
      const {data,error}=await B.client.rpc('employee_respond_to_shift_change',{p_change_id:id,p_decision:decision,p_comment:''});
      if(error)throw error;
      const result=Array.isArray(data)?data[0]:data;
      await B.hydrateEmployee();
      if(B.client?.__sfDemoLocalClientV1){enhance();B.employeePortalNavigate?.('changes')}
      else B.openEmployeePortal();
      B.hideLoading?.();
      toast(result?.message||(approve?'\u00c4nderung best\u00e4tigt.':'\u00c4nderung abgelehnt.'));
    }catch(e){
      B.hideLoading?.();
      console.error('Mitarbeiterantwort',e);
      toast(e?.message||String(e),true);
    }
  }

  B.respondToShiftChange=respond;
  B.refreshEmployeeShiftChanges=enhance;
  const base=B.openEmployeePortal;
  B.openEmployeePortal=function(){const r=base.apply(this,arguments);setTimeout(enhance,0);return r};
  setTimeout(enhance,0);
})();
