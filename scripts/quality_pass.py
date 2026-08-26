from pathlib import Path

p = Path('index.html')
s = p.read_text(encoding='utf-8')

# Historische View-Bezeichnung bereinigen: der echte Dienstplan ist view-schedule.
s = s.replace("switchView('plan')", "switchView('schedule')")
s = s.replace("name==='plan'", "name==='schedule'")

START = '<!-- SHIFTPILOT_QUALITY_PASS_V1 -->'
END = '<!-- /SHIFTPILOT_QUALITY_PASS_V1 -->'

quality = r'''<!-- SHIFTPILOT_QUALITY_PASS_V1 -->
<style id="shiftpilot-quality-pass-v1">
/* ===== ShiftPilot Quality Pass: Lesbarkeit, Fokus, Responsive, Konsistenz ===== */
:root{--sp-focus:#5ff1d8;--sp-muted-readable:#a8bad0}
body{line-height:1.45}
button,input,select,textarea{font-size:14px}
button{min-height:38px}
.primary,.ghost,.iconbtn{transition:background .16s ease,border-color .16s ease,transform .16s ease,box-shadow .16s ease}
.primary:hover,.ghost:hover,.iconbtn:hover{transform:translateY(-1px)}
button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,[tabindex]:focus-visible{outline:3px solid rgba(95,241,216,.55);outline-offset:2px;box-shadow:0 0 0 1px #0b342e}
.nav button{font-size:14px;min-height:42px}
.company-card b{font-size:13px}.company-card small,.user-row small{font-size:12px;color:var(--sp-muted-readable)}
.eyebrow{font-size:12px}.page-head h1{font-size:30px;line-height:1.15}.page-head p{font-size:14px;color:var(--sp-muted-readable);max-width:850px}
.stat small,.stat em{font-size:12px}.stat strong{font-size:23px}.stat{min-height:88px}
.card{box-shadow:0 12px 34px rgba(0,0,0,.18)}
.table-head h3,.library h3,.employee-pool-head h3{font-size:15px}
.library p,.table-head small,.section-box p{font-size:13px;color:var(--sp-muted-readable)}
.employee-drag{min-width:285px;padding:11px 12px}.employee-drag b{font-size:13px}.employee-drag small{font-size:12px;color:var(--sp-muted-readable)}
.employee-drag.selected:after,.shift-chip.selected:after{font-size:10px}
.pool-detail-label{font-size:11px;color:#93a9c0}.pool-shift-tag{font-size:11px;padding:3px 7px}.pool-absence{font-size:11px;padding:5px 7px}
.shift-chip{min-width:145px;padding:12px 13px}.shift-chip b{font-size:14px}.shift-chip small{font-size:12px;color:var(--sp-muted-readable)}
.time-head,.day-head{font-size:12px}.day-head b{font-size:14px}.time-slot{font-size:12px}.assignment{font-size:12px;line-height:1.35}
.soll-day small{font-size:11px;color:#93a9c0}.pill{font-size:11px;padding:4px 7px}
.profile-summary p,.profile-metric small,.absence-item small{font-size:12px;color:var(--sp-muted-readable)}.section-box h4{font-size:13px}
.form label{font-size:13px}.form input,.form select,.form textarea,.table-head input,.table-head select{min-height:40px;font-size:14px}
.absence-table th,.absence-table-head{font-size:12px}.absence-type,.absence-status{font-size:12px}
.tpl-types span,.tpl-form label,.tpl-existing-head span,.tpl-row small{font-size:12px!important}

/* klickbare Dashboard-Kennzahlen */
#view-overview .stat.sp-clickable{cursor:pointer;position:relative;transition:border-color .16s ease,background .16s ease,transform .16s ease}
#view-overview .stat.sp-clickable:hover,#view-overview .stat.sp-clickable:focus-visible{border-color:#3bcfb5;background:#112235;transform:translateY(-2px)}
#view-overview .stat.sp-clickable:after{content:'Öffnen →';position:absolute;right:12px;bottom:10px;font-size:10px;color:#68ddca;opacity:0;transition:opacity .16s ease}
#view-overview .stat.sp-clickable:hover:after,#view-overview .stat.sp-clickable:focus-visible:after{opacity:1}

/* klare Empty States */
.sp-empty{display:flex;align-items:center;gap:10px;min-height:72px;padding:14px;border:1px dashed #2a4058;border-radius:10px;background:#0b1725;color:#9fb2c8;font-size:13px}
.sp-empty:before{content:'✓';width:28px;height:28px;display:grid;place-items:center;border-radius:50%;background:#10352e;color:#58dfc4;font-weight:900;flex:0 0 auto}

/* Tabellen bleiben auf kleineren Screens bedienbar */
.table-card{overflow:hidden}.table-card>div[style*="overflow:auto"]{scrollbar-gutter:stable}
table th,table td{font-size:13px;line-height:1.35}

/* Modals: Inhalt lesbar, Aktionen erreichbar */
.absence-modal,.tpl-modal{scrollbar-gutter:stable}.absence-modal label,.tpl-modal label{font-size:13px}.absence-modal input,.absence-modal select,.absence-modal textarea{font-size:14px;min-height:40px}

@media(max-width:1180px){
  .main{padding:22px 20px 34px}.content{max-width:none}.page-head{align-items:flex-start}.page-head h1{font-size:27px}
  .employee-drag{min-width:260px}.stats{gap:10px}
}
@media(max-width:820px){
  :root{--sidebar:72px}.sidebar{padding:14px 8px}.brand{padding:2px 3px 14px}.app-brand-img{width:54px;object-fit:cover;object-position:left}.company-card{display:none}.nav button{justify-content:center;padding:11px 8px}.nav button span:nth-child(2),.nav .badge,.user-row>div:last-child{display:none}.side-bottom .nav button span:nth-child(2){display:none}.user-row{justify-content:center;padding:8px 0}.topbar{padding:0 14px}.search{width:min(420px,58vw)}.main{padding:18px 14px 30px}.page-head{flex-direction:column;align-items:stretch}.page-head>button,.page-head>select{align-self:flex-start}.stats{grid-template-columns:1fr 1fr}.panel-grid{grid-template-columns:1fr}.table-head{flex-wrap:wrap}.table-head input{margin-left:0;min-width:180px;flex:1}.employee-pool-head{flex-wrap:wrap}.employee-pool-head input{margin-left:0;min-width:180px;flex:1}
}
@media(max-width:560px){
  :root{--sidebar:58px}.top-actions .iconbtn{display:none}.top-actions{gap:5px}.topbar{padding:0 8px}.search{width:58vw}.search input{font-size:12px}.kbd{display:none}.main{padding:14px 10px 28px}.page-head h1{font-size:24px}.stats{grid-template-columns:1fr}.stat{min-height:78px}.form-actions{display:flex;flex-wrap:wrap;gap:8px}.form-actions button{flex:1 1 150px}.employee-drag{min-width:240px}.tpl-overlay{padding:10px!important}
}
@media(prefers-reduced-motion:reduce){*,*:before,*:after{scroll-behavior:auto!important;transition:none!important;animation:none!important}}
</style>
<script id="shiftpilot-quality-pass-js-v1">
(function(){
  const VIEW={overview:'overview',schedule:'schedule',employees:'employees',time:'time',absence:'absence',auto:'auto',reports:'reports',settings:'settings'};
  window.spNavigate=function(name){
    const target=VIEW[name]||name;
    if(typeof switchView==='function')switchView(target);
    const main=document.querySelector('.main');
    if(main)main.scrollTo({top:0,behavior:'instant'}); else window.scrollTo({top:0,behavior:'instant'});
  };

  function emptyState(id,text){
    const el=document.getElementById(id); if(!el)return;
    if(!el.textContent.trim() && !el.children.length)el.innerHTML='<div class="sp-empty">'+text+'</div>';
  }
  function improveOverview(){
    const stats=[...document.querySelectorAll('#view-overview #overviewStats .stat')];
    const actions=[
      ()=>spNavigate('employees'),
      ()=>spNavigate('schedule'),
      ()=>spNavigate('absence'),
      ()=>{ if(typeof openTemplateManager==='function')openTemplateManager(); }
    ];
    const labels=['Mitarbeiter öffnen','Dienstplan öffnen','Abwesenheiten öffnen','Vorlagen verwalten'];
    stats.forEach((card,i)=>{
      if(!actions[i])return;
      card.classList.add('sp-clickable');card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label',labels[i]);card.title=labels[i];
      card.onclick=actions[i];card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();actions[i]();}};
    });
    // 7 Standardvorlagen + aktive eigene Vorlagen anzeigen.
    if(stats[3]){
      const strong=stats[3].querySelector('strong');
      if(strong && typeof getCustomTemplates==='function')strong.textContent=7+getCustomTemplates().filter(x=>x.active).length;
    }
    emptyState('overviewIssues','Aktuell besteht kein Handlungsbedarf.');
    emptyState('overviewAbsences','Für den gewählten Zeitraum liegen keine weiteren Abwesenheiten vor.');
    emptyState('overviewWorkload','Noch keine Auslastungsdaten für diesen Zeitraum.');
    emptyState('overviewShiftMix','Noch keine Schichtverteilung für diesen Zeitraum.');
  }

  // Bestehende Renderfunktion erweitern, ohne Fachlogik zu ersetzen.
  if(typeof renderOverview==='function' && !renderOverview.__qualityWrapped){
    const base=renderOverview;
    const wrapped=function(){const r=base.apply(this,arguments);requestAnimationFrame(improveOverview);return r;};
    wrapped.__qualityWrapped=true;window.renderOverview=wrapped;
  }

  function improveControls(){
    document.querySelectorAll('button').forEach(b=>{if(!b.getAttribute('type'))b.setAttribute('type','button');});
    const iconButtons=[...document.querySelectorAll('.iconbtn')];
    iconButtons.forEach(b=>{
      const t=(b.textContent||'').trim();
      if(!b.getAttribute('aria-label')){
        if(t==='?')b.setAttribute('aria-label','Hilfe');
        else if(t==='✕'||t==='×')b.setAttribute('aria-label','Schließen');
        else b.setAttribute('aria-label',b.title||'Aktion');
      }
    });
    // Schnellaktionen robust an die echte View-Navigation binden.
    document.querySelectorAll('#view-overview button').forEach(b=>{
      const t=(b.textContent||'').trim();
      if(t.includes('Dienstplan öffnen'))b.onclick=()=>spNavigate('schedule');
    });
  }

  document.addEventListener('keydown',e=>{
    // Globale Suche mit Strg/Cmd+K fokussieren.
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){
      e.preventDefault();document.getElementById('globalSearch')?.focus();
    }
  });

  document.addEventListener('DOMContentLoaded',()=>{improveControls();setTimeout(improveOverview,0);});
  // Bei SPA-View-Wechseln erneut kleine Qualitätsverbesserungen anwenden.
  document.addEventListener('click',e=>{if(e.target.closest('[data-view]'))setTimeout(()=>{improveControls();if(document.getElementById('view-overview')?.classList.contains('active'))improveOverview();},0);});
})();
</script>
<!-- /SHIFTPILOT_QUALITY_PASS_V1 -->'''

if START in s and END in s:
    before = s.split(START,1)[0]
    after = s.split(END,1)[1]
    s = before + quality + after
else:
    if '</body>' not in s:
        raise SystemExit('Kein </body>-Tag gefunden')
    s = s.replace('</body>', quality + '\n</body>', 1)

p.write_text(s, encoding='utf-8')
print('ShiftPilot Quality Pass angewendet.')
