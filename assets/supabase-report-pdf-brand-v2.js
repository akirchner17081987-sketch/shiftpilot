// SchichtFunk – PDF Branding V2
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.__reportPdfBrandV2)return;B.__reportPdfBrandV2=true;
  const MANAGER=new Set(['OWNER','ADMIN','DISPATCHER','PLANNER']);
  const monthValue=()=>document.getElementById('sfTaMonth')?.value||new Date().toISOString().slice(0,7);
  const monthDate=()=>monthValue()+'-01';
  const h=m=>(Number(m||0)/60).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2});
  const hs=m=>{const n=Number(m||0);return (n>0?'+':'')+h(n)};
  const dmy=v=>v?new Date(String(v).slice(0,10)+'T12:00:00').toLocaleDateString('de-DE'):'–';
  const stateName=s=>({DE:'Bundesweit','DE-BW':'Baden-Württemberg','DE-BY':'Bayern','DE-BE':'Berlin','DE-BB':'Brandenburg','DE-HB':'Bremen','DE-HH':'Hamburg','DE-HE':'Hessen','DE-MV':'Mecklenburg-Vorpommern','DE-NI':'Niedersachsen','DE-NW':'Nordrhein-Westfalen','DE-RP':'Rheinland-Pfalz','DE-SL':'Saarland','DE-SN':'Sachsen','DE-ST':'Sachsen-Anhalt','DE-SH':'Schleswig-Holstein','DE-TH':'Thüringen'}[s]||s||'Bundesweit');
  const safe=s=>String(s||'Export').replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,'_').slice(0,90);
  let logoDataUrl=null;

  function setStatus(t){const x=document.getElementById('sfExpStatus');if(x)x.textContent=t||''}
  function busy(on){document.querySelectorAll('.sf-exp-btn,.sf-exp-mini').forEach(b=>b.disabled=on)}
  function monthLabel(data){return new Date(String(data.month_start)+'T12:00:00').toLocaleDateString('de-DE',{month:'long',year:'numeric'})}
  function script(src,test){return new Promise((resolve,reject)=>{if(test())return resolve();const old=[...document.scripts].find(x=>x.src===src);if(old){if(test())return resolve();old.addEventListener('load',resolve,{once:true});old.addEventListener('error',reject,{once:true});return}const s=document.createElement('script');s.src=src;s.async=true;s.onload=resolve;s.onerror=()=>reject(new Error('PDF-Bibliothek konnte nicht geladen werden'));document.head.appendChild(s)})}
  async function needPdf(){await script('https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js',()=>!!window.jspdf?.jsPDF);await script('https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js',()=>!!window.jspdf?.jsPDF?.API?.autoTable)}
  async function bundle(employeeId=null){const q=await B.client.rpc('manager_time_report_bundle',{p_company_id:B.companyId,p_month:monthDate(),p_employee_id:employeeId||null});if(q.error)throw q.error;return typeof q.data==='string'?JSON.parse(q.data):q.data}

  async function loadLogo(){
    if(logoDataUrl)return logoDataUrl;
    try{
      const res=await fetch('assets/schichtfunk-logo.svg',{cache:'force-cache'});if(!res.ok)throw new Error('Logo konnte nicht geladen werden');
      const svg=await res.text();
      const blob=new Blob([svg],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob);
      const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=url});
      const canvas=document.createElement('canvas');canvas.width=1720;canvas.height=500;
      const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
      URL.revokeObjectURL(url);logoDataUrl=canvas.toDataURL('image/png');return logoDataUrl;
    }catch(e){console.warn('SchichtFunk-Logo konnte für PDF nicht gerendert werden',e);return null}
  }

  function drawHeader(doc,data,title,sub,logo){
    const pw=doc.internal.pageSize.getWidth();
    doc.setFillColor(247,250,252);doc.roundedRect(12,10,pw-24,30,3,3,'F');
    doc.setFillColor(39,214,180);doc.roundedRect(12,10,3,30,1.5,1.5,'F');
    if(logo){try{doc.addImage(logo,'PNG',18,14,43,12.5,undefined,'FAST')}catch(e){console.warn('PDF-Logo konnte nicht eingefügt werden',e)}}
    const tx=logo?67:20;
    doc.setTextColor(31,55,72);doc.setFont('helvetica','bold');doc.setFontSize(7);doc.text('MONATS- / STUNDENKONTO',tx,16);
    doc.setTextColor(12,31,45);doc.setFontSize(14);doc.text(title,tx,23);
    doc.setFont('helvetica','normal');doc.setFontSize(7.5);doc.setTextColor(94,112,126);doc.text(sub||data.company?.name||'',tx,29,{maxWidth:120});
    doc.setFont('helvetica','bold');doc.setFontSize(11);doc.setTextColor(12,31,45);doc.text(monthLabel(data),pw-18,18,{align:'right'});
    doc.setFont('helvetica','normal');doc.setFontSize(7.5);doc.setTextColor(94,112,126);doc.text(stateName(data.federal_state),pw-18,24,{align:'right'});
    doc.setFontSize(7);doc.text(data.company?.name||'',pw-18,30,{align:'right',maxWidth:65});
    doc.setDrawColor(39,214,180);doc.setLineWidth(.6);doc.line(18,36,pw-18,36);
    doc.setTextColor(0,0,0);
  }
  function footerAll(doc){const n=doc.getNumberOfPages();for(let i=1;i<=n;i++){doc.setPage(i);const pw=doc.internal.pageSize.getWidth(),ph=doc.internal.pageSize.getHeight();doc.setDrawColor(218,227,234);doc.setLineWidth(.25);doc.line(14,ph-11,pw-14,ph-11);doc.setFont('helvetica','normal');doc.setFontSize(6.5);doc.setTextColor(118,132,143);doc.text('SchichtFunk · Klar geplant. Stark besetzt.',14,ph-6.5);doc.text(`Vertraulich · Seite ${i} von ${n}`,pw-14,ph-6.5,{align:'right'});doc.setTextColor(0,0,0)}}
  function headerHook(doc,data,title,sub,logo){return()=>drawHeader(doc,data,title,sub,logo)}

  async function exportPdf(employeeId=null){
    busy(true);setStatus('PDF wird erstellt …');
    try{
      await needPdf();const [data,logo]=await Promise.all([bundle(employeeId),loadLogo()]);const emp=employeeId?(data.employees||[])[0]:null,{jsPDF}=window.jspdf;
      if(employeeId&&!emp)throw new Error('Mitarbeiter wurde nicht gefunden');
      const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true});
      doc.setProperties({title:employeeId?`SchichtFunk Monatsauswertung ${emp.employee_name}`:'SchichtFunk Gesamtauswertung Arbeitszeitkonten',subject:monthLabel(data),author:'SchichtFunk',creator:'SchichtFunk'});
      if(emp){
        const title='Mitarbeiter-Monatsauswertung',sub=`${emp.employee_name} · Personal-Nr. ${emp.personnel_no||'–'} · ${emp.weekly_hours||0} Std./Woche`;
        drawHeader(doc,data,title,sub,logo);
        const metrics=[['SOLL',h(emp.target_minutes)+' Std.'],['Arbeit',h(emp.confirmed_work_minutes)+' Std.'],['Abwesenheit',h(emp.absence_credit_minutes)+' Std.'],['IST gesamt',h(emp.credited_total_minutes)+' Std.'],['Monat +/-',hs(emp.month_balance_minutes)+' Std.'],['Überstundenkonto',hs(emp.account_balance_minutes)+' Std.'],['Feiertagsabzug',h(emp.holiday_minutes)+' Std.'],['Offen',String(emp.pending_entries||0)]];
        doc.autoTable({startY:44,margin:{left:14,right:14,top:42,bottom:15},head:[metrics.map(x=>x[0])],body:[metrics.map(x=>x[1])],styles:{fontSize:7,cellPadding:2.2,textColor:[30,49,63]},headStyles:{fillColor:[21,55,70],textColor:[240,250,249]},bodyStyles:{fillColor:[249,251,252]},theme:'grid'});
        const det=(data.details||[]).map(r=>[dmy(r.work_date),r.shift_codes||'–',r.planned_times||'–',h(r.target_minutes),r.actual_times||'–',h(r.confirmed_actual_minutes),r.absence_types||'–',r.holiday_name||'–',hs(r.day_balance_minutes)]);
        doc.autoTable({startY:(doc.lastAutoTable?.finalY||58)+5,margin:{left:14,right:14,top:42,bottom:15},head:[['Datum','Schicht','Geplant','SOLL','Tatsächlich','IST','Abwesenheit','Feiertag','Tag +/-']],body:det,styles:{fontSize:6.2,cellPadding:1.55,textColor:[35,52,65],lineColor:[224,231,236],lineWidth:.15},headStyles:{fillColor:[17,42,58],textColor:[238,248,247]},alternateRowStyles:{fillColor:[248,250,251]},columnStyles:{0:{cellWidth:20},1:{cellWidth:22},2:{cellWidth:28},3:{cellWidth:18},4:{cellWidth:28},5:{cellWidth:18},6:{cellWidth:31},7:{cellWidth:33},8:{cellWidth:20}},didDrawPage:headerHook(doc,data,title,sub,logo)});
        const y=(doc.lastAutoTable?.finalY||180)+5;if(y<doc.internal.pageSize.getHeight()-16){doc.setFontSize(6.8);doc.setTextColor(91,108,121);doc.text('Hinweis: Bestätigte Ist-Zeiten, genehmigte Zeitgutschriften und gesetzliche Feiertage werden gemäß den Stundenkonto-Einstellungen berücksichtigt.',14,y,{maxWidth:260});doc.setTextColor(0,0,0)}
      }else{
        const title='Gesamtauswertung Arbeitszeitkonten',sub=`${data.employees?.length||0} Mitarbeiter · Monatsübersicht`;
        drawHeader(doc,data,title,sub,logo);
        const body=(data.employees||[]).map(r=>[r.employee_name,r.personnel_no||'–',`${r.weekly_hours||0}`,h(r.target_minutes),h(r.confirmed_work_minutes),h(r.absence_credit_minutes),h(r.credited_total_minutes),hs(r.month_balance_minutes),hs(r.account_balance_minutes),String(r.pending_entries||0)]);
        const sums=(data.employees||[]).reduce((a,r)=>{a.t+=Number(r.target_minutes||0);a.w+=Number(r.confirmed_work_minutes||0);a.a+=Number(r.absence_credit_minutes||0);a.i+=Number(r.credited_total_minutes||0);a.m+=Number(r.month_balance_minutes||0);a.k+=Number(r.account_balance_minutes||0);a.p+=Number(r.pending_entries||0);return a},{t:0,w:0,a:0,i:0,m:0,k:0,p:0});
        body.push(['GESAMT','','',h(sums.t),h(sums.w),h(sums.a),h(sums.i),hs(sums.m),hs(sums.k),String(sums.p)]);
        doc.autoTable({startY:44,margin:{left:14,right:14,top:42,bottom:15},head:[['Mitarbeiter','Pers.-Nr.','Std./W.','SOLL','Arbeit','Abwes.','IST','Monat +/-','Konto','Offen']],body,styles:{fontSize:6.6,cellPadding:1.85,textColor:[35,52,65],lineColor:[224,231,236],lineWidth:.15},headStyles:{fillColor:[17,42,58],textColor:[238,248,247]},alternateRowStyles:{fillColor:[248,250,251]},didParseCell:d=>{if(d.row.index===body.length-1){d.cell.styles.fontStyle='bold';d.cell.styles.fillColor=[233,248,244]}},didDrawPage:headerHook(doc,data,title,sub,logo)});
        const hol=(data.holidays||[]).map(x=>`${dmy(x.date)} ${x.name}`).join(' · ')||'Keine Feiertage in diesem Monat.';const y=(doc.lastAutoTable?.finalY||160)+5;if(y<doc.internal.pageSize.getHeight()-16){doc.setFontSize(6.8);doc.setTextColor(91,108,121);doc.text('Feiertage: '+hol,14,y,{maxWidth:265});doc.setTextColor(0,0,0)}
      }
      footerAll(doc);doc.save(safe(`SchichtFunk_${employeeId?emp?.employee_name:'Gesamtauswertung'}_${monthValue()}`)+'.pdf');setStatus('PDF erstellt ✓');
    }catch(e){console.error(e);setStatus('PDF-Export fehlgeschlagen');alert('PDF-Export fehlgeschlagen: '+(e?.message||e))}finally{busy(false)}
  }

  function employeeIdForButton(btn){
    if(btn.id==='sfExpEmpPdf')return document.getElementById('sfExpEmployee')?.value||'';
    if(btn.id==='sfExpAllPdf')return null;
    const tr=btn.closest('tr');return tr?.querySelector('[data-opening]')?.dataset.opening||'';
  }
  document.addEventListener('click',e=>{
    if(!MANAGER.has(B.role))return;
    const btn=e.target.closest('button');if(!btn)return;
    const isMain=btn.id==='sfExpEmpPdf'||btn.id==='sfExpAllPdf';
    const isMini=btn.classList.contains('sf-exp-mini')&&btn.textContent.trim().toUpperCase()==='PDF';
    if(!isMain&&!isMini)return;
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
    const employeeId=employeeIdForButton(btn);if(btn.id==='sfExpEmpPdf'&&!employeeId){alert('Bitte zuerst einen Mitarbeiter auswählen.');return}
    exportPdf(employeeId||null);
  },true);
})();