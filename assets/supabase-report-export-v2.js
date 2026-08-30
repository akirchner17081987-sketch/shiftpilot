// SchichtFunk – Excel/PDF Monatsauswertungen V2
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.__reportExportV2)return; B.__reportExportV2=true;
  const MANAGER=new Set(['OWNER','ADMIN','DISPATCHER','PLANNER']);
  const monthValue=()=>document.getElementById('sfTaMonth')?.value||new Date().toISOString().slice(0,7);
  const monthDate=()=>monthValue()+'-01';
  const h=m=>(Number(m||0)/60).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2});
  const hs=m=>{const n=Number(m||0);return (n>0?'+':'')+h(n)};
  const dmy=v=>v?new Date(String(v).slice(0,10)+'T12:00:00').toLocaleDateString('de-DE'):'–';
  const safe=s=>String(s||'Export').replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,'_').slice(0,90);
  const stateName=s=>({DE:'Bundesweit','DE-BW':'Baden-Württemberg','DE-BY':'Bayern','DE-BE':'Berlin','DE-BB':'Brandenburg','DE-HB':'Bremen','DE-HH':'Hamburg','DE-HE':'Hessen','DE-MV':'Mecklenburg-Vorpommern','DE-NI':'Niedersachsen','DE-NW':'Nordrhein-Westfalen','DE-RP':'Rheinland-Pfalz','DE-SL':'Saarland','DE-SN':'Sachsen','DE-ST':'Sachsen-Anhalt','DE-SH':'Schleswig-Holstein','DE-TH':'Thüringen'}[s]||s||'Bundesweit');
  let cache={key:'',data:null},logoData=null;

  function setStatus(t){const el=document.getElementById('sfExpStatus');if(el)el.textContent=t||''}
  function busy(on){document.querySelectorAll('.sf-exp-btn,.sf-exp-mini').forEach(b=>b.disabled=on)}
  function monthLabel(data){return new Date(String(data.month_start)+'T12:00:00').toLocaleDateString('de-DE',{month:'long',year:'numeric'})}
  function script(src,test){return new Promise((resolve,reject)=>{if(test())return resolve();const old=[...document.scripts].find(x=>x.src===src);if(old){old.addEventListener('load',resolve,{once:true});old.addEventListener('error',reject,{once:true});return}const s=document.createElement('script');s.src=src;s.async=true;s.onload=resolve;s.onerror=()=>reject(new Error('Export-Bibliothek konnte nicht geladen werden'));document.head.appendChild(s)})}
  async function needXlsx(){await script('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',()=>!!window.XLSX)}
  async function needPdf(){await script('https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js',()=>!!window.jspdf?.jsPDF);await script('https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js',()=>!!window.jspdf?.jsPDF?.API?.autoTable)}
  async function bundle(employeeId=null,force=false){const key=[B.companyId,monthValue(),employeeId||'ALL'].join('|');if(!force&&cache.key===key&&cache.data)return cache.data;const q=await B.client.rpc('manager_time_report_bundle',{p_company_id:B.companyId,p_month:monthDate(),p_employee_id:employeeId||null});if(q.error)throw q.error;const data=typeof q.data==='string'?JSON.parse(q.data):q.data;cache={key,data};return data}

  async function loadLogo(){
    if(logoData)return logoData;
    try{
      const r=await fetch('assets/schichtfunk-logo.svg',{cache:'force-cache'}); if(!r.ok)throw new Error('Logo nicht erreichbar');
      const svg=await r.text(),blob=new Blob([svg],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob);
      const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=url});
      const c=document.createElement('canvas');c.width=1720;c.height=500;const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(url);
      logoData=c.toDataURL('image/png');return logoData;
    }catch(e){console.warn('SchichtFunk PDF-Logo',e);return null}
  }

  function drawHeader(doc,data,title,sub,logo){
    const pw=doc.internal.pageSize.getWidth();
    doc.setFillColor(8,24,38);doc.roundedRect(12,9,pw-24,31,3,3,'F');
    doc.setFillColor(39,214,180);doc.roundedRect(12,9,3.2,31,1.6,1.6,'F');
    if(logo){try{doc.addImage(logo,'PNG',18,14,51.5,15,undefined,'FAST')}catch(e){console.warn('Logo in PDF',e)}}
    const tx=75;
    doc.setTextColor(59,225,196);doc.setFont('helvetica','bold');doc.setFontSize(6.8);doc.text('MONATS- / STUNDENKONTO',tx,15.5);
    doc.setTextColor(247,251,253);doc.setFontSize(13.5);doc.text(title,tx,23);
    doc.setTextColor(174,194,209);doc.setFont('helvetica','normal');doc.setFontSize(7.2);doc.text(sub||'',tx,29,{maxWidth:125});
    doc.setTextColor(247,251,253);doc.setFont('helvetica','bold');doc.setFontSize(11);doc.text(monthLabel(data),pw-18,17.5,{align:'right'});
    doc.setTextColor(132,154,171);doc.setFont('helvetica','normal');doc.setFontSize(7.2);doc.text(stateName(data.federal_state),pw-18,24,{align:'right'});doc.text(data.company?.name||'',pw-18,30,{align:'right',maxWidth:66});
    doc.setDrawColor(39,214,180);doc.setLineWidth(.7);doc.line(18,37,pw-18,37);doc.setTextColor(0,0,0);
  }
  function footer(doc){const n=doc.getNumberOfPages();for(let i=1;i<=n;i++){doc.setPage(i);const pw=doc.internal.pageSize.getWidth(),ph=doc.internal.pageSize.getHeight();doc.setDrawColor(218,226,232);doc.setLineWidth(.25);doc.line(14,ph-11,pw-14,ph-11);doc.setTextColor(112,128,140);doc.setFont('helvetica','normal');doc.setFontSize(6.6);doc.text('SchichtFunk · Klar geplant. Stark besetzt.',14,ph-6.2);doc.text(`Vertraulich · Seite ${i} von ${n}`,pw-14,ph-6.2,{align:'right'});doc.setTextColor(0,0,0)}}

  function overviewRows(data){return (data.employees||[]).map(r=>({'Mitarbeiter':r.employee_name,'Personal-Nr.':r.personnel_no||'','Beschäftigung':r.employment||'','Wochenstunden':Number(r.weekly_hours||0),'SOLL Std.':Number((Number(r.target_minutes||0)/60).toFixed(2)),'Arbeit Std.':Number((Number(r.confirmed_work_minutes||0)/60).toFixed(2)),'Abwesenheit Std.':Number((Number(r.absence_credit_minutes||0)/60).toFixed(2)),'IST gesamt Std.':Number((Number(r.credited_total_minutes||0)/60).toFixed(2)),'Monat +/- Std.':Number((Number(r.month_balance_minutes||0)/60).toFixed(2)),'Überstundenkonto Std.':Number((Number(r.account_balance_minutes||0)/60).toFixed(2)),'Feiertagsabzug Std.':Number((Number(r.holiday_minutes||0)/60).toFixed(2)),'Offen zur Prüfung':Number(r.pending_entries||0)}))}
  function detailRows(data,employeeId=null){return (data.details||[]).filter(r=>!employeeId||r.employee_id===employeeId).map(r=>({'Mitarbeiter':r.employee_name,'Personal-Nr.':r.personnel_no||'','Datum':dmy(r.work_date),'Schicht':r.shift_codes||'','Geplant':r.planned_times||'','SOLL Std.':Number((Number(r.target_minutes||0)/60).toFixed(2)),'Tatsächlich':r.actual_times||'','IST Std.':Number((Number(r.confirmed_actual_minutes||0)/60).toFixed(2)),'Abwesenheit':r.absence_types||'','Abwesenheit Std.':Number((Number(r.absence_credit_minutes||0)/60).toFixed(2)),'Feiertag':r.holiday_name||'','Zeitstatus':r.time_statuses||'','Tag +/- Std.':Number((Number(r.day_balance_minutes||0)/60).toFixed(2))}))}
  function styleSheet(ws,widths){ws['!cols']=widths.map(w=>({wch:w}));ws['!freeze']={xSplit:0,ySplit:1}}

  async function exportExcel(employeeId=null){
    busy(true);setStatus('Excel wird erstellt …');
    try{await needXlsx();const data=await bundle(employeeId,true),emp=employeeId?(data.employees||[])[0]:null,wb=XLSX.utils.book_new();
      const meta=[['SchichtFunk – Monats-/Stundenkonto'],['Unternehmen',data.company?.name||''],['Monat',monthLabel(data)],['Bundesland',stateName(data.federal_state)],['Mitarbeiter',emp?.employee_name||'Gesamtauswertung'],['Personal-Nr.',emp?.personnel_no||'']];
      const ws0=XLSX.utils.aoa_to_sheet(meta);styleSheet(ws0,[30,35]);XLSX.utils.book_append_sheet(wb,ws0,'Monatsinfo');
      const ws1=XLSX.utils.json_to_sheet(overviewRows(data));styleSheet(ws1,[28,14,16,14,14,14,18,16,16,22,20,17]);XLSX.utils.book_append_sheet(wb,ws1,employeeId?'Übersicht':'Mitarbeiter');
      const ws2=XLSX.utils.json_to_sheet(detailRows(data,employeeId));styleSheet(ws2,[25,14,12,14,18,12,18,12,18,16,26,16,14]);XLSX.utils.book_append_sheet(wb,ws2,'Tagesdetails');
      const ws3=XLSX.utils.json_to_sheet((data.holidays||[]).map(x=>({Datum:dmy(x.date),Feiertag:x.name})));styleSheet(ws3,[14,34]);XLSX.utils.book_append_sheet(wb,ws3,'Feiertage');
      XLSX.writeFile(wb,safe(`SchichtFunk_${employeeId?emp?.employee_name:'Gesamtauswertung'}_${monthValue()}`)+'.xlsx',{compression:true});setStatus('Excel erstellt ✓');
    }catch(e){console.error(e);setStatus('Excel-Export fehlgeschlagen');alert('Excel-Export fehlgeschlagen: '+(e?.message||e))}finally{busy(false)}
  }

  async function exportPdf(employeeId=null){
    busy(true);setStatus('PDF wird erstellt …');
    try{
      await needPdf();const [data,logo]=await Promise.all([bundle(employeeId,true),loadLogo()]);const emp=employeeId?(data.employees||[])[0]:null,{jsPDF}=window.jspdf;if(employeeId&&!emp)throw new Error('Mitarbeiter wurde nicht gefunden');
      const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true});
      if(emp){
        const title='Mitarbeiter-Monatsauswertung',sub=`${emp.employee_name} · Personal-Nr. ${emp.personnel_no||'–'} · ${emp.weekly_hours||0} Std./Woche`;drawHeader(doc,data,title,sub,logo);
        const metrics=[['SOLL',h(emp.target_minutes)+' Std.'],['Arbeit',h(emp.confirmed_work_minutes)+' Std.'],['Abwesenheit',h(emp.absence_credit_minutes)+' Std.'],['IST gesamt',h(emp.credited_total_minutes)+' Std.'],['Monat +/-',hs(emp.month_balance_minutes)+' Std.'],['Überstundenkonto',hs(emp.account_balance_minutes)+' Std.'],['Feiertagsabzug',h(emp.holiday_minutes)+' Std.'],['Offen',String(emp.pending_entries||0)]];
        doc.autoTable({startY:44,margin:{left:14,right:14,top:43,bottom:15},head:[metrics.map(x=>x[0])],body:[metrics.map(x=>x[1])],theme:'grid',styles:{fontSize:7,cellPadding:2,textColor:[31,49,62],lineColor:[222,229,234],lineWidth:.15},headStyles:{fillColor:[17,42,58],textColor:[239,249,248]},bodyStyles:{fillColor:[249,251,252]}});
        const det=(data.details||[]).map(r=>[dmy(r.work_date),r.shift_codes||'–',r.planned_times||'–',h(r.target_minutes),r.actual_times||'–',h(r.confirmed_actual_minutes),r.absence_types||'–',r.holiday_name||'–',hs(r.day_balance_minutes)]);
        doc.autoTable({startY:(doc.lastAutoTable?.finalY||58)+4,margin:{left:14,right:14,top:43,bottom:15},head:[['Datum','Schicht','Geplant','SOLL','Tatsächlich','IST','Abwesenheit','Feiertag','Tag +/-']],body:det,theme:'striped',styles:{fontSize:6.1,cellPadding:1.35,minCellHeight:3.9,textColor:[35,52,65],lineColor:[228,233,237],lineWidth:.1},headStyles:{fillColor:[17,42,58],textColor:[239,249,248],fontStyle:'bold'},alternateRowStyles:{fillColor:[247,249,250]},columnStyles:{0:{cellWidth:20},1:{cellWidth:22},2:{cellWidth:28},3:{cellWidth:18},4:{cellWidth:28},5:{cellWidth:18},6:{cellWidth:31},7:{cellWidth:33},8:{cellWidth:20}},didDrawPage:()=>drawHeader(doc,data,title,sub,logo)});
      }else{
        const title='Gesamtauswertung Arbeitszeitkonten',sub=`${data.employees?.length||0} Mitarbeiter · Monatsübersicht`;drawHeader(doc,data,title,sub,logo);
        const body=(data.employees||[]).map(r=>[r.employee_name,r.personnel_no||'–',`${r.weekly_hours||0}`,h(r.target_minutes),h(r.confirmed_work_minutes),h(r.absence_credit_minutes),h(r.credited_total_minutes),hs(r.month_balance_minutes),hs(r.account_balance_minutes),String(r.pending_entries||0)]);
        const s=(data.employees||[]).reduce((a,r)=>{a.t+=Number(r.target_minutes||0);a.w+=Number(r.confirmed_work_minutes||0);a.a+=Number(r.absence_credit_minutes||0);a.i+=Number(r.credited_total_minutes||0);a.m+=Number(r.month_balance_minutes||0);a.k+=Number(r.account_balance_minutes||0);a.p+=Number(r.pending_entries||0);return a},{t:0,w:0,a:0,i:0,m:0,k:0,p:0});body.push(['GESAMT','','',h(s.t),h(s.w),h(s.a),h(s.i),hs(s.m),hs(s.k),String(s.p)]);
        doc.autoTable({startY:44,margin:{left:14,right:14,top:43,bottom:15},head:[['Mitarbeiter','Pers.-Nr.','Std./W.','SOLL','Arbeit','Abwes.','IST','Monat +/-','Konto','Offen']],body,theme:'striped',styles:{fontSize:6.6,cellPadding:1.75,textColor:[35,52,65],lineColor:[226,232,236],lineWidth:.1},headStyles:{fillColor:[17,42,58],textColor:[239,249,248]},alternateRowStyles:{fillColor:[247,249,250]},didParseCell:d=>{if(d.row.index===body.length-1){d.cell.styles.fontStyle='bold';d.cell.styles.fillColor=[228,247,242]}},didDrawPage:()=>drawHeader(doc,data,title,sub,logo)});
      }
      footer(doc);doc.save(safe(`SchichtFunk_${employeeId?emp?.employee_name:'Gesamtauswertung'}_${monthValue()}`)+'.pdf');setStatus('PDF erstellt ✓');
    }catch(e){console.error(e);setStatus('PDF-Export fehlgeschlagen');alert('PDF-Export fehlgeschlagen: '+(e?.message||e))}finally{busy(false)}
  }

  function css(){if(document.getElementById('sfReportExportCssV2'))return;const s=document.createElement('style');s.id='sfReportExportCssV2';s.textContent='.sf-exp-bar{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin:0 0 12px;padding:10px 12px;border:1px solid #274158;background:#0a1826;border-radius:10px}.sf-exp-bar b{font-size:11px;color:#dceaf5}.sf-exp-bar small{display:block;color:#7f96aa;font-size:9px;margin-top:2px}.sf-exp-spacer{flex:1}.sf-exp-select{min-width:210px;max-width:280px;background:#081624;border:1px solid #2d465d;color:#e8f3fc;border-radius:8px;padding:8px 10px}.sf-exp-btn{border:1px solid #2d4b63;background:#102131;color:#c4d6e3;border-radius:8px;padding:8px 10px;font-size:10px;font-weight:800}.sf-exp-btn.primary{border-color:#2bd8b6;background:#17392f;color:#8ff0d7}.sf-exp-btn[disabled],.sf-exp-mini[disabled]{opacity:.45}.sf-exp-row{display:flex;gap:5px;margin-top:5px}.sf-exp-mini{border:1px solid #2a4358;background:#0c1a27;color:#9eb4c5;border-radius:6px;padding:4px 6px;font-size:8px}.sf-exp-status{min-width:120px;color:#82a0b4;font-size:9px;text-align:right}';document.head.appendChild(s)}
  async function fillSelect(){const el=document.getElementById('sfExpEmployee');if(!el)return;try{const data=await bundle(null),old=el.value;el.innerHTML='<option value="">Mitarbeiter auswählen …</option>'+(data.employees||[]).map(x=>`<option value="${x.employee_id}">${x.employee_name}${x.personnel_no?' · '+x.personnel_no:''}</option>`).join('');if([...el.options].some(o=>o.value===old))el.value=old}catch(e){console.warn('Export-Mitarbeiterliste',e)}}
  function ensure(){
    if(!MANAGER.has(B.role)||!B.client||!B.companyId)return;css();const host=document.getElementById('sfTimeAccounts');if(!host)return;
    let bar=document.getElementById('sfReportExport');if(!bar){bar=document.createElement('div');bar.id='sfReportExport';bar.className='sf-exp-bar';bar.innerHTML='<div><b>📄 Excel / PDF Auswertung</b><small>Einzelmitarbeiter oder komplette Monatsübersicht exportieren.</small></div><span class="sf-exp-spacer"></span><select id="sfExpEmployee" class="sf-exp-select"><option value="">Mitarbeiter auswählen …</option></select><button class="sf-exp-btn" id="sfExpEmpXlsx">Excel Mitarbeiter</button><button class="sf-exp-btn" id="sfExpEmpPdf">PDF Mitarbeiter</button><button class="sf-exp-btn primary" id="sfExpAllXlsx">Excel Gesamt</button><button class="sf-exp-btn primary" id="sfExpAllPdf">PDF Gesamt</button><span class="sf-exp-status" id="sfExpStatus"></span>';const ref=document.getElementById('sfHolidayPanel')||document.getElementById('sfTaSummary');ref?.insertAdjacentElement('beforebegin',bar);fillSelect();}
    const emp=()=>document.getElementById('sfExpEmployee')?.value||'';
    bar.querySelector('#sfExpEmpXlsx').onclick=()=>emp()?exportExcel(emp()):alert('Bitte zuerst einen Mitarbeiter auswählen.');bar.querySelector('#sfExpEmpPdf').onclick=()=>emp()?exportPdf(emp()):alert('Bitte zuerst einen Mitarbeiter auswählen.');bar.querySelector('#sfExpAllXlsx').onclick=()=>exportExcel(null);bar.querySelector('#sfExpAllPdf').onclick=()=>exportPdf(null);
    document.querySelectorAll('#sfTaBody tr').forEach(tr=>{if(tr.querySelector('.sf-exp-row'))return;const id=tr.querySelector('[data-opening]')?.dataset.opening;if(!id)return;const cell=tr.lastElementChild;if(!cell)return;const x=document.createElement('div');x.className='sf-exp-row';x.innerHTML='<button type="button" class="sf-exp-mini">XLSX</button><button type="button" class="sf-exp-mini">PDF</button>';const [a,b]=x.querySelectorAll('button');a.onclick=()=>exportExcel(id);b.onclick=()=>exportPdf(id);cell.appendChild(x)})
  }
  document.addEventListener('click',e=>{if(e.target.closest('[data-view="reports"]'))setTimeout(ensure,500)},true);
  document.addEventListener('change',e=>{if(e.target?.id==='sfTaMonth'){cache={key:'',data:null};setTimeout(()=>{ensure();fillSelect()},450)}},true);
  const mo=new MutationObserver(()=>{if(document.getElementById('sfTimeAccounts'))ensure()});mo.observe(document.documentElement,{subtree:true,childList:true});setTimeout(ensure,2200);
})();