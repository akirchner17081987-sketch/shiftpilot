// SchichtFunk – Wochenansicht V2 · Phase 2: direkte Planung
(function(){
  if(window.__sfWeekBoardV2Phase1)return;
  window.__sfWeekBoardV2Phase1=true;

  const MODE_KEY='sf_schedule_week_view_v2';
  const ORDER=['OT1','OT2','OT','O1','Teamleiter','O2','O3'];
  const accent={teal:'#2ed9b8',cyan:'#38d7d4',violet:'#8f7dff',blue:'#62a0ff',amber:'#ffbd4f',pink:'#ff6f9d',red:'#ff6677'};
  let mode=sessionStorage.getItem(MODE_KEY)||'board';
  let dragPayload=null,undoTimer=null;

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
    .sf-week-shift-cell.is-drop-target{outline:2px solid rgba(46,217,184,.74);outline-offset:-3px;background:rgba(46,217,184,.11)}
    .sf-week-shift-cell.is-drop-warning{outline:2px solid rgba(255,189,79,.8);outline-offset:-3px;background:rgba(255,189,79,.10)}
    .sf-week-shift-cell.is-drop-blocked{outline:2px solid rgba(255,102,119,.78);outline-offset:-3px;background:rgba(255,102,119,.09)}
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
    .sf-week-employee{display:grid;grid-template-columns:29px minmax(0,1fr);gap:7px;align-items:center;width:100%;min-height:39px;padding:6px 7px;border-radius:7px;background:#14283a;border:1px solid #213a50;color:inherit;text-align:left;cursor:grab}
    .sf-week-employee:hover{border-color:#3a5872;background:#173047}
    .sf-week-employee:focus-visible{outline:2px solid var(--teal);outline-offset:1px}
    .sf-week-employee.is-dragging{opacity:.48;cursor:grabbing}
    .sf-week-avatar{width:29px;height:29px;border-radius:50%;display:grid;place-items:center;background:#1e3a54;color:#e6f2ff;font-size:10px;font-weight:800}
    .sf-week-employee-info{min-width:0}
    .sf-week-employee-info b{display:block;font-size:11px;line-height:1.25;color:#edf5ff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .sf-week-employee-info small{display:block;margin-top:2px;font-size:9px;color:#8ea4bd;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .sf-week-open{display:block;width:calc(100% - 14px);margin:0 7px 7px;padding:7px;border:1px dashed #8a6123;border-radius:6px;background:#302719;color:#ffd08a;font-size:10px;font-weight:700;text-align:center;cursor:pointer}
    .sf-week-open:hover,.sf-week-open:focus-visible{border-color:#ffbd4f;background:#3b2e19;outline:none}
    .sf-week-over{margin:0 6px 6px;padding:5px 7px;border:1px solid #514786;border-radius:6px;background:#292345;color:#c9bfff;font-size:9px;text-align:center}
    .sf-week-shift.is-inactive{display:grid;place-items:center;min-height:58px;border-left-color:#31445a;background:rgba(16,31,48,.48)}
    .sf-week-shift-empty{font-size:15px;color:#536a82}
    .sf-week-undo{position:fixed;left:50%;bottom:24px;z-index:13000;display:flex;align-items:center;gap:16px;max-width:min(560px,calc(100vw - 32px));padding:12px 14px 12px 16px;border:1px solid #31506a;border-radius:10px;background:#102235;color:#e9f4ff;box-shadow:0 18px 50px rgba(0,0,0,.46);font-size:12px}
    .sf-week-undo span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .sf-week-undo button{flex:none;border:1px solid #2d7967;border-radius:7px;background:#173c33;color:#aaf4db;padding:7px 10px;font-weight:800}
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
    return `<button type="button" class="sf-week-employee" draggable="true" data-assignment-id="${esc(a.id)}" title="${esc(emp.first+' '+emp.last)} verschieben oder bearbeiten"><span class="sf-week-avatar">${esc(initials(emp))}</span><span class="sf-week-employee-info"><b>${esc(emp.first)} ${esc(emp.last)}</b><small>${esc(start)} – ${esc(end)}</small></span></button>`;
  }
  function shiftBlock(date,id){
    const t=typeById(id);if(!t)return'';
    const list=assignmentsFor(date,id);
    const soll=Number(getSoll(date,id)||0),ist=list.length;
    if(!soll&&!ist)return `<section class="sf-week-shift is-inactive" data-date="${esc(date)}" data-type="${esc(id)}" aria-label="${esc(id)}: keine Besetzung"><span class="sf-week-shift-empty">—</span></section>`;
    const st=statusFor(soll,ist),open=Math.max(0,soll-ist),over=Math.max(0,ist-soll);
    const color=accent[t.cls]||'#62a0ff';
    const rows=list.map(a=>employeeRow(a,t)).join('');
    return `<section class="sf-week-shift ${st}" data-date="${esc(date)}" data-type="${esc(id)}" style="--sf-shift-accent:${color}"><header class="sf-week-shift-head"><div class="sf-week-shift-main"><strong>${esc(id)}</strong><small>${esc(t.start)} – ${esc(t.end)}</small></div><div class="sf-week-shift-count"><b title="IST / SOLL">${ist} / ${soll}</b></div></header><div class="sf-week-employees">${rows}</div>${open?`<button type="button" class="sf-week-open" data-open-assign>＋ ${open} Position${open===1?'':'en'} offen</button>`:''}${over?`<div class="sf-week-over">＋ ${over} über SOLL</div>`:''}</section>`;
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
  function refreshAll(){
    if(typeof saveAll==='function')saveAll();
    if(typeof renderCalendar==='function')renderCalendar();
    if(typeof renderPlanEmployeePool==='function')renderPlanEmployeePool();
    if(typeof renderOverview==='function')renderOverview();
    if(typeof updateStats==='function')updateStats();
  }
  function showUndo(message,action){
    clearTimeout(undoTimer);document.getElementById('sfWeekUndo')?.remove();
    const bar=document.createElement('div');bar.id='sfWeekUndo';bar.className='sf-week-undo';bar.setAttribute('role','status');
    bar.innerHTML=`<span>${esc(message)}</span><button type="button">Rückgängig</button>`;document.body.appendChild(bar);
    bar.querySelector('button').onclick=()=>{bar.remove();clearTimeout(undoTimer);action()};
    undoTimer=setTimeout(()=>bar.remove(),8000);
  }
  function clearDropState(wrap){wrap.querySelectorAll('.is-drop-target,.is-drop-warning,.is-drop-blocked').forEach(x=>x.classList.remove('is-drop-target','is-drop-warning','is-drop-blocked'))}
  function dropCheck(cell){
    if(!dragPayload)return null;const date=cell.dataset.date,type=cell.dataset.shiftRow,t=typeById(type);if(!t)return null;
    if(dragPayload.kind==='employee'){const emp=employees.find(e=>e.id===dragPayload.id);return typeof spAssignmentConflict==='function'?spAssignmentConflict(emp,type,date,t.start,t.end):{hard:[],soft:[]}}
    const a=assignments.find(x=>x.id===dragPayload.id),emp=a&&employees.find(e=>e.id===a.employeeId);return a&&emp&&typeof spAssignmentConflict==='function'?spAssignmentConflict(emp,type,date,t.start,t.end,a.id):{hard:[],soft:[]};
  }
  function moveAssignment(id,type,date){
    const a=assignments.find(x=>x.id===id),emp=a&&employees.find(e=>e.id===a.employeeId),t=typeById(type);if(!a||!emp||!t)return;
    if(a.type===type&&a.date===date)return;
    const before={...a},ok=window.SFCompliance?.save?.(emp,type,date,t.start,t.end,{ignoreId:a.id,pause:a.pause,note:a.note});
    if(!ok)return;
    const label=`${emp.first} ${emp.last}: ${before.type} → ${type}`;
    showUndo(label,()=>{const current=assignments.find(x=>x.id===id);if(!current)return;Object.assign(current,before,{version:Number(current.version||1)+1});window.SFCompliance?.audit?.('SHIFT_MOVE_UNDONE',id,{from:{type,date},to:{type:before.type,date:before.date}});refreshAll()});
  }
  function addEmployee(employeeId,type,date){
    const before=new Set(assignments.map(a=>a.id));assignEmployeeByDrop(employeeId,type,date);
    const added=assignments.find(a=>!before.has(a.id));if(!added)return;
    const emp=employees.find(e=>e.id===employeeId);showUndo(`${emp?.first||'Mitarbeiter'} ${emp?.last||''} aus ${type} entfernen`,()=>{assignments=assignments.filter(a=>a.id!==added.id);window.SFCompliance?.audit?.('SHIFT_CREATE_UNDONE',added.id,{type,date});refreshAll()});
  }
  function installInteractions(wrap){
    wrap.querySelectorAll('.sf-week-employee').forEach(card=>{
      card.onclick=()=>{if(!dragPayload)window.editAssignment?.(card.dataset.assignmentId)};
      card.ondragstart=e=>{dragPayload={kind:'assignment',id:card.dataset.assignmentId};card.classList.add('is-dragging');e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain','assignment:'+dragPayload.id)};
      card.ondragend=()=>{card.classList.remove('is-dragging');dragPayload=null;clearDropState(wrap)};
    });
    wrap.querySelectorAll('.sf-week-shift-cell').forEach(cell=>{
      cell.ondragenter=e=>{if(!dragPayload){const raw=e.dataTransfer?.getData('text/plain')||'';if(raw.startsWith('employee:'))dragPayload={kind:'employee',id:raw.slice(9)}}const check=dropCheck(cell);if(!check)return;e.preventDefault();clearDropState(wrap);cell.classList.add(check.hard.length?'is-drop-blocked':check.soft.length?'is-drop-warning':'is-drop-target')};
      cell.ondragover=e=>{if(dragPayload){e.preventDefault();e.dataTransfer.dropEffect=dropCheck(cell)?.hard?.length?'none':dragPayload.kind==='assignment'?'move':'copy'}};
      cell.ondragleave=e=>{if(!cell.contains(e.relatedTarget))cell.classList.remove('is-drop-target','is-drop-warning','is-drop-blocked')};
      cell.ondrop=e=>{e.preventDefault();e.stopPropagation();const payload=dragPayload,check=dropCheck(cell);clearDropState(wrap);dragPayload=null;if(!payload||check?.hard?.length){if(check?.hard?.length&&typeof showSaveToast==='function')showSaveToast('Verschieben nicht möglich',check.hard.join(' '));return}const type=cell.dataset.shiftRow,date=cell.dataset.date;if(payload.kind==='assignment')moveAssignment(payload.id,type,date);else addEmployee(payload.id,type,date)};
      cell.querySelector('[data-open-assign]')?.addEventListener('click',()=>window.openAssign?.(cell.dataset.shiftRow,cell.dataset.date));
    });
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
    installInteractions(wrap);
    applyMode();
  }

  const original=window.renderCalendar;
  document.addEventListener('dragstart',e=>{const card=e.target.closest?.('.employee-drag');if(card?.dataset.employeeId)dragPayload={kind:'employee',id:card.dataset.employeeId}});
  document.addEventListener('dragend',e=>{if(e.target.closest?.('.employee-drag')){dragPayload=null;const wrap=document.getElementById('sfWeekBoardV2');if(wrap)clearDropState(wrap)}});
  if(typeof original==='function'){
    window.renderCalendar=function(){const r=original.apply(this,arguments);try{renderBoard()}catch(e){console.warn('Wochenansicht V2 konnte nicht gerendert werden',e)}return r};
  }
  try{renderBoard()}catch(e){console.warn('Wochenansicht V2 konnte nicht initialisiert werden',e)}
})();

