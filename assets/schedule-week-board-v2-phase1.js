// SchichtFunk – Wochenansicht V2 · Phase 1: reine Darstellung
(function(){
  if(window.__sfWeekBoardV2Phase1)return;
  window.__sfWeekBoardV2Phase1=true;

  const MODE_KEY='sf_schedule_week_view_v2';
  const ORDER=['OT1','OT2','OT','O1','Teamleiter','O2','O3'];
  const accent={teal:'#2ed9b8',cyan:'#38d7d4',violet:'#8f7dff',blue:'#62a0ff',amber:'#ffbd4f',pink:'#ff6f9d',red:'#ff6677'};
  let mode=sessionStorage.getItem(MODE_KEY)||'board';

  const css=document.createElement('style');
  css.textContent=`
    .sf-week-mode-seg{display:flex;border:1px solid #24384f;border-radius:8px;overflow:hidden;margin-right:2px}
    .sf-week-mode-seg button{border:0;background:#0e1928;color:#8fa4bd;padding:8px 11px;font-size:12px}
    .sf-week-mode-seg button.active{background:#17382f;color:#dffff7;box-shadow:inset 0 0 0 1px rgba(46,217,184,.3)}
    .sf-week-board-wrap{display:none;overflow:auto;max-height:calc(100vh - 180px);padding:12px;background:#0b1624;overscroll-behavior:contain}
    .sf-week-board-wrap.active{display:block}
    .sf-week-board{display:grid;grid-template-columns:repeat(7,minmax(178px,1fr));gap:9px;min-width:1280px;align-items:stretch}
    .sf-week-day{position:sticky;top:0;z-index:5;min-width:0;border:1px solid #20344b;border-radius:11px;overflow:hidden;background:#0d1928;box-shadow:0 7px 14px rgba(4,10,18,.28)}
    .sf-week-day.is-today{border-color:rgba(46,217,184,.72);box-shadow:0 0 0 1px rgba(46,217,184,.16),0 7px 14px rgba(4,10,18,.28)}
    .sf-week-day.is-weekend{background:#0c1725}
    .sf-week-day-head{height:100%;box-sizing:border-box;padding:10px 10px 9px;background:#101e2f}
    .sf-week-day.is-today .sf-week-day-head{background:linear-gradient(180deg,rgba(46,217,184,.10),#101e2f)}
    .sf-week-day-title{display:flex;align-items:center;justify-content:space-between;gap:8px}
    .sf-week-day-title strong{font-size:13px;color:#eef6ff}
    .sf-week-day-title span{font-size:11px;color:#8ea4bd}
    .sf-week-day-date{display:inline-flex;align-items:center;gap:5px}
    .sf-week-day.is-today .sf-week-day-date b{width:25px;height:25px;border-radius:50%;display:inline-grid;place-items:center;background:var(--teal);color:#062d25}
    .sf-week-day-coverage{margin-top:7px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:10px;color:#8fa4bf}
    .sf-day-status{padding:3px 6px;border-radius:999px;border:1px solid #2a4059;background:#132438;color:#a9bfd6;font-weight:700}
    .sf-day-status.good{border-color:#246b58;background:#123127;color:#9ef4d4}
    .sf-day-status.warn{border-color:#74531c;background:#2c2518;color:#ffd19a}
    .sf-week-shift-cell{min-width:0;padding:7px;background:#0d1928;border-left:1px solid rgba(32,52,75,.52);border-right:1px solid rgba(32,52,75,.52)}
    .sf-week-shift-cell.is-weekend{background:#0c1725}
    .sf-week-shift-cell.is-today{background:linear-gradient(180deg,rgba(46,217,184,.045),#0d1928);border-left-color:rgba(46,217,184,.34);border-right-color:rgba(46,217,184,.34)}
    .sf-week-shift-cell.row-start{border-top:1px solid #20344b;border-top-left-radius:10px;border-top-right-radius:10px}
    .sf-week-shift-cell.row-end{border-bottom:1px solid #20344b;border-bottom-left-radius:10px;border-bottom-right-radius:10px}
    .sf-week-shift{--sf-shift-accent:#62a0ff;height:100%;box-sizing:border-box;background:#101f30;border:1px solid #24384f;border-left:3px solid var(--sf-shift-accent);border-radius:8px;overflow:hidden}
    .sf-week-shift-head{display:flex;align-items:center;justify-content:space-between;gap:7px;padding:8px 9px;background:rgba(255,255,255,.012)}
    .sf-week-shift-main{min-width:0}
    .sf-week-shift-main strong{display:block;font-size:12px;color:#f6f9ff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .sf-week-shift-main small{display:block;margin-top:2px;font-size:9px;color:#859bb4;white-space:nowrap}
    .sf-week-shift-count{flex:none;text-align:right}
    .sf-week-shift-count b{display:block;font-size:11px;padding:3px 6px;border-radius:999px;background:#16283b;border:1px solid #2a4059;color:#b9cade}
    .sf-week-shift.complete .sf-week-shift-count b{border-color:#246b58;background:#123127;color:#9ef4d4}
    .sf-week-shift.under .sf-week-shift-count b,.sf-week-shift.empty .sf-week-shift-count b{border-color:#74531c;background:#2c2518;color:#ffd19a}
    .sf-week-shift.over .sf-week-shift-count b{border-color:#514786;background:#292345;color:#c9bfff}
    .sf-week-employees{padding:0 7px 7px;display:flex;flex-direction:column;gap:5px}
    .sf-week-employee{display:grid;grid-template-columns:29px minmax(0,1fr);gap:7px;align-items:center;min-height:39px;padding:6px 7px;border-radius:7px;background:#14283a;border:1px solid #213a50}
    .sf-week-avatar{width:29px;height:29px;border-radius:50%;display:grid;place-items:center;background:#1e3a54;color:#e6f2ff;font-size:10px;font-weight:800}
    .sf-week-employee-info{min-width:0}
    .sf-week-employee-info b{display:block;font-size:11px;line-height:1.25;color:#edf5ff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .sf-week-employee-info small{display:block;margin-top:2px;font-size:9px;color:#8ea4bd;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .sf-week-open{margin:0 7px 7px;padding:7px;border:1px dashed #8a6123;border-radius:6px;background:#302719;color:#ffd08a;font-size:10px;font-weight:700;text-align:center}
    .sf-week-over{margin:0 6px 6px;padding:5px 7px;border:1px solid #514786;border-radius:6px;background:#292345;color:#c9bfff;font-size:9px;text-align:center}
    .sf-week-shift.is-inactive{display:grid;place-items:center;min-height:58px;border-left-color:#31445a;background:rgba(16,31,48,.48)}
    .sf-week-shift-empty{font-size:15px;color:#536a82}
    @media(max-width:1500px){.sf-week-board{grid-template-columns:repeat(7,190px);min-width:max-content}}
  `;
  document.head.appendChild(css);

  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function initials(emp){return `${emp?.first?.[0]||''}${emp?.last?.[0]||''}`.toUpperCase()||'–'}
  function shiftOrder(){
    const ids=TYPES.map(t=>t.id);
    return [...ORDER.filter(id=>ids.includes(id)),...ids.filter(id=>!ORDER.includes(id))];
  }
  function statusFor(soll,ist){if(soll<=0&&ist>0)return'over';if(ist===0&&soll>0)return'empty';if(ist<soll)return'under';if(ist===soll)return'complete';return'over'}
  function dayCoverage(date){
    let soll=0,filled=0,open=0;
    for(const id of shiftOrder()){
      const s=Number(getSoll(date,id)||0),i=assignmentsFor(date,id).length;
      soll+=s;filled+=Math.min(i,s);open+=Math.max(0,s-i);
    }
    return{ soll,filled,open };
  }
  function employeeRow(a,t){
    const emp=employees.find(e=>e.id===a.employeeId);
    if(!emp)return'';
    const start=a.start||t.start,end=a.end||t.end;
    return `<div class="sf-week-employee" title="${esc(emp.first+' '+emp.last)}"><span class="sf-week-avatar">${esc(initials(emp))}</span><span class="sf-week-employee-info"><b>${esc(emp.first)} ${esc(emp.last)}</b><small>${esc(start)} – ${esc(end)}</small></span></div>`;
  }
  function shiftBlock(date,id){
    const t=typeById(id);if(!t)return'';
    const list=assignmentsFor(date,id);
    const soll=Number(getSoll(date,id)||0),ist=list.length;
    if(!soll&&!ist)return `<section class="sf-week-shift is-inactive" data-date="${esc(date)}" data-type="${esc(id)}" aria-label="${esc(id)}: keine Besetzung"><span class="sf-week-shift-empty">—</span></section>`;
    const st=statusFor(soll,ist),open=Math.max(0,soll-ist),over=Math.max(0,ist-soll);
    const color=accent[t.cls]||'#62a0ff';
    const rows=list.map(a=>employeeRow(a,t)).join('');
    return `<section class="sf-week-shift ${st}" data-date="${esc(date)}" data-type="${esc(id)}" style="--sf-shift-accent:${color}"><header class="sf-week-shift-head"><div class="sf-week-shift-main"><strong>${esc(id)}</strong><small>${esc(t.start)} – ${esc(t.end)}</small></div><div class="sf-week-shift-count"><b title="IST / SOLL">${ist} / ${soll}</b></div></header><div class="sf-week-employees">${rows}</div>${open?`<div class="sf-week-open">＋ ${open} Position${open===1?'':'en'} offen</div>`:''}${over?`<div class="sf-week-over">＋ ${over} über SOLL</div>`:''}</section>`;
  }
  function dayHeader(d,index){
    const date=iso(d),today=date===iso(new Date()),weekend=index>4;
    const cov=dayCoverage(date),good=cov.open===0;
    const weekday=d.toLocaleDateString('de-DE',{weekday:'short'}).replace('.','');
    return `<article class="sf-week-day ${today?'is-today':''} ${weekend?'is-weekend':''}" data-date="${esc(date)}"><header class="sf-week-day-head"><div class="sf-week-day-title"><span class="sf-week-day-date"><strong>${esc(weekday)}</strong><b>${d.getDate()}</b></span><span>${cov.filled}/${cov.soll}</span></div><div class="sf-week-day-coverage"><span class="sf-day-status ${good?'good':'warn'}">${good?'✓ vollständig':`${cov.open} offen`}</span><span>${cov.filled} von ${cov.soll} Positionen besetzt</span></div></header></article>`;
  }
  function shiftCell(d,index,id,rowIndex,rowCount){
    const date=iso(d),today=date===iso(new Date()),weekend=index>4;
    return `<div class="sf-week-shift-cell ${today?'is-today':''} ${weekend?'is-weekend':''} ${rowIndex===0?'row-start':''} ${rowIndex===rowCount-1?'row-end':''}" data-date="${esc(date)}" data-shift-row="${esc(id)}">${shiftBlock(date,id)}</div>`;
  }

  function ensureUi(){
    const grid=document.getElementById('calendarGrid');
    const toolbar=document.querySelector('#view-schedule .cal-toolbar');
    if(!grid||!toolbar)return null;
    let wrap=document.getElementById('sfWeekBoardV2');
    if(!wrap){
      wrap=document.createElement('div');wrap.id='sfWeekBoardV2';wrap.className='sf-week-board-wrap';
      grid.parentNode.insertBefore(wrap,grid);
    }
    if(!document.getElementById('sfWeekModeSeg')){
      const seg=document.createElement('div');seg.id='sfWeekModeSeg';seg.className='sf-week-mode-seg';
      seg.innerHTML='<button type="button" data-sf-week-mode="board">Besetzung</button><button type="button" data-sf-week-mode="timeline">Zeitachse</button>';
      const oldSeg=toolbar.querySelector('.seg');
      toolbar.insertBefore(seg,oldSeg||null);
      seg.addEventListener('click',e=>{const b=e.target.closest('[data-sf-week-mode]');if(!b)return;mode=b.dataset.sfWeekMode;sessionStorage.setItem(MODE_KEY,mode);applyMode();if(mode==='board')renderBoard()});
    }
    return wrap;
  }
  function applyMode(){
    const wrap=ensureUi(),grid=document.getElementById('calendarGrid'),soll=document.getElementById('sollList');
    if(!wrap||!grid)return;
    const board=mode!=='timeline';
    wrap.classList.toggle('active',board);
    grid.style.display=board?'none':'';
    if(soll)soll.style.display=board?'none':'';
    document.querySelectorAll('#sfWeekModeSeg [data-sf-week-mode]').forEach(b=>b.classList.toggle('active',b.dataset.sfWeekMode===(board?'board':'timeline')));
  }
  function renderBoard(){
    const wrap=ensureUi();if(!wrap)return;
    const ds=currentWeekDates(),ids=shiftOrder();
    const headers=ds.map((d,i)=>dayHeader(d,i)).join('');
    const rows=ids.map((id,rowIndex)=>ds.map((d,i)=>shiftCell(d,i,id,rowIndex,ids.length)).join('')).join('');
    wrap.innerHTML=`<div class="sf-week-board">${headers}${rows}</div>`;
    applyMode();
  }

  const original=window.renderCalendar;
  if(typeof original==='function'){
    window.renderCalendar=function(){const r=original.apply(this,arguments);try{renderBoard()}catch(e){console.warn('Wochenansicht V2 konnte nicht gerendert werden',e)}return r};
  }
  try{renderBoard()}catch(e){console.warn('Wochenansicht V2 konnte nicht initialisiert werden',e)}
})();
