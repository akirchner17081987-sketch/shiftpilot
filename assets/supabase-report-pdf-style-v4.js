// SchichtFunk – PDF Styling V4 · kompakte Folgeseiten
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.__reportPdfStyleV4)return; B.__reportPdfStyleV4=true;
  const MANAGER=new Set(['OWNER','ADMIN','DISPATCHER','PLANNER']);
  const monthValue=()=>document.getElementById('sfTaMonth')?.value||new Date().toISOString().slice(0,7);
  const monthDate=()=>monthValue()+'-01';
  const h=m=>(Number(m||0)/60).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2});
  const hs=m=>{const n=Number(m||0);return (n>0?'+':'')+h(n)};
  const dmy=v=>v?new Date(String(v).slice(0,10)+'T12:00:00').toLocaleDateString('de-DE'):'–';
  const safe=s=>String(s||'Export').replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,'_').slice(0,90);
  const stateName=s=>({DE:'Bundesweit','DE-BW':'Baden-Württemberg','DE-BY':'Bayern','DE-BE':'Berlin','DE-BB':'Brandenburg','DE-HB':'Bremen','DE-HH':'Hamburg','DE-HE':'Hessen','DE-MV':'Mecklenburg-Vorpommern','DE-NI':'Niedersachsen','DE-NW':'Nordrhein-Westfalen','DE-RP':'Rheinland-Pfalz','DE-SL':'Saarland','DE-SN':'Sachsen','DE-ST':'Sachsen-Anhalt','DE-SH':'Schleswig-Holstein','DE-TH':'Thüringen'}[s]||s||'Bundesweit');
  let logoData=null;

  const setStatus=t=>{const el=document.getElementById('sfExpStatus');if(el)el.textContent=t||''};
  const busy=on=>document.querySelectorAll('.sf-exp-btn,.sf-exp-mini').forEach(b=>b.disabled=on);
  const monthLabel=data=>new Date(String(data.month_start)+'T12:00:00').toLocaleDateString('de-DE',{month:'long',year:'numeric'});
  const isWeekend=v=>{const d=new Date(String(v).slice(0,10)+'T12:00:00').getDay();return d===0||d===6};
  const balanceColor=n=>Number(n||0)<0?[190,62,72]:Number(n||0)>0?[18,139,112]:[35,52,65];

  function script(src,test){return new Promise((resolve,reject)=>{if(test())return resolve();const old=[...document.scripts].find(x=>x.src===src);if(old){if(test())return resolve();old.addEventListener('load',resolve,{once:true});old.addEventListener('error',reject,{once:true});return}const s=document.createElement('script');s.src=src;s.async=true;s.onload=resolve;s.onerror=()=>reject(new Error('PDF-Bibliothek konnte nicht geladen werden'));document.head.appendChild(s)})}
  async function needPdf(){await script('https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js',()=>!!window.jspdf?.jsPDF);await script('https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js',()=>!!window.jspdf?.jsPDF?.API?.autoTable)}
  async function bundle(employeeId=null){const q=await B.client.rpc('manager_time_report_bundle',{p_company_id:B.companyId,p_month:monthDate(),p_employee_id:employeeId||null});if(q.error)throw q.error;return typeof q.data==='string'?JSON.parse(q.data):q.data}
  async function loadLogo(){if(logoData)return logoData;try{const r=await fetch('assets/schichtfunk-logo.svg',{cache:'force-cache'});if(!r.ok)throw new Error('Logo nicht erreichbar');const svg=await r.text(),blob=new Blob([svg],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob);const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=url});const c=document.createElement('canvas');c.width=1720;c.height=500;const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(url);logoData=c.toDataURL('image/png');return logoData}catch(e){console.warn('SchichtFunk PDF-Logo',e);return null}}

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

  function drawCompactHeader(doc,data,title,sub,logo){
    const pw=doc.internal.pageSize.getWidth();
    doc.setFillColor(8,24,38);doc.roundedRect(12,7,pw-24,17,2.2,2.2,'F');
    doc.setFillColor(39,214,180);doc.roundedRect(12,7,2.4,17,1.2,1.2,'F');
    if(logo){try{doc.addImage(logo,'PNG',18,10,29,8.4,undefined,'FAST')}catch(e){}}
    doc.setFont('helvetica','bold');doc.setFontSize(8.8);doc.setTextColor(247,251,253);doc.text(title,53,13.3);
    doc.setFont('helvetica','normal');doc.setFontSize(6.3);doc.setTextColor(166,188,203);doc.text(sub||'',53,18.3,{maxWidth:150});
    doc.setFont('helvetica','bold');doc.setFontSize(8.2);doc.setTextColor(247,251,253);doc.text(monthLabel(data),pw-18,13.2,{align:'right'});
    doc.setFont('helvetica','normal');doc.setFontSize(6.1);doc.setTextColor(128,151,168);doc.text(stateName(data.federal_state),pw-18,18.3,{align:'right'});
    doc.setDrawColor(39,214,180);doc.setLineWidth(.45);doc.line(18,22,pw-18,22);doc.setTextColor(0,0,0);
  }

  function footer(doc){const n=doc.getNumberOfPages();for(let i=1;i<=n;i++){doc.setPage(i);const pw=doc.internal.pageSize.getWidth(),ph=doc.internal.pageSize.getHeight();doc.setDrawColor(218,226,232);doc.setLineWidth(.25);doc.line(14,ph-11,pw-14,ph-11);doc.setTextColor(112,128,140);doc.setFont('helvetica','normal');doc.setFontSize(6.6);doc.text('SchichtFunk · Klar geplant. Stark besetzt.',14,ph-6.2);doc.text(`Vertraulich · Seite ${i} von ${n}`,pw-14,ph-6.2,{align:'right'});doc.setTextColor(0,0,0)}}

  async function exportPdf(employeeId=null){
    busy(true);setStatus('PDF wird erstellt …');
    try{
      await needPdf();const [data,logo]=await Promise.all([bundle(employeeId),loadLogo()]);const emp=employeeId?(data.employees||[])[0]:null,{jsPDF}=window.jspdf;if(employeeId&&!emp)throw new Error('Mitarbeiter wurde nicht gefunden');
      const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true});
      if(emp){
        const title='Mitarbeiter-Monatsauswertung',sub=`${emp.employee_name} · Personal-Nr. ${emp.personnel_no||'–'} · ${emp.weekly_hours||0} Std./Woche`;
        drawHeader(doc,data,title,sub,logo);
        const metrics=[['SOLL',h(emp.target_minutes)+' Std.'],['Arbeit',h(emp.confirmed_work_minutes)+' Std.'],['Abwesenheit',h(emp.absence_credit_minutes)+' Std.'],['IST gesamt',h(emp.credited_total_minutes)+' Std.'],['Monat +/-',hs(emp.month_balance_minutes)+' Std.'],['Überstundenkonto',hs(emp.account_balance_minutes)+' Std.'],['Feiertagsabzug',h(emp.holiday_minutes)+' Std.'],['Offen',String(emp.pending_entries||0)]];
        doc.autoTable({startY:44,margin:{left:14,right:14,top:28,bottom:15},tableWidth:269,head:[metrics.map(x=>x[0])],body:[metrics.map(x=>x[1])],theme:'grid',styles:{fontSize:7,cellPadding:2,textColor:[31,49,62],lineColor:[222,229,234],lineWidth:.15},headStyles:{fillColor:[17,42,58],textColor:[239,249,248]},bodyStyles:{fillColor:[249,251,252]},didParseCell:d=>{if(d.section==='body'&&(d.column.index===4||d.column.index===5)){const n=d.column.index===4?emp.month_balance_minutes:emp.account_balance_minutes;d.cell.styles.textColor=balanceColor(n);d.cell.styles.fontStyle='bold'}}});
        const raw=(data.details||[]),det=raw.map(r=>[dmy(r.work_date),r.shift_codes||'–',r.planned_times||'–',h(r.target_minutes),r.actual_times||'–',h(r.confirmed_actual_minutes),r.absence_types||'–',r.holiday_name||'–',hs(r.day_balance_minutes)]);
        doc.autoTable({startY:(doc.lastAutoTable?.finalY||58)+4,margin:{left:14,right:14,top:28,bottom:15},tableWidth:269,head:[['Datum','Schicht','Geplant','SOLL','Tatsächlich','IST','Abwesenheit','Feiertag','Tag +/-']],body:det,theme:'plain',styles:{fontSize:6.15,cellPadding:1.35,minCellHeight:3.9,textColor:[35,52,65],lineColor:[225,232,236],lineWidth:.1,overflow:'linebreak'},headStyles:{fillColor:[17,42,58],textColor:[239,249,248],fontStyle:'bold'},columnStyles:{0:{cellWidth:22},1:{cellWidth:26},2:{cellWidth:34},3:{cellWidth:20},4:{cellWidth:34},5:{cellWidth:20},6:{cellWidth:38},7:{cellWidth:50},8:{cellWidth:25}},didParseCell:d=>{if(d.section!=='body')return;const r=raw[d.row.index];if(!r)return;if(isWeekend(r.work_date))d.cell.styles.fillColor=[239,243,246];else if(d.row.index%2===1)d.cell.styles.fillColor=[248,250,251];else d.cell.styles.fillColor=[255,255,255];if(d.column.index===8){d.cell.styles.textColor=balanceColor(r.day_balance_minutes);if(Number(r.day_balance_minutes||0)!==0)d.cell.styles.fontStyle='bold'}},didDrawPage:hook=>{if(hook.pageNumber>1)drawCompactHeader(doc,data,title,sub,logo)}});
      }else{
        const title='Gesamtauswertung Arbeitszeitkonten',sub=`${data.employees?.length||0} Mitarbeiter · Monatsübersicht`;
        drawHeader(doc,data,title,sub,logo);
        const rows=data.employees||[];const body=rows.map(r=>[r.employee_name,r.personnel_no||'–',`${r.weekly_hours||0}`,h(r.target_minutes),h(r.confirmed_work_minutes),h(r.absence_credit_minutes),h(r.credited_total_minutes),hs(r.month_balance_minutes),hs(r.account_balance_minutes),String(r.pending_entries||0)]);
        const s=rows.reduce((a,r)=>{a.t+=Number(r.target_minutes||0);a.w+=Number(r.confirmed_work_minutes||0);a.a+=Number(r.absence_credit_minutes||0);a.i+=Number(r.credited_total_minutes||0);a.m+=Number(r.month_balance_minutes||0);a.k+=Number(r.account_balance_minutes||0);a.p+=Number(r.pending_entries||0);return a},{t:0,w:0,a:0,i:0,m:0,k:0,p:0});body.push(['GESAMT','','',h(s.t),h(s.w),h(s.a),h(s.i),hs(s.m),hs(s.k),String(s.p)]);
        doc.autoTable({startY:44,margin:{left:14,right:14,top:28,bottom:15},tableWidth:269,head:[['Mitarbeiter','Pers.-Nr.','Std./W.','SOLL','Arbeit','Abwes.','IST','Monat +/-','Konto','Offen']],body,theme:'striped',styles:{fontSize:6.6,cellPadding:1.75,textColor:[35,52,65],lineColor:[226,232,236],lineWidth:.1},headStyles:{fillColor:[17,42,58],textColor:[239,249,248]},alternateRowStyles:{fillColor:[247,249,250]},didParseCell:d=>{if(d.section!=='body')return;const total=d.row.index===body.length-1;if(total){d.cell.styles.fontStyle='bold';d.cell.styles.fillColor=[228,247,242]}if(d.column.index===7||d.column.index===8){const src=total?(d.column.index===7?s.m:s.k):(d.column.index===7?rows[d.row.index]?.month_balance_minutes:rows[d.row.index]?.account_balance_minutes);d.cell.styles.textColor=balanceColor(src);if(Number(src||0)!==0)d.cell.styles.fontStyle='bold'}},didDrawPage:hook=>{if(hook.pageNumber>1)drawCompactHeader(doc,data,title,sub,logo)}});
      }
      footer(doc);doc.save(safe(`SchichtFunk_${employeeId?emp?.employee_name:'Gesamtauswertung'}_${monthValue()}`)+'.pdf');setStatus('PDF erstellt ✓');
    }catch(e){console.error(e);setStatus('PDF-Export fehlgeschlagen');alert('PDF-Export fehlgeschlagen: '+(e?.message||e))}finally{busy(false)}
  }

  function employeeIdFromButton(btn){if(btn.id==='sfExpEmpPdf')return document.getElementById('sfExpEmployee')?.value||'';if(btn.id==='sfExpAllPdf')return null;return btn.closest('tr')?.querySelector('[data-opening]')?.dataset.opening||''}
  document.addEventListener('click',e=>{if(!MANAGER.has(B.role))return;const btn=e.target.closest('button');if(!btn)return;const main=btn.id==='sfExpEmpPdf'||btn.id==='sfExpAllPdf';const mini=btn.classList.contains('sf-exp-mini')&&btn.textContent.trim().toUpperCase()==='PDF';if(!main&&!mini)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();const id=employeeIdFromButton(btn);if(btn.id==='sfExpEmpPdf'&&!id){alert('Bitte zuerst einen Mitarbeiter auswählen.');return}exportPdf(id||null)},true);
})();