Warning: truncated output (original token count: 7661)
Total output lines: 142

// SchichtFunk Compliance V2 - UI
(function(){
  const C=window.SFCompliance;if(!C)return;

  // Gesetzliche Referenzwerte f�r die Planer-Info; keine tariflichen Ausnahmen.
  C.arbzgRules=Object.freeze({
    version:'2026-10-09',dailyStandardHours:8,dailyMaximumHours:10,
    averageCalendarMonths:6,averageWeeks:24,nightAverageCalendarMonths:1,nightAverageWeeks:4,
    breakAfterSixMinutes:30,breakAfterNineMinutes:45,minimumBreakPartMinutes:15,
    maximumContinuousHours:6,minimumRestHours:11,weeklyAverageHours:48,weeklyTemporaryHours:60,
    legalBasis:'�� 3-6 ArbZG',sourceUrl:'https://www.gesetze-im-internet.de/arbzg/',
    example:Object.freeze({start:'18:00',end:'04:00',breakStart:'23:30',breakEnd:'00:15',paidHours:10,breakMinutes:45,workingMinutes:555,nextStart:'15:00'})
  });
  C.arbzgInfoHtml=()=>{
    const r=C.arbzgRules,law=(section,label)=>`<a href="https://www.gesetze-im-internet.de/arbzg/__${section}.html" target="_blank" rel="noopener noreferrer">${label}</a>`;
    return `<section class="sf-arbzg-info" aria-labelledby="sfArbzgTitle">
      <div class="eyebrow">PLANER-INFO � ARBEITSZEITGESETZ</div>
      <h3 id="sfArbzgTitle">10-Stunden-Schichten: Grenzwerte & Ausgleich</h3>
      <p>Eine Schicht mit genau ${r.dailyMaximumHours} Stunden Arbeitszeit ist nicht automatisch ein Versto�. Sie ist nur mit dem erforderlichen Ausgleich sowie ausreichenden Pausen und Ruhezeiten zul�ssig. Die folgenden Standardwerte gelten ohne besondere gesetzliche oder tarifliche Ausnahme.</p>
      <div class="sf-arbzg-table-wrap"><table class="sf-arbzg-table"><caption>Gesetzliche Standardgrenzen nach ${r.legalBasis}</caption><thead><tr><th scope="col">Pr�fung</th><th scope="col">Grenzwert / Bedingung</th><th scope="col">Rechtsgrundlage</th></tr></thead><tbody>
        <tr><th scope="row">T�gliche Arbeitszeit</th><td>Grunds�tzlich ${r.dailyStandardHours} Stunden; verl�ngerbar auf maximal <strong>${r.dailyMaximumHours} Stunden ohne echte Ruhepausen</strong>.</…6661 tokens truncated…play:inline-flex;margin-top:12px"><input type="checkbox" id="sfWorksCouncil" ${C.policy.worksCouncilEnabled?'checked':''}> Betriebsrat vorhanden / Freigabeworkflow aktiv</label><div class="sf-legal-note">24/48 Stunden sind hier <b>Unternehmensregeln</b>, keine allgemeine gesetzliche �nderungsfrist. Arbeit auf Abruf wird separat mit der Vier-Tage-Pr�fung gekennzeichnet.</div><div class="form-actions"><button class="primary" onclick="switchView('audit')">Audit-Logs �ffnen</button><button class="ghost" onclick="spOpenComplianceCenter()">Schicht�nderungen �ffnen</button><button class="ghost" onclick="spSaveComplianceSettings()">Pr�fregeln speichern</button></div>`
  };
  window.spSaveComplianceSettings=()=>{C.policy.shortNoticeHours=Math.max(1,Number(document.getElementById('sfShortHours')?.value||48));C.policy.criticalNoticeHours=Math.max(1,Number(document.getElementById('sfCriticalHours')?.value||24));C.policy.employeeConfirmationUnderHours=Math.max(0,Number(document.getElementById('sfApprovalHours')?.value||24));C.policy.worksCouncilEnabled=!!document.getElementById('sfWorksCouncil')?.checked;C.persist();C.audit('COMPLIANCE_POLICY_UPDATED',null,{...C.policy});C.toast('Compliance-Einstellungen gespeichert','Betriebliche Schwellen und Freigaben wurden aktualisiert.')};
  if(typeof window.renderSettings==='function'){const base=window.renderSettings;window.renderSettings=function(){const r=base.apply(this,arguments);C.renderComplianceSettings();return r}}

  injectStyles();installEmployeeWorkModel();C.updateScheduleControls();C.decorateAssignments();if(document.getElementById('view-settings')?.classList.contains('active'))C.renderComplianceSettings();
  document.addEventListener('click',e=>{const v=e.target.closest('[data-view]')?.dataset.view;if(v==='schedule')setTimeout(()=>{C.updateScheduleControls();C.decorateAssignments()},0);if(v==='settings')setTimeout(C.renderComplianceSettings,0);if(v==='employees')setTimeout(installEmployeeWorkModel,0)});
})();


