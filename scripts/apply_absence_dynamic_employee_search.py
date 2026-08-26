from pathlib import Path

p=Path('index.html')
s=p.read_text(encoding='utf-8')
marker='ABSENCE_DYNAMIC_EMPLOYEE_SEARCH_V1'
if marker in s:
    print('dynamic employee search already applied')
    raise SystemExit(0)

addon=r'''
<style id="absence-dynamic-search-css">
.abs-employee-search{position:relative}
.abs-employee-searchbox{position:relative}
.abs-employee-searchbox:before{content:"⌕";position:absolute;left:14px;top:50%;transform:translateY(-50%);color:#7890aa;font-size:18px;pointer-events:none}
.abs-employee-searchbox input{padding-left:42px!important;padding-right:40px!important}
.abs-employee-search-clear{position:absolute;right:10px;top:50%;transform:translateY(-50%);border:0;background:transparent;color:#7890aa;font-size:18px;padding:4px 7px;border-radius:6px;display:none}
.abs-employee-search-clear.show{display:block}.abs-employee-search-clear:hover{background:#15283a;color:#fff}
.abs-employee-results{display:none;position:absolute;z-index:50;left:0;right:0;top:calc(100% + 7px);max-height:250px;overflow:auto;background:#0a1725;border:1px solid #2b485f;border-radius:10px;box-shadow:0 18px 45px rgba(0,0,0,.42);padding:6px}
.abs-employee-results.show{display:block}
.abs-employee-result{width:100%;border:0;background:transparent;color:#eaf4ff;border-radius:8px;padding:10px 11px;display:grid;grid-template-columns:34px 1fr auto;gap:10px;align-items:center;text-align:left}
.abs-employee-result:hover,.abs-employee-result.active{background:#123029}
.abs-employee-result .avatar{width:34px;height:34px;background:#174a86}
.abs-employee-result b{display:block;font-size:13px}.abs-employee-result small{display:block;color:#849bb4;margin-top:2px;font-size:11px}
.abs-employee-result .emp-no{color:#45dcc1;font-size:11px;font-weight:800}
.abs-employee-no-results{padding:13px;color:#879db6;font-size:12px;text-align:center}
.abs-selected-hint{margin-top:6px;color:#7890aa;font-size:11px;display:flex;align-items:center;gap:6px}.abs-selected-hint.ok{color:#55e0c5}
</style>
<script id="absence-dynamic-search-js">
/* ABSENCE_DYNAMIC_EMPLOYEE_SEARCH_V1 */
let absenceEmployeeResultIndex=-1;
function absenceEmployeeLabel(e){return `${e.first||''} ${e.last||''}${e.personnelNo?' · '+e.personnelNo:''}`.trim()}
function absenceEmployeeMatches(e,q){q=(q||'').trim().toLowerCase();if(!q)return true;return `${e.first||''} ${e.last||''} ${e.personnelNo||''}`.toLowerCase().includes(q)}
function renderAbsenceEmployeeResults(){
  const input=document.getElementById('absEmpSearch'),box=document.getElementById('absEmpResults');if(!input||!box)return;
  const currentId=document.getElementById('absEmp')?.value||'';
  const q=input.value||'';
  const rows=employees.filter(e=>(e.status==='active'||e.id===currentId)&&absenceEmployeeMatches(e,q)).slice(0,30);
  absenceEmployeeResultIndex=Math.min(absenceEmployeeResultIndex,rows.length-1);
  box.innerHTML=rows.length?rows.map((e,i)=>`<button type="button" class="abs-employee-result ${i===absenceEmployeeResultIndex?'active':''}" onmousedown="event.preventDefault();selectAbsenceEmployee('${e.id}')"><span class="avatar">${(e.first?.[0]||'')+(e.last?.[0]||'')}</span><span><b>${e.first||''} ${e.last||''}</b><small>${e.role||'Mitarbeiter'}${e.personnelNo?' · Personalnummer '+e.personnelNo:''}</small></span><span class="emp-no">${e.personnelNo||''}</span></button>`).join(''):'<div class="abs-employee-no-results">Kein Mitarbeiter gefunden.</div>';
  box.classList.add('show');
}
function selectAbsenceEmployee(id){
  const e=employees.find(x=>x.id===id);if(!e)return;
  const hidden=document.getElementById('absEmp'),input=document.getElementById('absEmpSearch'),box=document.getElementById('absEmpResults'),clear=document.getElementById('absEmpClear'),hint=document.getElementById('absEmpHint');
  hidden.value=id;input.value=absenceEmployeeLabel(e);box?.classList.remove('show');clear?.classList.add('show');
  if(hint){hint.className='abs-selected-hint ok';hint.innerHTML=`✓ Ausgewählt: <b>${e.first} ${e.last}</b>${e.personnelNo?' · '+e.personnelNo:''}`}
  absenceEmployeeResultIndex=-1;updateAbsenceModalConflicts();
}
function clearAbsenceEmployeeSearch(){const hidden=document.getElementById('absEmp'),input=document.getElementById('absEmpSearch'),clear=document.getElementById('absEmpClear'),hint=document.getElementById('absEmpHint');if(hidden)hidden.value='';if(input){input.value='';input.focus()}clear?.classList.remove('show');if(hint){hint.className='abs-selected-hint';hint.textContent='Nach Vorname, Nachname oder Personalnummer suchen.'}renderAbsenceEmployeeResults();updateAbsenceModalConflicts()}
function handleAbsenceEmployeeInput(){
  const input=document.getElementById('absEmpSearch'),hidden=document.getElementById('absEmp'),clear=document.getElementById('absEmpClear'),hint=document.getElementById('absEmpHint');if(!input||!hidden)return;
  const selected=employees.find(e=>e.id===hidden.value);if(!selected||input.value!==absenceEmployeeLabel(selected)){hidden.value='';if(hint){hint.className='abs-selected-hint';hint.textContent='Bitte einen Treffer auswählen.'}}
  clear?.classList.toggle('show',!!input.value);absenceEmployeeResultIndex=-1;renderAbsenceEmployeeResults();updateAbsenceModalConflicts();
}
function handleAbsenceEmployeeKeydown(ev){
 const box=document.getElementById('absEmpResults');if(!box)return;const items=[...box.querySelectorAll('.abs-employee-result')];
 if(ev.key==='ArrowDown'){ev.preventDefault();absenceEmployeeResultIndex=Math.min(absenceEmployeeResultIndex+1,items.length-1);renderAbsenceEmployeeResults()}
 else if(ev.key==='ArrowUp'){ev.preventDefault();absenceEmployeeResultIndex=Math.max(absenceEmployeeResultIndex-1,0);renderAbsenceEmployeeResults()}
 else if(ev.key==='Enter'&&absenceEmployeeResultIndex>=0&&items[absenceEmployeeResultIndex]){ev.preventDefault();items[absenceEmployeeResultIndex].dispatchEvent(new MouseEvent('mousedown',{bubbles:true}))}
 else if(ev.key==='Escape'){box.classList.remove('show')}
}
const _openAbsenceDialogDynamicBase=openAbsenceDialog;
openAbsenceDialog=function(id=null){
  _openAbsenceDialogDynamicBase(id);
  const hidden=document.getElementById('absEmp');if(!hidden)return;
  const currentId=hidden.value;const current=employees.find(e=>e.id===currentId);
  const parent=hidden.closest('.abs-field');if(!parent)return;
  parent.innerHTML=`<label>Mitarbeiter</label><div class="abs-employee-search"><input type="hidden" id="absEmp" value="${currentId||''}"><div class="abs-employee-searchbox"><input class="abs-input" id="absEmpSearch" autocomplete="off" placeholder="Vorname, Nachname oder Personalnummer suchen ..." value="${current?absenceEmployeeLabel(current):''}" oninput="handleAbsenceEmployeeInput()" onfocus="renderAbsenceEmployeeResults()" onkeydown="handleAbsenceEmployeeKeydown(event)"><button type="button" id="absEmpClear" class="abs-employee-search-clear ${current?'show':''}" onclick="clearAbsenceEmployeeSearch()">×</button></div><div id="absEmpResults" class="abs-employee-results"></div><div id="absEmpHint" class="abs-selected-hint ${current?'ok':''}">${current?`✓ Ausgewählt: <b>${current.first} ${current.last}</b>${current.personnelNo?' · '+current.personnelNo:''}`:'Nach Vorname, Nachname oder Personalnummer suchen.'}</div></div>`;
  document.getElementById('absEmpSearch')?.addEventListener('blur',()=>setTimeout(()=>document.getElementById('absEmpResults')?.classList.remove('show'),140));
  updateAbsenceModalConflicts();
}
const _saveAbsenceDialogDynamicBase=saveAbsenceDialog;
saveAbsenceDialog=function(){if(!document.getElementById('absEmp')?.value){alert('Bitte zuerst einen Mitarbeiter über die Suche auswählen.');document.getElementById('absEmpSearch')?.focus();return}_saveAbsenceDialogDynamicBase()}
</script>
'''

s=s.replace('</body>',addon+'\n</body>',1)
p.write_text(s,encoding='utf-8')
print('dynamic absence employee search applied')
