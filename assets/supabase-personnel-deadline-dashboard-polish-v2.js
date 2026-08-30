// SchichtFunk – Fristen-Dashboard Feinschliff V2
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.__personnelDeadlineDashboardPolishV2)return;B.__personnelDeadlineDashboardPolishV2=true;
  let onlyAction=false;

  function css(){
    if(document.getElementById('sfPfdPolishV2Css'))return;
    const s=document.createElement('style');s.id='sfPfdPolishV2Css';s.textContent=`
      #sfPersonnelDeadlineDashboard .sf-pfd-actionbar{display:flex;align-items:center;gap:12px;padding:12px 20px;background:linear-gradient(90deg,#0d1d2a,#0b1723);border-bottom:1px solid #20364a}
      #sfPersonnelDeadlineDashboard .sf-pfd-actioncard{display:flex;align-items:center;gap:11px;min-width:260px;padding:10px 13px;border:1px solid #395468;border-radius:11px;background:#0e1d2a;color:#dce9f3;text-align:left;cursor:pointer;transition:.16s ease}
      #sfPersonnelDeadlineDashboard .sf-pfd-actioncard:hover,#sfPersonnelDeadlineDashboard .sf-pfd-actioncard.active{border-color:#f0a24a;background:#2a2118;box-shadow:0 0 0 1px rgba(240,162,74,.08) inset}
      #sfPersonnelDeadlineDashboard .sf-pfd-actionicon{width:34px;height:34px;border-radius:9px;display:grid;place-items:center;background:#302416;color:#ffc37c;font-size:15px;flex:0 0 auto}
      #sfPersonnelDeadlineDashboard .sf-pfd-actiontext{min-width:0;flex:1}
      #sfPersonnelDeadlineDashboard .sf-pfd-actiontext b{display:block;font-size:11px;line-height:1.2}.sf-pfd-actiontext span{display:block;margin-top:3px;color:#8fa4b5;font-size:8px}
      #sfPersonnelDeadlineDashboard .sf-pfd-actioncount{min-width:30px;height:30px;padding:0 8px;border-radius:999px;display:grid;place-items:center;background:#f0a24a;color:#17100a;font-size:12px;font-weight:950}
      #sfPersonnelDeadlineDashboard .sf-pfd-legend{display:flex;align-items:center;gap:12px;flex-wrap:wrap;color:#8298aa;font-size:8px;margin-left:auto}
      #sfPersonnelDeadlineDashboard .sf-pfd-legend-item{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}.sf-pfd-legend-dot{width:8px;height:8px;border-radius:50%;display:inline-block}
      #sfPersonnelDeadlineDashboard .sf-pfd-legend-dot.red{background:#ff7f91}.sf-pfd-legend-dot.orange{background:#ffad78}.sf-pfd-legend-dot.yellow{background:#ffd17a}.sf-pfd-legend-dot.muted{background:#70879a}
      #sfPersonnelDeadlineDashboard .sf-pfd-row{position:relative;overflow:hidden;transition:border-color .14s ease,background .14s ease,transform .14s ease,opacity .14s ease}
      #sfPersonnelDeadlineDashboard .sf-pfd-row::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:transparent}
      #sfPersonnelDeadlineDashboard .sf-pfd-row.sf-pfd-row-expired::before{background:#ff7f91}
      #sfPersonnelDeadlineDashboard .sf-pfd-row.sf-pfd-row-d30::before{background:#ffad78}
      #sfPersonnelDeadlineDashboard .sf-pfd-row.sf-pfd-row-d60::before{background:#ffd17a}
      #sfPersonnelDeadlineDashboard .sf-pfd-row.sf-pfd-row-d90::before{background:#d9d477}
      #sfPersonnelDeadlineDashboard .sf-pfd-row.sf-pfd-row-none{opacity:.82}
      #sfPersonnelDeadlineDashboard .sf-pfd-row:hover{transform:translateY(-1px)}
      #sfPersonnelDeadlineDashboard .sf-pfd-tools{align-items:center}
      #sfPersonnelDeadlineDashboard .sf-pfd-summary.sf-pfd-summary-enhanced{display:flex;align-items:center;justify-content:space-between;gap:10px}
      #sfPersonnelDeadlineDashboard .sf-pfd-summary-mode{display:inline-flex;align-items:center;gap:5px;color:#f3bd77;font-weight:850}
      @media(max-width:820px){#sfPersonnelDeadlineDashboard .sf-pfd-actionbar{align-items:stretch;flex-direction:column}.sf-pfd-legend{margin-left:0!important}.sf-pfd-actioncard{width:100%;min-width:0!important}}
    `;document.head.appendChild(s)
  }

  function statNumber(cls){
    const el=document.querySelector(`#sfPersonnelDeadlineDashboard .sf-pfd-stat.${cls} b`);
    return Number((el?.textContent||'0').replace(/[^0-9-]/g,''))||0;
  }
  function actionCount(){return statNumber('expired')+statNumber('d30')+statNumber('d60')+statNumber('d90')}

  function urgencyOf(row){
    const d=row.querySelector('.sf-pfd-deadline');if(!d)return 'other';
    if(d.classList.contains('expired'))return'expired';
    if(d.classList.contains('d30'))return'd30';
    if(d.classList.contains('d60'))return'd60';
    if(d.classList.contains('d90'))return'd90';
    if(d.classList.contains('later'))return'later';
    if(d.classList.contains('none'))return'none';
    return'other';
  }
  const isAction=u=>['expired','d30','d60','d90'].includes(u);

  function applyRows(){
    const rows=[...document.querySelectorAll('#sfPersonnelDeadlineDashboard .sf-pfd-row')];
    let visible=0;
    rows.forEach(row=>{
      const u=urgencyOf(row);
      row.classList.remove('sf-pfd-row-expired','sf-pfd-row-d30','sf-pfd-row-d60','sf-pfd-row-d90','sf-pfd-row-later','sf-pfd-row-none');
      if(['expired','d30','d60','d90','later','none'].includes(u))row.classList.add('sf-pfd-row-'+u);
      const hide=onlyAction&&!isAction(u);row.hidden=hide;if(!hide)visible++;
    });
    const summary=document.querySelector('#sfPersonnelDeadlineDashboard .sf-pfd-summary');
    if(summary){
      summary.classList.add('sf-pfd-summary-enhanced');
      let mode=summary.querySelector('.sf-pfd-summary-mode');
      if(onlyAction){
        if(!mode){mode=document.createElement('span');mode.className='sf-pfd-summary-mode';summary.appendChild(mode)}
        mode.textContent=`⚠ ${visible} mit Handlungsbedarf`;
      }else mode?.remove();
    }
  }

  function enhance(){
    const modal=document.getElementById('sfPersonnelDeadlineDashboard');
    const root=document.getElementById('sfDeadlineDashboardContent');
    if(!modal||!root)return;
    css();
    let bar=modal.querySelector('.sf-pfd-actionbar');
    if(!bar){
      const stats=root.querySelector('.sf-pfd-stats');if(!stats)return;
      bar=document.createElement('div');bar.className='sf-pfd-actionbar';
      bar.innerHTML=`<button type="button" class="sf-pfd-actioncard" id="sfPfdActionOnly"><span class="sf-pfd-actionicon">⚠</span><span class="sf-pfd-actiontext"><b>Handlungsbedarf</b><span>Überfällig oder innerhalb der nächsten 90 Tage</span></span><span class="sf-pfd-actioncount" id="sfPfdActionCount">0</span></button><div class="sf-pfd-legend"><span class="sf-pfd-legend-item"><i class="sf-pfd-legend-dot red"></i>Überfällig</span><span class="sf-pfd-legend-item"><i class="sf-pfd-legend-dot orange"></i>≤ 30 Tage</span><span class="sf-pfd-legend-item"><i class="sf-pfd-legend-dot yellow"></i>31–90 Tage</span><span class="sf-pfd-legend-item"><i class="sf-pfd-legend-dot muted"></i>Später / ohne Frist</span></div>`;
      root.insertBefore(bar,stats);
      bar.querySelector('#sfPfdActionOnly').onclick=()=>{onlyAction=!onlyAction;enhance()};
    }
    const count=bar.querySelector('#sfPfdActionCount');if(count)count.textContent=String(actionCount());
    const card=bar.querySelector('#sfPfdActionOnly');if(card){card.classList.toggle('active',onlyAction);card.setAttribute('aria-pressed',String(onlyAction))}
    applyRows();
  }

  document.addEventListener('click',e=>{
    if(e.target?.closest?.('#sfDeadlineDashboardOpen,#sfPersonnelDeadlineDashboard [data-urgency],#sfPfdReset,#sfPfdKind,#sfPfdStatus'))setTimeout(enhance,80);
  },true);
  document.addEventListener('input',e=>{if(e.target?.id==='sfPfdSearch')setTimeout(enhance,30)},true);
  setInterval(enhance,650);
})();
