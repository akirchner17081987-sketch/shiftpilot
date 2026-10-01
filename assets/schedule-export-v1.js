// Gesamtdienstplan als echte XLSX-Datei oder PDF, ohne Schreibzugriffe auf Plandaten.
(function(){
  if(window.SFScheduleExport)return;
  const managers=new Set(['OWNER','ADMIN','PLANNER','DISPATCHER']),loading=new Map();let dialog=null,busy=false;
  function access(){const b=window.SFBackend;if(!b?.ready||!b.companyId||!managers.has(b.role))throw Error('Der Gesamtdienstplan kann nur mit aktiven Planungsrechten exportiert werden.');return b}
  function currentMonth(){const p=window.SchichtFunkCalendarView?.getPeriod?.();if(p?.mode==='month')return p.start.slice(0,7);const d=typeof weekStart!=='undefined'?weekStart:new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
  function snapshot(month){
    const b=access(),belongs=x=>!(x.companyId||x.company_id)||(x.companyId||x.company_id)===b.companyId;
    return window.SFScheduleExportCore.buildPlan({month,company:b.company?.name||document.querySelector('.company-card b')?.textContent||'Unternehmen',employees:(typeof employees!=='undefined'?employees:[]).filter(belongs),assignments:(typeof assignments!=='undefined'?assignments:[]).filter(belongs),absences:(typeof absences!=='undefined'?absences:[]).filter(belongs),types:typeof TYPES!=='undefined'?TYPES:[],typeById:typeof typeById==='function'?typeById:null,getSoll:typeof getSoll==='function'?getSoll:null});
  }
  function load(src,ready){
    if(ready())return Promise.resolve();if(loading.has(src))return loading.get(src);
    const promise=new Promise((resolve,reject)=>{
      const node=document.createElement('script'),owned=true;node.src=src;node.async=true;
      const finish=(error)=>{clearTimeout(timer);node.removeEventListener('load',onLoad);node.removeEventListener('error',onError);if(error){if(owned)node.remove();reject(error)}else resolve()};
      const onLoad=()=>finish(ready()?null:Error('Die Export-Bibliothek ist nicht verfügbar.')),onError=()=>finish(Error('Die Export-Bibliothek konnte nicht geladen werden. Bitte erneut versuchen.'));
      const timer=setTimeout(onError,20000);node.addEventListener('load',onLoad,{once:true});node.addEventListener('error',onError,{once:true});if(owned)document.head.append(node);
    }).catch(error=>{loading.delete(src);throw error});loading.set(src,promise);return promise;
  }
  function fileName(plan,extension){return 'SchichtFunk_Gesamtdienstplan_'+plan.month+'.'+extension}
  function excel(plan){
    const X=window.XLSX,wb=X.utils.book_new(),data=window.SFScheduleExportCore.workbookRows(plan);
    for(const [key,name] of [['matrix','Monatsplan'],['details','Schichtdetails'],['coverage','Besetzung'],['legend','Hinweise']]){
      const ws=X.utils.aoa_to_sheet(data[key]);
      if(key==='matrix'){
        ws['!cols']=[{wch:14},{wch:28},{wch:8},...plan.days.map(()=>({wch:23})),{wch:9},{wch:13}];ws['!rows']=data.matrix.map((_,i)=>({hpt:i<7?20:48}));
        ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:plan.days.length+4}}];ws['!autofilter']={ref:X.utils.encode_range({s:{r:6,c:0},e:{r:data.matrix.length-1,c:plan.days.length+4}})};
      }else ws['!cols']=data[key][0].map((_,i)=>({wch:key==='legend'?i===0?25:85:i===2?28:18}));
      X.utils.book_append_sheet(wb,ws,name);
    }
    wb.Props={Title:'Gesamtdienstplan '+plan.label,Subject:plan.company,Author:'SchichtFunk',CreatedDate:new Date(plan.createdAt)};
    X.writeFile(wb,fileName(plan,'xlsx'),{bookType:'xlsx',compression:true});
  }
  function pdf(plan){
    const doc=new window.jspdf.jsPDF({orientation:'landscape',unit:'mm',format:'a3'}),width=doc.internal.pageSize.getWidth();
    function header(){doc.setFillColor(8,24,38);doc.roundedRect(10,9,width-20,29,2,2,'F');doc.setFont('helvetica','bold');doc.setTextColor(39,214,180);doc.setFontSize(16);doc.text('SchichtFunk',16,20);doc.setFontSize(8);doc.setTextColor(220,236,246);doc.text('Klar geplant. Stark besetzt.',16,29);doc.setFontSize(15);doc.setTextColor(255,255,255);doc.text('Gesamtdienstplan · '+plan.label,width-16,20,{align:'right'});doc.setFontSize(8);doc.text(plan.company+' · '+plan.status,width-16,29,{align:'right',maxWidth:width-125});doc.setTextColor(70,85,99);doc.setFont('helvetica','normal');doc.setFontSize(7);doc.text('Nachtdienste stehen am Starttag. Planstunden ohne Pausenabzug. – = kein Dienst eingetragen.',10,44)}
    const nameWidth=55,teamWidth=12,totalWidth=16,dayWidth=(width-20-nameWidth-teamWidth-totalWidth)/plan.days.length;
    const styles={0:{cellWidth:nameWidth,halign:'left'},1:{cellWidth:teamWidth},[plan.days.length+2]:{cellWidth:totalWidth}};
    plan.days.forEach((_,i)=>styles[i+2]={cellWidth:dayWidth});
    doc.autoTable({startY:50,margin:{top:50,left:10,right:10,bottom:24},head:[['Mitarbeiter','Team',...plan.days.map(d=>String(d.day)+'\n'+d.weekday),'Std.']],body:plan.rows.map(r=>[r.person.name+(r.person.personnelNo?'\n'+r.person.personnelNo:''),r.person.team,...r.cells.map(c=>c.pdf),r.hours.toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})]),styles:{font:'helvetica',fontSize:7,cellPadding:1.6,minCellHeight:7,halign:'center',valign:'middle',lineColor:[218,226,232],lineWidth:.15,overflow:'linebreak'},headStyles:{fillColor:[8,77,67],textColor:[255,255,255],fontStyle:'bold'},alternateRowStyles:{fillColor:[244,248,250]},columnStyles:styles,rowPageBreak:'avoid',didParseCell:data=>{if(data.section==='body'&&data.column.index>=2&&data.column.index<plan.days.length+2&&plan.days[data.column.index-2].weekend)data.cell.styles.fillColor=[233,241,245]},didDrawPage:()=>header()});
    // Abweichende Uhrzeiten werden vollständig angegeben, statt die Monatsmatrix zu überladen.
    const adjusted=plan.details.filter(a=>a.adjusted);
    if(adjusted.length){doc.addPage();doc.autoTable({startY:50,margin:{top:50,left:10,right:10,bottom:24},head:[['Abweichende Zeiten (*)','Datum','Schicht','Beginn','Ende','Folgetag']],body:adjusted.map(a=>[a.person.name,a.date,a.type,a.start,a.end,a.overnight?'Ja':'Nein']),styles:{fontSize:9,cellPadding:2},headStyles:{fillColor:[8,77,67]},didDrawPage:()=>header()})}
    const pages=doc.getNumberOfPages(),legend=plan.types.map(t=>t.id+' '+(t.start||'')+'–'+(t.end||'')).join(' · ');
    for(let i=1;i<=pages;i++){doc.setPage(i);const h=doc.internal.pageSize.getHeight();doc.setFont('helvetica','normal');doc.setFontSize(6.5);doc.setTextColor(80,98,113);doc.text(legend,10,h-17,{maxWidth:width-20});doc.text('U Urlaub · K Krank · F Frei · FB Fortbildung · SP Sperrzeit · SU Sonderurlaub · AB Sonstiges · * abweichende Zeiten im Anhang',10,h-11);doc.text('Erstellt '+new Date(plan.createdAt).toLocaleString('de-DE')+' · '+plan.rows.length+' Mitarbeiter · '+plan.shiftCount+' Dienste · '+plan.hours.toLocaleString('de-DE')+' Planstunden',10,h-5);doc.text('Seite '+i+' / '+pages,width-10,h-5,{align:'right'})}
    doc.save(fileName(plan,'pdf'));
  }
  async function download(format){
    if(busy)return;const status=dialog.querySelector('.sf-plan-export-status');status.classList.remove('error');
    busy=true;dialog.querySelectorAll('button,input').forEach(n=>n.disabled=true);status.textContent='Datei wird erstellt …';
    try{
      const companyId=access().companyId,plan=snapshot(dialog.querySelector('input').value);
      if(format==='xlsx')await load('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',()=>!!window.XLSX);
      else{await load('https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js',()=>!!window.jspdf?.jsPDF);await load('https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js',()=>!!window.jspdf?.jsPDF?.API?.autoTable)}
      if(access().companyId!==companyId)throw Error('Das Unternehmen wurde gewechselt. Bitte den Export neu öffnen.');
      if(!dialog.open)throw Error('Export abgebrochen.');
      if(format==='xlsx')excel(plan);else pdf(plan);status.textContent=fileName(plan,format)+' wurde erstellt.';
    }catch(error){status.classList.add('error');status.textContent=error.message||'Der Export konnte nicht erstellt werden.'}
    finally{busy=false;dialog.querySelectorAll('button,input').forEach(n=>n.disabled=false)}
  }
  function updateSummary(){const box=dialog.querySelector('.sf-plan-export-summary');try{const p=snapshot(dialog.querySelector('input').value);box.textContent=p.label+' · '+p.days.length+' Tage · '+p.rows.length+' Mitarbeiter · '+p.shiftCount+' Dienste · '+p.hours.toLocaleString('de-DE')+' Planstunden';dialog.querySelectorAll('[data-format]').forEach(b=>b.disabled=false)}catch(error){box.textContent=error.message;dialog.querySelectorAll('[data-format]').forEach(b=>b.disabled=true)}}
  function open(){
    try{access()}catch(error){window.showSaveToast?.('Export nicht verfügbar',error.message);return}
    if(!dialog){dialog=document.createElement('dialog');dialog.className='sf-plan-export-dialog';dialog.id='sfPlanExportDialog';dialog.setAttribute('aria-labelledby','sfPlanExportTitle');dialog.innerHTML='<h2 id="sfPlanExportTitle">Gesamtdienstplan exportieren</h2><p>Alle Mitarbeiter und Tage des gewählten Monats. Excel enthält zusätzlich Schichtdetails und SOLL/IST. Das PDF zeigt den Monatsplan im SchichtFunk-Design (DIN A3 quer).</p><label>Monat<input id="sfPlanExportMonth" type="month" required></label><div class="sf-plan-export-summary"></div><div class="sf-plan-export-actions"><button type="button" class="ghost" data-close>Schließen</button><button type="button" class="ghost" data-format="xlsx">Excel herunterladen</button><button type="button" class="primary" data-format="pdf">PDF herunterladen</button></div><span class="sf-plan-export-status" role="status"></span>';document.body.append(dialog);dialog.querySelector('input').addEventListener('change',updateSummary);dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.querySelectorAll('[data-format]').forEach(b=>b.onclick=()=>download(b.dataset.format));dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault()})}
    dialog.querySelector('input').value=currentMonth();dialog.querySelector('.sf-plan-export-status').textContent='';updateSummary();if(!dialog.open)dialog.showModal();window.SFDateMonthFormat?.refresh(dialog);
  }
  function mount(){const head=document.querySelector('#view-schedule .page-head');if(!head||head.querySelector('.sf-schedule-export'))return;const actions=document.createElement('div');actions.className='sf-schedule-export-head-actions';[...head.children].filter(n=>n.tagName==='BUTTON').forEach(n=>actions.append(n));const button=document.createElement('button');button.type='button';button.className='ghost sf-schedule-export';button.textContent='Excel / PDF';button.setAttribute('aria-label','Gesamtdienstplan als Excel oder PDF exportieren');button.onclick=open;actions.append(button);head.append(actions)}
  window.SFScheduleExport={open,snapshot};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
  document.addEventListener('sf:schedule-period-changed',mount);
})();
