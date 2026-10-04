// Gesamtdienstplan als echte XLSX-Datei oder PDF, ohne Schreibzugriffe auf Plandaten.
(function(){
  if(window.SFScheduleExport)return;
  const managers=new Set(['OWNER','ADMIN','PLANNER','DISPATCHER']),loading=new Map();let dialog=null,busy=false,latestPlan=null;
  function access(){const b=window.SFBackend;if(!b?.ready||!b.companyId||!managers.has(b.role))throw Error('Der Gesamtdienstplan kann nur mit aktiven Planungsrechten exportiert werden.');return b}
  function currentMonth(){const p=window.SchichtFunkCalendarView?.getPeriod?.();if(p?.mode==='month')return p.start.slice(0,7);const d=typeof weekStart!=='undefined'?weekStart:new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
  function snapshot(month,source={}){
    const b=access(),belongs=x=>!(x.companyId||x.company_id)||(x.companyId||x.company_id)===b.companyId;
    return window.SFScheduleExportCore.buildPlan({month,companyId:b.companyId,company:b.company?.name||document.querySelector('.company-card b')?.textContent||'Unternehmen',employees:(typeof employees!=='undefined'?employees:[]).filter(belongs),assignments:(typeof assignments!=='undefined'?assignments:[]).filter(belongs),absences:(typeof absences!=='undefined'?absences:[]).filter(belongs),types:typeof TYPES!=='undefined'?TYPES:[],typeById:typeof typeById==='function'?typeById:null,getSoll:typeof getSoll==='function'?getSoll:null,employeeMonthlyTarget:typeof employeeMonthlyTarget==='function'?employeeMonthlyTarget:null,...source});
  }
  // Read independently of the calendar cache, without changing or syncing the plan.
  async function freshSnapshot(month){
    window.SFScheduleExportCore.buildPlan({month}); // Validate without using the calendar cache.
    const b=access(),companyId=b.companyId;
    if(!b.client?.from||sessionStorage.getItem('sf_demo_session_v1')==='active')return snapshot(month);
    const assertReady=()=>{
      if(access().companyId!==companyId||b.companySwitching)throw Error('Das Unternehmen wurde gewechselt. Bitte den Export neu öffnen.');
      if(b.syncTimer||b.syncing||b.suppressSync||b.employeeStatusSaving||b.teamRhythmSaving)throw Error('Änderungen werden noch gespeichert. Bitte anschließend den Export erneut starten.');
      if(b.lastSyncError)throw Error('Die letzten Änderungen konnten nicht gespeichert werden. Bitte zuerst die Cloud-Synchronisierung prüfen.');
    };
    assertReady();
    const [year,m]=month.split('-').map(Number),offset=14*60*60*1000;
    // Include all possible company timezones; buildPlan selects exact local dates.
    const from=new Date(Date.UTC(year,m-1,1)-offset).toISOString(),to=new Date(Date.UTC(year,m,1)+offset).toISOString();
    async function readRows(table,filter=q=>q){
      const rows=[];let cursor=null;
      for(;;){
        let q=filter(b.client.from(table).select('*').eq('company_id',companyId)).order('id').limit(500);
        if(cursor)q=q.gt('id',cursor);
        const result=await q;assertReady();if(result.error)throw result.error;
        if(!Array.isArray(result.data))throw Error('Die aktuellen Plandaten konnten nicht vollständig geladen werden.');
        rows.push(...result.data);if(result.data.length<500)return rows;
        cursor=result.data[result.data.length-1].id;
      }
    }
    const [co,staff,duties,off,templates]=await Promise.all([
      b.client.from('companies').select('name,timezone').eq('id',companyId).single(),
      readRows('employees'),readRows('shift_assignments',q=>q.neq('status','CANCELLED').gte('starts_at',from).lt('starts_at',to)),
      readRows('absences'),readRows('shift_templates')
    ]);
    assertReady();if(co.error)throw co.error;if(!co.data)throw Error('Das Unternehmen konnte nicht geladen werden.');
    const tz=co.data.timezone||'Europe/Berlin',ids=new Map(staff.map(e=>[e.id,String(e.legacy_id||e.id)]));
    const date=v=>new Intl.DateTimeFormat('sv-SE',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v));
    const time=v=>new Intl.DateTimeFormat('de-DE',{timeZone:tz,hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(v)).replace('24:','00:');
    const plan=snapshot(month,{
      company:co.data.name,
      employees:staff.filter(e=>!e.deleted_at||duties.some(a=>a.employee_id===e.id)).map(e=>({id:ids.get(e.id),first:e.first_name,last:e.last_name,personnelNo:e.personnel_no||'',status:e.deleted_at?'inactive':e.status,startDate:e.start_date,contractEnd:e.contract_end,weeklyHours:Number(e.weekly_hours||0),qualifications:e.qualifications||[],planningTeam:(e.qualifications||[]).find(q=>String(q).startsWith('__sp:planningTeam='))?.slice(18)||''})),
      assignments:duties.map(a=>({id:a.id,employeeId:ids.get(a.employee_id)||a.employee_id,type:a.shift_code,date:date(a.starts_at),start:time(a.starts_at),end:time(a.ends_at),publishedAt:a.published_at})),
      absences:off.map(a=>({employeeId:ids.get(a.employee_id)||a.employee_id,startDate:a.start_date,endDate:a.end_date,type:a.absence_type,status:a.status,fullDay:a.full_day})),
      types:templates.sort((a,b)=>a.sort_order-b.sort_order).map(t=>({id:t.code,name:t.name,start:t.default_start?.slice(0,5),end:t.default_end?.slice(0,5),active:t.active})),
      typeById:null,employeeMonthlyTarget:null
    });
    latestPlan={companyId,plan};return plan;
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
  function fileName(plan,extension){return extension==='pdf'&&plan.pdfScope&&plan.pdfScope!=='Gesamt'?'SchichtFunk_Dienstplan_'+plan.pdfScope+'_'+plan.month+'.pdf':'SchichtFunk_Gesamtdienstplan_'+plan.month+'.'+extension}
  const hours=value=>value===null?'–':Number(value).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2});
  const balance=value=>value===null?'–':(value>0?'+':'')+hours(value);
  function excel(plan){
    const X=window.XLSX,wb=X.utils.book_new(),data=window.SFScheduleExportCore.workbookRows(plan);
    for(const [key,name] of [['matrix','Monatsplan'],['details','Schichtdetails'],['coverage','Besetzung'],['legend','Hinweise']]){
      const ws=X.utils.aoa_to_sheet(data[key]);
      if(key==='matrix'){
        ws['!cols']=[{wch:14},{wch:28},{wch:8},...plan.days.map(()=>({wch:23})),{wch:9},{wch:15},{wch:17},{wch:16}];ws['!rows']=data.matrix.map((_,i)=>({hpt:i<7?20:48}));
        ws['!merges']=[0,4,5].map(r=>({s:{r,c:0},e:{r,c:plan.days.length+6}}));ws['!autofilter']={ref:X.utils.encode_range({s:{r:6,c:0},e:{r:data.matrix.length-1,c:plan.days.length+6}})};
        for(let row=7;row<data.matrix.length;row++){
          for(let col=plan.days.length+4;col<=plan.days.length+6;col++){const cell=ws[X.utils.encode_cell({r:row,c:col})];if(cell?.t==='n')cell.z=col===plan.days.length+6?'+0.00;-0.00;0.00':'0.00'}
          if(plan.rows[row-7].targetHours!==null){const col=plan.days.length+6,cell=ws[X.utils.encode_cell({r:row,c:col})];cell.f=X.utils.encode_cell({r:row,c:col-2})+'-'+X.utils.encode_cell({r:row,c:col-1})}
        }
      }else ws['!cols']=data[key][0].map((_,i)=>({wch:key==='legend'?i===0?25:85:i===2?28:18}));
      if(key==='details')for(let row=1;row<data.details.length;row++)ws[X.utils.encode_cell({r:row,c:8})].z='0.00';
      X.utils.book_append_sheet(wb,ws,name);
    }
    wb.Props={Title:'Gesamtdienstplan '+plan.label,Subject:plan.company,Author:'SchichtFunk',CreatedDate:new Date(plan.createdAt)};
    X.writeFile(wb,fileName(plan,'xlsx'),{bookType:'xlsx',compression:true});
  }
  function pdf(plan){
    const doc=new window.jspdf.jsPDF({orientation:'landscape',unit:'mm',format:'a3'}),width=doc.internal.pageSize.getWidth();
    function header(){doc.setFillColor(8,24,38);doc.roundedRect(10,9,width-20,29,2,2,'F');doc.setFont('helvetica','bold');doc.setTextColor(39,214,180);doc.setFontSize(16);doc.text('SchichtFunk',16,20);doc.setFontSize(8);doc.setTextColor(220,236,246);doc.text('Klar geplant. Stark besetzt.',16,29);doc.setFontSize(15);doc.setTextColor(255,255,255);doc.text((plan.pdfScope&&plan.pdfScope!=='Gesamt'?'Dienstplan '+plan.pdfScope:'Gesamtdienstplan')+' · '+plan.label,width-16,20,{align:'right'});doc.setFontSize(8);doc.text(plan.company+' · '+plan.status,width-16,29,{align:'right',maxWidth:width-125});doc.setTextColor(70,85,99);doc.setFont('helvetica','normal');doc.setFontSize(7);doc.text(plan.assignedEmployeeCount+' / '+plan.employeeCount+' Mitarbeiter eingeplant · '+plan.shiftCount+' Dienste · Plan-IST '+hours(plan.hours)+' h · Monats-SOLL '+hours(plan.targetHours)+' h · Differenz '+balance(plan.difference)+' h',10,44);doc.text('Plan-IST = geplante Stunden ohne Pausenabzug. Differenz = Plan-IST minus Monats-SOLL. Keine IST-Zeiterfassung. – = kein Wert hinterlegt.',10,49)}
    const nameWidth=50,teamWidth=10,metricWidths=[12,19,19,19],dayWidth=(width-20-nameWidth-teamWidth-metricWidths.reduce((n,w)=>n+w,0))/plan.days.length;
    const styles={0:{cellWidth:nameWidth,halign:'left'},1:{cellWidth:teamWidth}};metricWidths.forEach((cellWidth,i)=>styles[plan.days.length+2+i]={cellWidth});
    plan.days.forEach((_,i)=>styles[i+2]={cellWidth:dayWidth});
    doc.autoTable({startY:55,margin:{top:55,left:10,right:10,bottom:24},head:[['Mitarbeiter','Team',...plan.days.map(d=>String(d.day)+'\n'+d.weekday),'Dienste','Plan-IST\n(h)','SOLL\n(h)','Differenz\n(h)']],body:plan.rows.map(r=>[r.person.name+(r.person.personnelNo?'\n'+r.person.personnelNo:''),r.person.team,...r.cells.map(c=>c.pdf),r.shiftCount,hours(r.hours),hours(r.targetHours),balance(r.difference)]),styles:{font:'helvetica',fontSize:7,cellPadding:1.6,minCellHeight:7,halign:'center',valign:'middle',lineColor:[218,226,232],lineWidth:.15,overflow:'linebreak'},headStyles:{fillColor:[8,77,67],textColor:[255,255,255],fontStyle:'bold'},alternateRowStyles:{fillColor:[244,248,250]},columnStyles:styles,rowPageBreak:'avoid',didParseCell:data=>{const color=plan.rows[data.row.index]?.color;if(data.section==='body'&&color&&data.column.index<2){data.cell.styles.fillColor=color.rgb;data.cell.styles.textColor=[35,40,45]}if(data.section==='body'&&data.column.index===plan.days.length+5){const diff=plan.rows[data.row.index]?.difference;if(diff!==null&&diff<0)data.cell.styles.textColor=[160,76,0];else if(diff>0)data.cell.styles.textColor=[0,92,100]}if(data.section==='body'&&data.column.index>=2&&data.column.index<plan.days.length+2&&plan.days[data.column.index-2].weekend)data.cell.styles.fillColor=[233,241,245]},didDrawPage:()=>header()});
    // Abweichende Uhrzeiten werden vollständig angegeben, statt die Monatsmatrix zu überladen.
    const adjusted=plan.details.filter(a=>a.adjusted);
    if(adjusted.length){doc.addPage();doc.autoTable({startY:55,margin:{top:55,left:10,right:10,bottom:24},head:[['Abweichende Zeiten (*)','Datum','Schicht','Beginn','Ende','Folgetag']],body:adjusted.map(a=>[a.person.name,a.date,a.type,a.start,a.end,a.overnight?'Ja':'Nein']),styles:{fontSize:9,cellPadding:2},headStyles:{fillColor:[8,77,67]},didDrawPage:()=>header()})}
    const pages=doc.getNumberOfPages(),legend=plan.types.map(t=>t.id+' '+(t.start||'')+'–'+(t.end||'')).join(' · ');
    for(let i=1;i<=pages;i++){doc.setPage(i);const h=doc.internal.pageSize.getHeight();doc.setFont('helvetica','normal');doc.setFontSize(6.5);doc.setTextColor(80,98,113);doc.text(legend,10,h-17,{maxWidth:width-20});doc.text('U Urlaub · K Krank · F Frei · FB Fortbildung · SP Sperrzeit · SU Sonderurlaub · AB Sonstiges · * abweichende Zeiten im Anhang',10,h-11);doc.text('Erstellt '+new Date(plan.createdAt).toLocaleString('de-DE')+' · '+plan.rows.length+' Mitarbeiter · '+plan.shiftCount+' Dienste · '+plan.hours.toLocaleString('de-DE')+' Planstunden',10,h-5);doc.text('Seite '+i+' / '+pages,width-10,h-5,{align:'right'})}
    doc.save(fileName(plan,'pdf'));
  }
  async function download(format){
    if(busy)return;const status=dialog.querySelector('.sf-plan-export-status');status.classList.remove('error');
    busy=true;dialog.querySelectorAll('button,input,select').forEach(n=>n.disabled=true);status.textContent='Datei wird erstellt …';
    try{
      const companyId=access().companyId;status.textContent='Aktueller Dienstplan wird geladen …';
      const fullPlan=await freshSnapshot(dialog.querySelector('input').value),plan=format==='pdf'?window.SFScheduleExportCore.selectPDFPlan(fullPlan,dialog.querySelector('#sfPlanExportScope').value):fullPlan;
      if(format==='pdf'&&!plan.rows.length)throw Error('Für '+plan.pdfScope+' sind im gewählten Monat keine Mitarbeiter vorhanden.');
      if(format==='xlsx')await load('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',()=>!!window.XLSX);
      else{await load('https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js',()=>!!window.jspdf?.jsPDF);await load('https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js',()=>!!window.jspdf?.jsPDF?.API?.autoTable)}
      if(access().companyId!==companyId)throw Error('Das Unternehmen wurde gewechselt. Bitte den Export neu öffnen.');
      if(!dialog.open)throw Error('Export abgebrochen.');
      if(format==='xlsx')excel(plan);else pdf(plan);status.textContent=fileName(plan,format)+' wurde erstellt.';
    }catch(error){status.classList.add('error');status.textContent=error.message||'Der Export konnte nicht erstellt werden.'}
    finally{busy=false;dialog.querySelectorAll('button,input,select').forEach(n=>n.disabled=false);updateSummary()}
  }
  function updateSummary(){
    const box=dialog.querySelector('.sf-plan-export-summary');
    try{
      const month=dialog.querySelector('input').value,full=latestPlan?.companyId===access().companyId&&latestPlan.plan.month===month?latestPlan.plan:snapshot(month),p=window.SFScheduleExportCore.selectPDFPlan(full,dialog.querySelector('#sfPlanExportScope').value);
      box.textContent='PDF · '+p.pdfScope+' · '+p.label+' · '+p.days.length+' Tage · '+p.rows.length+' Mitarbeiter · '+p.shiftCount+' Dienste · '+p.hours.toLocaleString('de-DE')+' Planstunden · Monats-SOLL '+hours(p.targetHours)+' h · Differenz '+balance(p.difference)+' h · '+p.assignedEmployeeCount+' Mitarbeiter eingeplant'+(!p.rows.length?' · Keine Mitarbeiter für diese Auswahl.':'');
      dialog.querySelector('[data-format="xlsx"]').disabled=false;dialog.querySelector('[data-format="pdf"]').disabled=!p.rows.length&&!access().client?.from;
    }catch(error){box.textContent=error.message;dialog.querySelectorAll('[data-format]').forEach(b=>b.disabled=true)}
  }
  function open(){
    try{access()}catch(error){window.showSaveToast?.('Export nicht verfügbar',error.message);return}
    if(!dialog){dialog=document.createElement('dialog');dialog.className='sf-plan-export-dialog';dialog.id='sfPlanExportDialog';dialog.setAttribute('aria-labelledby','sfPlanExportTitle');dialog.innerHTML='<h2 id="sfPlanExportTitle">Gesamtdienstplan exportieren</h2><p>Wähle für das PDF Leipzig, Recklinghausen oder Gesamt. Alle Dienste der Mitarbeiter des gewählten Standorts werden aufgenommen, auch standortübergreifende Einsätze. Excel und PDF zeigen Dienste je Mitarbeiter, Plan-IST, Monats-SOLL und Differenz. Excel enthält zusätzlich Schichtdetails und die Besetzung.</p><label>Monat<input id="sfPlanExportMonth" type="month" required></label><label>PDF-Auswahl<select id="sfPlanExportScope" aria-describedby="sfPlanExportScopeHint"><option>Leipzig</option><option>Recklinghausen</option><option selected>Gesamt</option></select></label><p id="sfPlanExportScopeHint" class="sf-plan-export-hint">Die Zuordnung erfolgt über „Standort / Zugehörigkeit“ im Mitarbeiterprofil. Gesamt enthält auch Mitarbeiter ohne Standortzuordnung. PDF im Format DIN A3 quer.</p><div class="sf-plan-export-summary" role="status"></div><div class="sf-plan-export-actions"><button type="button" class="ghost" data-close>Schließen</button><button type="button" class="ghost" data-format="xlsx">Excel herunterladen</button><button type="button" class="primary" data-format="pdf">PDF herunterladen</button></div><span class="sf-plan-export-status" role="status"></span>';document.body.append(dialog);dialog.querySelector('input').addEventListener('change',updateSummary);dialog.querySelector('#sfPlanExportScope').addEventListener('change',updateSummary);dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.querySelectorAll('[data-format]').forEach(b=>b.onclick=()=>download(b.dataset.format));dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault()})}
    latestPlan=null;dialog.querySelector('input').value=currentMonth();dialog.querySelector('#sfPlanExportScope').value='Gesamt';dialog.querySelector('.sf-plan-export-status').textContent='';updateSummary();if(!dialog.open)dialog.showModal();window.SFDateMonthFormat?.refresh(dialog);
  }
  function mount(){const head=document.querySelector('#view-schedule .page-head');if(!head||head.querySelector('.sf-schedule-export'))return;const actions=document.createElement('div');actions.className='sf-schedule-export-head-actions';[...head.children].filter(n=>n.tagName==='BUTTON').forEach(n=>actions.append(n));const button=document.createElement('button');button.type='button';button.className='ghost sf-schedule-export';button.textContent='Excel / PDF';button.setAttribute('aria-label','Gesamtdienstplan als Excel oder PDF exportieren');button.onclick=open;actions.append(button);head.append(actions)}
  window.SFScheduleExport={open,snapshot,freshSnapshot};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
  document.addEventListener('sf:schedule-period-changed',mount);
})();
