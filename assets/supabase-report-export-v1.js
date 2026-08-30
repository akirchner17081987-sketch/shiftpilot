// SchichtFunk – Excel/PDF Monatsauswertungen V1
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.__reportExportV1)return;B.__reportExportV1=true;
  const MANAGER=new Set(['OWNER','ADMIN','DISPATCHER','PLANNER']);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const monthValue=()=>document.getElementById('sfTaMonth')?.value||new Date().toISOString().slice(0,7);
  const monthDate=()=>monthValue()+'-01';
  const h=m=>(Number(m||0)/60).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2});
  const hs=m=>{const n=Number(m||0);return (n>0?'+':'')+h(n)};
  const dmy=v=>v?new Date(String(v).slice(0,10)+'T12:00:00').toLocaleDateString('de-DE'):'–';
  const stateName=s=>({DE:'Bundesweit','DE-BW':'Baden-Württemberg','DE-BY':'Bayern','DE-BE':'Berlin','DE-BB':'Brandenburg','DE-HB':'Bremen','DE-HH':'Hamburg','DE-HE':'Hessen','DE-MV':'Mecklenburg-Vorpommern','DE-NI':'Niedersachsen','DE-NW':'Nordrhein-Westfalen','DE-RP':'Rheinland-Pfalz','DE-SL':'Saarland','DE-SN':'Sachsen','DE-ST':'Sachsen-Anhalt','DE-SH':'Schleswig-Holstein','DE-TH':'Thüringen'}[s]||s||'Bundesweit');
  const safe=s=>String(s||'Export').replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,'_').slice(0,90);
  let cache={key:'',bundle:null};

  function css(){
    if(document.getElementById('sfReportExportCss'))return;
    const s=document.createElement('style');s.id='sfReportExportCss';s.textContent=`
      .sf-exp-bar{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin:0 0 12px;padding:10px 12px;border:1px solid #274158;background:#0a1826;border-radius:10px}.sf-exp-bar b{font-size:11px;color:#dceaf5}.sf-exp-bar small{display:block;color:#7f96aa;font-size:9px;margin-top:2px}.sf-exp-spacer{flex:1}.sf-exp-select{min-width:210px;max-width:280px;background:#081624;border:1px solid #2d465d;color:#e8f3fc;border-radius:8px;padding:8px 10px}.sf-exp-btn{border:1px solid #2d4b63;background:#102131;color:#c4d6e3;border-radius:8px;padding:8px 10px;font-size:10px;font-weight:800}.sf-exp-btn:hover{border-color:#39d8ba;color:#eafff9}.sf-exp-btn.primary{border-color:#2bd8b6;background:#17392f;color:#8ff0d7}.sf-exp-btn[disabled]{opacity:.45;cursor:wait}.sf-exp-row{display:flex;gap:5px;margin-top:5px}.sf-exp-mini{border:1px solid #2a4358;background:#0c1a27;color:#9eb4c5;border-radius:6px;padding:4px 6px;font-size:8px}.sf-exp-status{min-width:120px;color:#82a0b4;font-size:9px;text-align:right}
      @media(max-width:900px){.sf-exp-spacer{display:none}.sf-exp-select{width:100%;max-width:none}.sf-exp-status{text-align:left}}
    `;document.head.appendChild(s);
  }
  function script(src,test){return new Promise((resolve,reject)=>{if(test())return resolve();const old=[...document.scripts].find(x=>x.src===src);if(old){old.addEventListener('load',resolve,{once:true});old.addEventListener('error',reject,{once:true});return}const s=document.createElement('script');s.src=src;s.async=true;s.onload=resolve;s.onerror=()=>reject(new Error('Export-Bibliothek konnte nicht geladen werden'));document.head.appendChild(s)})}
  async function needXlsx(){await script('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',()=>!!window.XLSX)}
  async function needPdf(){await script('https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js',()=>!!window.jspdf?.jsPDF);await script('https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js',()=>!!window.jspdf?.jsPDF?.API?.autoTable)}
  async function bundle(employeeId=null,force=false){
    const key=[B.companyId,monthValue(),employeeId||'ALL'].join('|');
    if(!force&&cache.key===key&&cache.bundle)return cache.bundle;
    const q=await B.client.rpc('manager_time_report_bundle',{p_company_id:B.companyId,p_month:monthDate(),p_employee_id:employeeId||null});
    if(q.error)throw q.error;const data=typeof q.data==='string'?JSON.parse(q.data):q.data;cache={key,bundle:data};return data;
  }
  function currentRows(){
    const body=document.getElementById('sfTaBody');if(!body)return[];
    return [...body.querySelectorAll('tr')].map(tr=>({name:tr.querySelector('.sf-ta-name b')?.textContent?.trim()||'',personnel:(tr.querySelector('.sf-ta-name small')?.textContent||'').split('·')[0].trim(),id:tr.querySelector('[data-opening]')?.dataset.opening||''})).filter(x=>x.name);
  }
  async function allEmployees(){
    const data=await bundle(null);return (data.employees||[]).map(x=>({id:x.employee_id,name:x.employee_name,personnel:x.personnel_no||''}));
  }
  function setStatus(t){const x=document.getElementById('sfExpStatus');if(x)x.textContent=t||''}
  function busy(on){document.querySelectorAll('.sf-exp-btn,.sf-exp-mini').forEach(b=>b.disabled=on)}
  function monthLabel(data){return new Date(String(data.month_start)+'T12:00:00').toLocaleDateString('de-DE',{month:'long',year:'numeric'})}
  function overviewRows(data){return (data.employees||[]).map(r=>({
    'Mitarbeiter':r.employee_name,'Personal-Nr.':r.personnel_no||'','Beschäftigung':r.employment||'','Wochenstunden':Number(r.weekly_hours||0),
    'SOLL Std.':Number(h(r.target_minutes).replace(',','.')),'Bestätigte Arbeit Std.':Number(h(r.confirmed_work_minutes).replace(',','.')),
    'Abwesenheit Std.':Number(h(r.absence_credit_minutes).replace(',','.')),'IST gesamt Std.':Number(h(r.credited_total_minutes).replace(',','.')),
    'Monat +/- Std.':Number(h(r.month_balance_minutes).replace(',','.')),'Überstundenkonto Std.':Number(h(r.account_balance_minutes).replace(',','.')),
    'Feiertagsabzug Std.':Number(h(r.holiday_minutes).replace(',','.')),'Offen zur Prüfung':Number(r.pending_entries||0)
  }))}
  function detailRows(data,employeeId=null){return (data.details||[]).filter(r=>!employeeId||r.employee_id===employeeId).map(r=>({
    'Mitarbeiter':r.employee_name,'Personal-Nr.':r.personnel_no||'','Datum':dmy(r.work_date),'Wochentag':new Date(String(r.work_date)+'T12:00:00').toLocaleDateString('de-DE',{weekday:'short'}),
    'SOLL Std.':Number(h(r.target_minutes).replace(',','.')),'Schicht':r.shift_codes||'','Geplant':r.planned_times||'','Plan-Pause Min.':Number(r.planned_break_minutes||0),'Plan netto Std.':Number(h(r.planned_net_minutes).replace(',','.')),
    'Tatsächlich':r.actual_times||'','IST-Pause Min.':Number(r.actual_break_minutes||0),'Bestätigt netto Std.':Number(h(r.confirmed_actual_minutes).replace(',','.')),
    'Abwesenheit':r.absence_types||'','Abwesenheit Std.':Number(h(r.absence_credit_minutes).replace(',','.')),'Feiertag':r.holiday_name||'','Zeitstatus':r.time_statuses||'',
    'Tag +/- Std.':Number(h(r.day_balance_minutes).replace(',','.'))
  }))}
  function styleSheet(ws,widths){ws['!cols']=widths.map(w=>({wch:w}));ws['!freeze']={xSplit:0,ySplit:1}}
  function addMetaSheet(wb,data,employee=null){
    const rows=[['SchichtFunk – Monats-/Stundenkonto'],['Unternehmen',data.company?.name||''],['Monat',monthLabel(data)],['Bundesland',stateName(data.federal_state)],['Mitarbeiter',employee?.employee_name||'Gesamtauswertung'],['Personal-Nr.',employee?.personnel_no||''],[],['Kennzahl','Wert']];
    if(employee){rows.push(['Wochenstunden',employee.weekly_hours],['SOLL Std.',h(employee.target_minutes)],['Bestätigte Arbeit Std.',h(employee.confirmed_work_minutes)],['Abwesenheit Std.',h(employee.absence_credit_minutes)],['IST gesamt Std.',h(employee.credited_total_minutes)],['Monat +/- Std.',hs(employee.month_balance_minutes)],['Überstundenkonto Std.',hs(employee.account_balance_minutes)],['Feiertagsabzug Std.',h(employee.holiday_minutes)],['Offen zur Prüfung',employee.pending_entries||0])}
    else{const s=(data.employees||[]).reduce((a,r)=>{a.target+=Number(r.target_minutes||0);a.actual+=Number(r.credited_total_minutes||0);a.balance+=Number(r.month_balance_minutes||0);a.account+=Number(r.account_balance_minutes||0);return a},{target:0,actual:0,balance:0,account:0});rows.push(['Mitarbeiter',data.employees?.length||0],['SOLL gesamt Std.',h(s.target)],['IST gesamt Std.',h(s.actual)],['Monatssaldo gesamt Std.',hs(s.balance)],['Überstundenkonten gesamt Std.',hs(s.account)])}
    const ws=XLSX.utils.aoa_to_sheet(rows);styleSheet(ws,[28,34]);XLSX.utils.book_append_sheet(wb,ws,'Monatsinfo')
  }
  async function exportExcel(employeeId=null){
    busy(true);setStatus('Excel wird erstellt …');try{await needXlsx();const data=await bundle(employeeId,true),emp=employeeId?(data.employees||[])[0]:null,wb=XLSX.utils.book_new();addMetaSheet(wb,data,emp);
      const ov=XLSX.utils.json_to_sheet(overviewRows(data));styleSheet(ov,[28,14,16,14,14,20,18,16,16,22,20,17]);XLSX.utils.book_append_sheet(wb,ov,employeeId?'Übersicht':'Mitarbeiter');
      const dr=XLSX.utils.json_to_sheet(detailRows(data,employeeId));styleSheet(dr,[25,14,12,11,11,15,17,15,16,17,15,19,18,16,22,18,14]);XLSX.utils.book_append_sheet(wb,dr,'Tagesdetails');
      const hol=XLSX.utils.json_to_sheet((data.holidays||[]).map(x=>({Datum:dmy(x.date),Feiertag:x.name})));styleSheet(hol,[14,30]);XLSX.utils.book_append_sheet(wb,hol,'Feiertage');
      XLSX.writeFile(wb,safe(`SchichtFunk_${employeeId?emp?.employee_name:'Gesamtauswertung'}_${monthValue()}`)+'.xlsx',{compression:true});setStatus('Excel erstellt ✓')
    }catch(e){console.error(e);setStatus('Excel-Export fehlgeschlagen');alert('Excel-Export fehlgeschlagen: '+(e?.message||e))}finally{busy(false)}}
  function pdfHeader(doc,data,title,sub){doc.setFont('helvetica','bold');doc.setFontSize(16);doc.text('SchichtFunk',14,14);doc.setFontSize(12);doc.text(title,14,22);doc.setFont('helvetica','normal');doc.setFontSize(8);doc.text(`${data.company?.name||''} · ${monthLabel(data)} · ${stateName(data.federal_state)}`,14,28);if(sub)doc.text(sub,14,33)}
  function pdfFooter(doc){const n=doc.getNumberOfPages();for(let i=1;i<=n;i++){doc.setPage(i);doc.setFontSize(7);doc.setTextColor(110);doc.text(`Seite ${i} von ${n}`,doc.internal.pageSize.getWidth()-28,doc.internal.pageSize.getHeight()-7);doc.text('Erstellt mit SchichtFunk',14,doc.internal.pageSize.getHeight()-7);doc.setTextColor(0)}}
  async function exportPdf(employeeId=null){
    busy(true);setStatus('PDF wird erstellt …');try{await needPdf();const data=await bundle(employeeId,true),emp=employeeId?(data.employees||[])[0]:null,{jsPDF}=window.jspdf,doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
      if(emp){pdfHeader(doc,data,'Mitarbeiter-Monatsauswertung',`${emp.employee_name} · Personal-Nr. ${emp.personnel_no||'–'} · ${emp.weekly_hours||0} Std./Woche`);
        const metrics=[['SOLL',h(emp.target_minutes)+' Std.'],['Arbeit',h(emp.confirmed_work_minutes)+' Std.'],['Abwesenheit',h(emp.absence_credit_minutes)+' Std.'],['IST gesamt',h(emp.credited_total_minutes)+' Std.'],['Monat +/-',hs(emp.month_balance_minutes)+' Std.'],['Überstundenkonto',hs(emp.account_balance_minutes)+' Std.'],['Feiertagsabzug',h(emp.holiday_minutes)+' Std.'],['Offen',String(emp.pending_entries||0)]];
        doc.autoTable({startY:38,head:[metrics.map(x=>x[0])],body:[metrics.map(x=>x[1])],styles:{fontSize:7,cellPadding:2},headStyles:{fillColor:[25,49,65]}});
        const det=(data.details||[]).map(r=>[dmy(r.work_date),r.shift_codes||'–',r.planned_times||'–',h(r.target_minutes),r.actual_times||'–',h(r.confirmed_actual_minutes),r.absence_types||'–',r.holiday_name||'–',hs(r.day_balance_minutes)]);
        doc.autoTable({startY:(doc.lastAutoTable?.finalY||52)+5,head:[['Datum','Schicht','Geplant','SOLL','Tatsächlich','IST','Abwesenheit','Feiertag','Tag +/-']],body:det,styles:{fontSize:6,cellPadding:1.5},headStyles:{fillColor:[20,42,58]},columnStyles:{0:{cellWidth:20},1:{cellWidth:22},2:{cellWidth:27},3:{cellWidth:18},4:{cellWidth:27},5:{cellWidth:18},6:{cellWidth:30},7:{cellWidth:32},8:{cellWidth:20}}});
        const notes=`Bestätigte Ist-Zeiten zählen ins Stundenkonto. Genehmigte Zeitgutschriften und gesetzliche Feiertage werden gemäß den SchichtFunk-Kontoeinstellungen berücksichtigt.`;const y=(doc.lastAutoTable?.finalY||180)+5;if(y<doc.internal.pageSize.getHeight()-15){doc.setFontSize(7);doc.text(notes,14,y,{maxWidth:260})}
      }else{pdfHeader(doc,data,'Gesamtauswertung Arbeitszeitkonten',`${data.employees?.length||0} Mitarbeiter`);const body=(data.employees||[]).map(r=>[r.employee_name,r.personnel_no||'–',`${r.weekly_hours||0}`,h(r.target_minutes),h(r.confirmed_work_minutes),h(r.absence_credit_minutes),h(r.credited_total_minutes),hs(r.month_balance_minutes),hs(r.account_balance_minutes),String(r.pending_entries||0)]);const sums=(data.employees||[]).reduce((a,r)=>{a.t+=Number(r.target_minutes||0);a.w+=Number(r.confirmed_work_minutes||0);a.a+=Number(r.absence_credit_minutes||0);a.i+=Number(r.credited_total_minutes||0);a.m+=Number(r.month_balance_minutes||0);a.k+=Number(r.account_balance_minutes||0);a.p+=Number(r.pending_entries||0);return a},{t:0,w:0,a:0,i:0,m:0,k:0,p:0});body.push(['GESAMT','','',h(sums.t),h(sums.w),h(sums.a),h(sums.i),hs(sums.m),hs(sums.k),String(sums.p)]);doc.autoTable({startY:36,head:[['Mitarbeiter','Pers.-Nr.','Std./W.','SOLL','Arbeit','Abwes.','IST','Monat +/-','Konto','Offen']],body,styles:{fontSize:6.5,cellPadding:1.7},headStyles:{fillColor:[20,42,58]},didParseCell:d=>{if(d.row.index===body.length-1)d.cell.styles.fontStyle='bold'}});const hol=(data.holidays||[]).map(x=>`${dmy(x.date)} ${x.name}`).join(' · ')||'Keine Feiertage in diesem Monat.';const y=(doc.lastAutoTable?.finalY||160)+5;if(y<doc.internal.pageSize.getHeight()-12){doc.setFontSize(7);doc.text('Feiertage: '+hol,14,y,{maxWidth:265})}}
      pdfFooter(doc);doc.save(safe(`SchichtFunk_${employeeId?emp?.employee_name:'Gesamtauswertung'}_${monthValue()}`)+'.pdf');setStatus('PDF erstellt ✓')
    }catch(e){console.error(e);setStatus('PDF-Export fehlgeschlagen');alert('PDF-Export fehlgeschlagen: '+(e?.message||e))}finally{busy(false)}}
  async function fillSelect(){const s=document.getElementById('sfExpEmployee');if(!s)return;try{const list=await allEmployees(),old=s.value;s.innerHTML='<option value="">Mitarbeiter auswählen …</option>'+list.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}${x.personnel?' · '+esc(x.personnel):''}</option>`).join('');if(list.some(x=>x.id===old))s.value=old}catch(e){console.warn('Export-Mitarbeiterliste',e)}}
  function selectedEmployee(){return document.getElementById('sfExpEmployee')?.value||''}
  function ensure(){
    if(!MANAGER.has(B.role)||!B.client||!B.companyId)return;css();const host=document.getElementById('sfTimeAccounts');if(!host)return;let bar=document.getElementById('sfReportExport');if(!bar){bar=document.createElement('div');bar.id='sfReportExport';bar.className='sf-exp-bar';bar.innerHTML=`<div><b>📄 Excel / PDF Auswertung</b><small>Einzelmitarbeiter oder komplette Monatsübersicht exportieren.</small></div><span class="sf-exp-spacer"></span><select id="sfExpEmployee" class="sf-exp-select"><option value="">Mitarbeiter auswählen …</option></select><button class="sf-exp-btn" id="sfExpEmpXlsx">Excel Mitarbeiter</button><button class="sf-exp-btn" id="sfExpEmpPdf">PDF Mitarbeiter</button><button class="sf-exp-btn primary" id="sfExpAllXlsx">Excel Gesamt</button><button class="sf-exp-btn primary" id="sfExpAllPdf">PDF Gesamt</button><span class="sf-exp-status" id="sfExpStatus"></span>`;const hol=document.getElementById('sfHolidayPanel'),sum=document.getElementById('sfTaSummary');(hol||sum)?.insertAdjacentElement('beforebegin',bar);bar.querySelector('#sfExpEmpXlsx').onclick=()=>{const id=selectedEmployee();if(!id)return alert('Bitte zuerst einen Mitarbeiter auswählen.');exportExcel(id)};bar.querySelector('#sfExpEmpPdf').onclick=()=>{const id=selectedEmployee();if(!id)return alert('Bitte zuerst einen Mitarbeiter auswählen.');exportPdf(id)};bar.querySelector('#sfExpAllXlsx').onclick=()=>exportExcel(null);bar.querySelector('#sfExpAllPdf').onclick=()=>exportPdf(null);fillSelect()}
    const rows=currentRows();document.querySelectorAll('#sfTaBody tr').forEach((tr,i)=>{if(tr.querySelector('.sf-exp-row'))return;const id=rows[i]?.id;if(!id)return;const cell=tr.lastElementChild;if(!cell)return;const x=document.createElement('div');x.className='sf-exp-row';x.innerHTML=`<button type="button" class="sf-exp-mini">XLSX</button><button type="button" class="sf-exp-mini">PDF</button>`;const [a,b]=x.querySelectorAll('button');a.onclick=()=>exportExcel(id);b.onclick=()=>exportPdf(id);cell.appendChild(x)})
  }
  document.addEventListener('click',e=>{if(e.target.closest('[data-view="reports"]'))setTimeout(()=>{cache={key:'',bundle:null};ensure()},500)},true);
  document.addEventListener('change',e=>{if(e.target?.id==='sfTaMonth'){cache={key:'',bundle:null};setTimeout(()=>{ensure();fillSelect()},450)}},true);
  const mo=new MutationObserver(()=>{if(document.getElementById('sfTimeAccounts'))ensure()});mo.observe(document.documentElement,{subtree:true,childList:true});
  setTimeout(ensure,2200);
})();