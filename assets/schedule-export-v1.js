// Gesamtdienstplan als echte XLSX-Datei oder PDF, ohne Schreibzugriffe auf Plandaten.
(function(){
  if(window.SFScheduleExport)return;
  const managers=new Set(['OWNER','ADMIN','PLANNER','DISPATCHER']),loading=new Map();let dialog=null,busy=false,latestPlan=null;
  function access(){const b=window.SFBackend;if(!b?.ready||!b.companyId||!managers.has(b.role))throw Error('Der Gesamtdienstplan kann nur mit aktiven Planungsrechten exportiert werden.');return b}
  function currentMonth(){const p=window.SchichtFunkCalendarView?.getPeriod?.();if(p?.mode==='month')return p.start.slice(0,7);const d=typeof weekStart!=='undefined'?weekStart:new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
  function snapshot(month,source={}){
    const b=access(),belongs=x=>!(x.companyId||x.company_id)||(x.companyId||x.company_id)===b.companyId;
    return window.SFScheduleExportCore.buildPlan({month,companyId:b.companyId,company:b.company?.name||document.querySelector('.company-card b')?.textContent||'Unternehmen',employees:(typeof employees!=='undefined'?employees:[]).filter(belongs),assignments:(typeof assignments!=='undefined'?assignments:[]).filter(belongs),absences:(typeof absences!=='undefined'?absences:[]).filter(belongs),sites:window.SFCompanyProfile?.current()?.sites||[],branding:window.SFCompanyProfile?.current()||null,types:typeof TYPES!=='undefined'?TYPES:[],typeById:typeof typeById==='function'?typeById:null,getSoll:typeof getSoll==='function'?getSoll:null,employeeMonthlyTarget:typeof employeeMonthlyTarget==='function'?employeeMonthlyTarget:null,...source});
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
    assertReady();const branding=await window.SFCompanyProfile?.exportProfile();assertReady();
    const [year,m]=month.split('-').map(Number),offset=14*60*60*1000;
    // Include all possible company timezones; buildPlan selects exact local dates.
    const from=new Date(Date.UTC(year,m-1,1)-offset).toISOString(),to=new Date(Date.UTC(year,m,1)+offset).toISOString();
    async function readRows(table,filter=q=>q,key='id'){
      const rows=[];let cursor=null;
      for(;;){
        let q=filter(b.client.from(table).select('*').eq('company_id',companyId));
        q=key==='daily'?q.order('work_date').order('shift_code').range(rows.length,rows.length+499):q.order(key).limit(500);
        if(cursor&&key!=='daily')q=q.gt(key,cursor);
        const result=await q;assertReady();if(result.error)throw result.error;
        if(!Array.isArray(result.data))throw Error('Die aktuellen Plandaten konnten nicht vollständig geladen werden.');
        rows.push(...result.data);if(result.data.length<500)return rows;
        cursor=result.data[result.data.length-1][key];
      }
    }
    const [co,staff,duties,off,templates,requirements,overrides]=await Promise.all([
      b.client.from('companies').select('name,timezone').eq('id',companyId).single(),
      readRows('employees'),readRows('shift_assignments',q=>q.neq('status','CANCELLED').gte('starts_at',from).lt('starts_at',to)),
      readRows('absences'),readRows('shift_templates'),readRows('global_staffing_requirements',q=>q,'shift_code'),
      readRows('daily_staffing_overrides',q=>q.gte('work_date',month+'-01').lt('work_date',String(year+(m===12?1:0))+'-'+String(m===12?1:m+1).padStart(2,'0')+'-01'),'daily')
    ]);
    assertReady();if(co.error)throw co.error;if(!co.data)throw Error('Das Unternehmen konnte nicht geladen werden.');
    const tz=co.data.timezone||'Europe/Berlin',ids=new Map(staff.map(e=>[e.id,String(e.legacy_id||e.id)]));
    const date=v=>new Intl.DateTimeFormat('sv-SE',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v));
    const time=v=>new Intl.DateTimeFormat('de-DE',{timeZone:tz,hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(v)).replace('24:','00:');
    const currentTypes=templates.sort((a,b)=>a.sort_order-b.sort_order||a.code.localeCompare(b.code)).map(t=>({id:t.code,siteId:t.site_id||null,name:t.name,start:t.default_start?.slice(0,5),end:t.default_end?.slice(0,5),active:t.active,planningMode:t.planning_mode,optionalWeekdays:t.optional_weekdays,strictWeekdays:t.strict_weekdays,coverageGroup:t.coverage_group,coverageRequired:Number(t.coverage_required)||0,morningOtMinimum:Number(t.morning_ot_switch_min)||0}));
    const currentAssignments=duties.map(a=>({id:a.id,employeeId:ids.get(a.employee_id)||a.employee_id,type:a.shift_code,date:date(a.starts_at),start:time(a.starts_at),end:time(a.ends_at),publishedAt:a.published_at}));
    const plan=snapshot(month,{
      company:co.data.name,branding:branding||null,sites:branding?.sites||[],
      employees:staff.filter(e=>!e.deleted_at||duties.some(a=>a.employee_id===e.id)).map(e=>({id:ids.get(e.id),first:e.first_name,last:e.last_name,personnelNo:e.personnel_no||'',status:e.deleted_at?'inactive':e.status,startDate:e.start_date,contractEnd:e.contract_end,weeklyHours:Number(e.weekly_hours||0),qualifications:e.qualifications||[],planningTeam:(e.qualifications||[]).find(q=>String(q).startsWith('__sp:planningTeam='))?.slice(18)||''})),
      assignments:currentAssignments,
      absences:off.map(a=>({employeeId:ids.get(a.employee_id)||a.employee_id,startDate:a.start_date,endDate:a.end_date,type:a.absence_type,status:a.status,fullDay:a.full_day})),
      types:currentTypes,
      getSoll:window.SFScheduleExportCore.staffingResolver(currentTypes,requirements,overrides,currentAssignments),
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
    function header(){doc.setFillColor(8,24,38);doc.roundedRect(10,9,width-20,29,2,2,'F');doc.setFont('helvetica','bold');doc.setTextColor(39,214,180);doc.setFontSize(16);if(plan.branding?.logo_data_url&&window.SFCompanyProfile?.drawLogo){window.SFCompanyProfile.drawLogo(doc,plan.branding.logo_data_url,16,13,48,18)}else doc.text('SchichtFunk',16,20);doc.setFontSize(7);doc.setTextColor(220,236,246);doc.text((plan.branding?.display_location||'Klar geplant. Stark besetzt.').slice(0,75),16,35,{maxWidth:105});doc.setFontSize(15);doc.setTextColor(255,255,255);doc.text((plan.pdfScope&&plan.pdfScope!=='Gesamt'?'Dienstplan '+plan.pdfScope:'Gesamtdienstplan')+' · '+plan.label,width-16,20,{align:'right'});doc.setFontSize(8);doc.text(plan.company+' · '+plan.status,width-16,29,{align:'right',maxWidth:width-125});doc.setTextColor(70,85,99);doc.setFont('helvetica','normal');doc.setFontSize(7);doc.text(plan.assignedEmployeeCount+' / '+plan.employeeCount+' Mitarbeiter eingeplant · '+plan.shiftCount+' Dienste · Plan-IST '+hours(plan.hours)+' h · Monats-SOLL '+hours(plan.targetHours)+' h · Differenz '+balance(plan.difference)+' h',10,44);doc.text((plan.scopeNote?plan.scopeNote+' ':'')+'Plan-IST = geplante Stunden ohne Pausenabzug. Differenz = Plan-IST minus Monats-SOLL. Keine IST-Zeiterfassung. Rot = offene Dienste (Anzahl). – = kein Wert hinterlegt.',10,49,{maxWidth:width-20})}
    const nameWidth=50,teamWidth=10,metricWidths=[12,19,19,19],dayWidth=(width-20-nameWidth-teamWidth-metricWidths.reduce((n,w)=>n+w,0))/plan.days.length;
    const styles={0:{cellWidth:nameWidth,halign:'left'},1:{cellWidth:teamWidth}};metricWidths.forEach((cellWidth,i)=>styles[plan.days.length+2+i]={cellWidth});
    plan.days.forEach((_,i)=>styles[i+2]={cellWidth:dayWidth});
    const openTypes=plan.types.filter(t=>plan.coverage.some(c=>c.type===t.id&&c.open>0));
    const openRows=openTypes.map(t=>{const own=plan.coverage.filter(c=>c.type===t.id),total=own.reduce((n,c)=>n+c.open,0);return ['Offen: '+t.id+'\n'+(t.start||'')+'-'+(t.end||''),'',...plan.days.map(d=>String(own.find(c=>c.date===d.date)?.open||'–')),total,hours(own.reduce((n,c)=>n+c.openHours,0)),'','']});
    doc.autoTable({startY:55,margin:{top:55,left:10,right:10,bottom:24},head:[['Mitarbeiter','Team',...plan.days.map(d=>String(d.day)+'\n'+d.weekday),'Dienste','Plan-IST\n(h)','SOLL\n(h)','Differenz\n(h)']],body:[...plan.rows.map(r=>[r.person.name+(r.person.personnelNo?'\n'+r.person.personnelNo:''),r.person.team,...r.cells.map(c=>c.pdf.replaceAll('FD-WE','FD-\nWE')),r.shiftCount,hours(r.hours),hours(r.targetHours),balance(r.difference)]),...openRows],styles:{font:'helvetica',fontSize:6.8,cellPadding:1.25,minCellHeight:6.5,halign:'center',valign:'middle',lineColor:[218,226,232],lineWidth:.15,overflow:'linebreak'},headStyles:{fillColor:[8,77,67],textColor:[255,255,255],fontStyle:'bold'},alternateRowStyles:{fillColor:[244,248,250]},columnStyles:styles,rowPageBreak:'avoid',didParseCell:data=>{if(data.section==='body'&&data.row.index>=plan.rows.length){const positive=Number(data.cell.raw)>0;data.cell.styles.fillColor=positive?[255,211,206]:[248,248,249];data.cell.styles.textColor=positive?[156,28,28]:[90,99,109];data.cell.styles.fontStyle=positive?'bold':'normal';if(data.column.index===0){data.cell.styles.fillColor=[156,28,28];data.cell.styles.textColor=[255,255,255];data.cell.styles.fontStyle='bold'}return}const color=plan.rows[data.row.index]?.color;if(data.section==='body'&&color&&data.column.index<2){data.cell.styles.fillColor=color.rgb;data.cell.styles.textColor=[35,40,45]}if(data.section==='body'&&data.column.index===plan.days.length+5){const diff=plan.rows[data.row.index]?.difference;if(diff!==null&&diff<0)data.cell.styles.textColor=[160,76,0];else if(diff>0)data.cell.styles.textColor=[0,92,100]}if(data.section==='body'&&data.column.index>=2&&data.column.index<plan.days.length+2&&plan.days[data.column.index-2].weekend)data.cell.styles.fillColor=[233,241,245]},didDrawPage:()=>{}});
    const tableOptions={margin:{top:55,left:10,right:10,bottom:24},styles:{font:'helvetica',fontSize:8,cellPadding:2,halign:'center',lineColor:[218,226,232],lineWidth:.15},headStyles:{fillColor:[8,77,67],textColor:[255,255,255]},columnStyles:{0:{halign:'left'}},rowPageBreak:'avoid',didDrawPage:()=>{}};
    const total=plan.objectTotals;
    if(total){
      doc.autoTable({...tableOptions,startY:doc.lastAutoTable.finalY+5,head:[['Gesamtobjekt - '+plan.label,'IST (geplant)','SOLL (benötigt)','Offen']],body:[['Objektstunden (h)',hours(plan.hours),hours(total.requiredHours),hours(total.openHours)],['Dienste (Anzahl)',String(plan.shiftCount),String(total.requiredDuties),String(total.openDuties)]],didParseCell:d=>{if(d.section==='body'&&d.column.index===3){d.cell.styles.fillColor=[255,235,231];d.cell.styles.textColor=[156,28,28];d.cell.styles.fontStyle='bold'}}});
      doc.addPage();
      doc.autoTable({...tableOptions,startY:55,head:[['Besetzung je Schicht','Dienste IST','Dienste SOLL','Dienste offen','Stunden IST','Stunden SOLL','Stunden offen']],body:plan.types.map(t=>{const own=plan.coverage.filter(c=>c.type===t.id),sum=k=>own.reduce((n,c)=>n+c[k],0);return [t.id+' '+(t.start||'')+'-'+(t.end||''),sum('actual'),sum('required'),sum('open'),hours(sum('actualHours')),hours(sum('requiredHours')),hours(sum('openHours'))]}),didParseCell:d=>{if(d.section==='body'&&[3,6].includes(d.column.index)&&Number(String(d.cell.raw).replace(',','.'))>0){d.cell.styles.fillColor=[255,235,231];d.cell.styles.textColor=[156,28,28];d.cell.styles.fontStyle='bold'}}});
      doc.setFontSize(7);doc.setTextColor(70,85,99);
      const noteY=doc.lastAutoTable.finalY+5;
      doc.text('Objekt-SOLL = benötigte Besetzung. Mitarbeiter-SOLL = persönliche Monatsziele (Summe '+hours(plan.targetHours)+' h).',10,noteY);
      doc.text('Offene Stunden werden je Datum und Schicht berechnet. Mehrbesetzung gleicht offene Dienste anderer Schichten nicht aus.',10,noteY+4);
      if(total.overstaffedDuties)doc.text('Zusätzlich über dem Besetzungsziel: '+total.overstaffedDuties+' Dienste.',10,noteY+8);
      const missing=plan.coverage.filter(c=>c.open>0);
      doc.autoTable({...tableOptions,startY:noteY+13,head:[['Offene Dienste - Datum','Schicht','Zeit','SOLL','IST','Offen','Fehlende Stunden']],body:missing.length?missing.map(c=>{const t=plan.types.find(t=>t.id===c.type);return [new Date(c.date+'T12:00:00').toLocaleDateString('de-DE'),c.type,(t?.start||'')+'-'+(t?.end||''),c.required,c.actual,c.open,hours(c.openHours)]}):[['Keine offenen Dienste','','','','',0,'0,00']],styles:{...tableOptions.styles,fontSize:7,cellPadding:.8},didParseCell:d=>{if(d.section==='body'&&[5,6].includes(d.column.index)){d.cell.styles.fillColor=[255,235,231];d.cell.styles.textColor=[156,28,28];d.cell.styles.fontStyle='bold'}}});
    }
    // Abweichende Uhrzeiten werden vollständig angegeben, statt die Monatsmatrix zu überladen.
    const adjusted=plan.details.filter(a=>a.adjusted);
    if(adjusted.length){doc.addPage();doc.autoTable({startY:55,margin:{top:55,left:10,right:10,bottom:24},head:[['Abweichende Zeiten (*)','Datum','Schicht','Beginn','Ende','Folgetag']],body:adjusted.map(a=>[a.person.name,a.date,a.type,a.start,a.end,a.overnight?'Ja':'Nein']),styles:{fontSize:9,cellPadding:2},headStyles:{fillColor:[8,77,67]},didDrawPage:()=>{}})}
    const pages=doc.getNumberOfPages(),legend=plan.types.map(t=>t.id+' '+(t.start||'')+'–'+(t.end||'')).join(' · ');
    for(let i=1;i<=pages;i++){doc.setPage(i);header();const h=doc.internal.pageSize.getHeight();doc.setFont('helvetica','normal');doc.setFontSize(6.5);doc.setTextColor(80,98,113);doc.text(legend,10,h-17,{maxWidth:width-20});doc.text('U Urlaub · K Krank · F Frei · FB Fortbildung · SP Sperrzeit · SU Sonderurlaub · AB Sonstiges · * abweichende Zeiten im Anhang',10,h-11);doc.text('Erstellt '+new Date(plan.createdAt).toLocaleString('de-DE')+' · '+plan.rows.length+' Mitarbeiter · '+plan.shiftCount+' Dienste · '+plan.hours.toLocaleString('de-DE')+' Planstunden',10,h-5);doc.text('Seite '+i+' / '+pages,width-10,h-5,{align:'right'})}
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
  function syncSiteOptions(){const select=dialog?.querySelector('#sfPlanExportScope');if(!select)return;const selected=select.value;select.querySelector('[data-company-sites]')?.remove();const sites=window.SFCompanyProfile?.current()?.sites||[];if(sites.length){const group=document.createElement('optgroup');group.label='Schichtstandorte';group.dataset.companySites='1';sites.forEach(s=>{const o=document.createElement('option');o.value='site:'+s.id;o.textContent=s.code+' – '+s.name+(s.is_active?'':' (archiviert)');group.append(o)});select.append(group)}select.value=[...select.options].some(o=>o.value===selected)?selected:'Gesamt'}
  function updateSummary(){
    const box=dialog.querySelector('.sf-plan-export-summary');
    try{
      const month=dialog.querySelector('input').value,full=latestPlan?.companyId===access().companyId&&latestPlan.plan.month===month?latestPlan.plan:snapshot(month),p=window.SFScheduleExportCore.selectPDFPlan(full,dialog.querySelector('#sfPlanExportScope').value);
      box.textContent='PDF · '+p.pdfScope+' · '+p.label+' · '+p.days.length+' Tage · '+p.rows.length+' Mitarbeiter · '+p.shiftCount+' Dienste · '+p.hours.toLocaleString('de-DE')+' Planstunden · Monats-SOLL '+hours(p.targetHours)+' h · Differenz '+balance(p.difference)+' h · '+p.assignedEmployeeCount+' Mitarbeiter eingeplant'+(p.objectTotals?' · Objekt-SOLL '+hours(p.objectTotals.requiredHours)+' h · '+p.objectTotals.openDuties+' offene Dienste / '+hours(p.objectTotals.openHours)+' h':'')+(!p.rows.length?' · Keine Mitarbeiter für diese Auswahl.':'');
      dialog.querySelector('[data-format="xlsx"]').disabled=false;dialog.querySelector('[data-format="pdf"]').disabled=!p.rows.length&&!access().client?.from;
    }catch(error){box.textContent=error.message;dialog.querySelectorAll('[data-format]').forEach(b=>b.disabled=true)}
  }
  function open(){
    try{access()}catch(error){window.showSaveToast?.('Export nicht verfügbar',error.message);return}
    if(!dialog){dialog=document.createElement('dialog');dialog.className='sf-plan-export-dialog';dialog.id='sfPlanExportDialog';dialog.setAttribute('aria-labelledby','sfPlanExportTitle');dialog.innerHTML='<h2 id="sfPlanExportTitle">Gesamtdienstplan exportieren</h2><p>Wähle für das PDF eine bestehende Mitarbeiterauswahl, Gesamt oder einen Unternehmensstandort. Schichtstandorte filtern die dort zugeordneten Schichtmodelle. Das Monats-SOLL bleibt das vollständige Vertragsziel. Alle Dienste der Mitarbeiter des gewählten Standorts werden aufgenommen, auch standortübergreifende Einsätze. Excel und PDF zeigen Dienste je Mitarbeiter, Plan-IST, Monats-SOLL und Differenz. Das Gesamt-PDF enthält zusätzlich Objektstunden IST/SOLL, die Besetzung und rot hervorgehobene offene Dienste.</p><label>Monat<input id="sfPlanExportMonth" type="month" required></label><label>PDF-Auswahl<select id="sfPlanExportScope" aria-describedby="sfPlanExportScopeHint"><option>Leipzig</option><option>Recklinghausen</option><option selected>Gesamt</option></select></label><p id="sfPlanExportScopeHint" class="sf-plan-export-hint">Die Zuordnung erfolgt über „Standort / Zugehörigkeit“ im Mitarbeiterprofil. Gesamt enthält auch Mitarbeiter ohne Standortzuordnung und die vollständige Objekt-Auswertung mit offenen Diensten. PDF im Format DIN A3 quer.</p><div class="sf-plan-export-summary" role="status"></div><div class="sf-plan-export-actions"><button type="button" class="ghost" data-close>Schließen</button><button type="button" class="ghost" data-format="xlsx">Excel herunterladen</button><button type="button" class="primary" data-format="pdf">PDF herunterladen</button></div><span class="sf-plan-export-status" role="status"></span>';document.body.append(dialog);dialog.querySelector('input').addEventListener('change',updateSummary);dialog.querySelector('#sfPlanExportScope').addEventListener('change',updateSummary);dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.querySelectorAll('[data-format]').forEach(b=>b.onclick=()=>download(b.dataset.format));dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault()})}
    latestPlan=null;syncSiteOptions();window.SFCompanyProfile?.load({force:true}).then(()=>{if(dialog.open&&!busy){syncSiteOptions();updateSummary()}}).catch(e=>{dialog.querySelector('.sf-plan-export-status').textContent=e.message});dialog.querySelector('input').value=currentMonth();dialog.querySelector('#sfPlanExportScope').value='Gesamt';dialog.querySelector('.sf-plan-export-status').textContent='';updateSummary();if(!dialog.open)dialog.showModal();window.SFDateMonthFormat?.refresh(dialog);
  }
  function mount(){const head=document.querySelector('#view-schedule .page-head');if(!head||head.querySelector('.sf-schedule-export'))return;const actions=document.createElement('div');actions.className='sf-schedule-export-head-actions';[...head.children].filter(n=>n.tagName==='BUTTON').forEach(n=>actions.append(n));const button=document.createElement('button');button.type='button';button.className='ghost sf-schedule-export';button.textContent='Excel / PDF';button.setAttribute('aria-label','Gesamtdienstplan als Excel oder PDF exportieren');button.onclick=open;actions.append(button);head.append(actions)}
  window.SFScheduleExport={open,snapshot,freshSnapshot};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
  document.addEventListener('sf:schedule-period-changed',mount);
})();

