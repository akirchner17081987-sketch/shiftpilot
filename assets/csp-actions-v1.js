// External callbacks for the reviewed legacy HTML actions. No eval or string compilation.
(function(){
  'use strict';
  const actions=Object.freeze({
    "click-0268814d6fd6":function(event){SFAutoPlanWorkspace.unresolvedPage(-1)},
    "click-03124840cded":function(event){tplStandardList()},
    "keydown-09c548162dd4":function(event){handleAbsenceEmployeeKeydown(event)},
    "click-0a9f9d123f9a":function(event){tplEdit(decodeURIComponent(this.getAttribute('data-sf-click-arg0')||''))},
    "click-0d7bef7ecae6":function(event){spRejectRequest(decodeURIComponent(this.getAttribute('data-sf-click-arg0')||''),'worksCouncil')},
    "click-1055217675ea":function(event){sfTodayV2Refresh()},
    "click-10b888c6e7d5":function(event){sfTodayV2Nav('absence')},
    "click-18cde900128e":function(event){deleteAbsenceEnhanced(decodeURIComponent(this.getAttribute('data-sf-click-arg0')||''))},
    "click-1ca1d0d27833":function(event){spCloseChangeDrawer()},
    "click-1cb69e027894":function(event){SFAutoPlanWorkspace.openSchedule(this.dataset.autoDate)},
    "click-1d5e3c617470":function(event){spRejectRequest(decodeURIComponent(this.getAttribute('data-sf-click-arg0')||''),'employee')},
    "click-1f091ea18b10":function(event){openApp('schedule')},
    "click-222d16a94d25":function(event){tplChoose('current')},
    "click-22f3e4aa2eae":function(event){showView('plan')},
    "click-280f4b53cb71":function(event){spOpenComplianceCenter()},
    "click-2a847fb40b6c":function(event){editTimeEntry(decodeURIComponent(this.getAttribute('data-sf-click-arg0')||''))},
    "click-2ba3fb1e00b1":function(event){sfTodayV2Nav('schedule')},
    "click-2cddb7a1e7d2":function(event){tplChoose('week')},
    "click-2e80424353c1":function(event){return spQuickDeleteAssignment(decodeURIComponent(this.getAttribute('data-sf-click-arg0')||''),event)},
    "change-3532a562d800":function(event){renderReports()},
    "click-3a88bdaa10fb":function(event){tplChoose('day')},
    "focus-3c94bce5ad85":function(event){renderAbsenceEmployeeResults()},
    "click-3d9fd5e99ec8":function(event){switchView('audit')},
    "click-3f70dd8eb7a0":function(event){tplSaveStandard()},
    "mousedown-429065fee799":function(event){event.preventDefault();selectAbsenceEmployee(decodeURIComponent(this.getAttribute('data-sf-mousedown-arg0')||''))},
    "click-43bde09df06a":function(event){spApplyChangeRequest(decodeURIComponent(this.getAttribute('data-sf-click-arg0')||''))},
    "click-471b84a5c805":function(event){editAssignment(decodeURIComponent(this.getAttribute('data-sf-click-arg0')||''))},
    "click-486aebb53398":function(event){clearAutoPlanPreview()},
    "click-4c0cf4afbaf5":function(event){switchView('employees');setTimeout(()=>document.getElementById('addEmployeeBtn')?.click(),0)},
    "click-4e16a5348cea":function(event){showLanding();return false},
    "click-4ea1b814dad9":function(event){selectEmployee(decodeURIComponent(this.getAttribute('data-sf-click-arg0')||''))},
    "click-50beed606210":function(event){saveSoll()},
    "click-514d34bcaebe":function(event){removeAbsence(decodeURIComponent(this.getAttribute('data-sf-click-arg0')||''))},
    "click-52234f732139":function(event){openAbsenceDialog(decodeURIComponent(this.getAttribute('data-sf-click-arg0')||''))},
    "click-52898e2b1b58":function(event){openAbsenceDialog()},
    "click-542d07a22406":function(event){showView('employees')},
    "change-56f4733bbeb8":function(event){updateAbsenceModalConflicts()},
    "click-5970cbd288e3":function(event){setAbsenceModalType(decodeURIComponent(this.getAttribute('data-sf-click-arg0')||''))},
    "click-60501c6b57d7":function(event){addAbsence()},
    "change-612f19ce5bad":function(event){changeAutoPlanPeriod()},
    "click-61b24f17e2e8":function(event){switchView('schedule')},
    "input-63b1c26d9f04":function(event){renderTimeTracking()},
    "click-64d20b98bb73":function(event){spCancelChangeRequest(decodeURIComponent(this.getAttribute('data-sf-click-arg0')||''))},
    "click-650df1469230":function(event){tplList()},
    "click-6a1ff60f22b7":function(event){document.getElementById('absenceModal').remove()},
    "click-6a45ec8cab43":function(event){tplDup(decodeURIComponent(this.getAttribute('data-sf-click-arg0')||''))},
    "click-6cb9b42d81f0":function(event){tplEditor()},
    "click-6e5870724ba1":function(event){sfTodayNav('time')},
    "input-6fcb6144774b":function(event){handleAbsenceEmployeeInput()},
    "click-7660e30b3d5b":function(event){sfTodayNav('auto')},
    "click-7ad8be672d93":function(event){removeAutoSuggestion(Number(decodeURIComponent(this.getAttribute('data-sf-click-arg0')||'')))},
    "click-7e18e5626c0f":function(event){SFAutoPlanWorkspace.openSchedule()},
    "click-7e484f500f37":function(event){SFAutoPlanWorkspace.expandDays(true)},
    "click-7e5a4b369dd7":function(event){spPublishCurrentWeek()},
    "click-807f37cd4d49":function(event){sfTodayNav('absence')},
    "click-85d438a9f854":function(event){tplChoose('shift')},
    "change-884e4a6507bd":function(event){SFMonthOptimizer.changeIndividualBlocks()},
    "click-88916aaf3b18":function(event){sfOpenDisruptionAutopilot()},
    "change-8b4a4168b2ab":function(event){SFAutoPlanWorkspace.stairMonth(this.value)},
    "click-8d708d71df5f":function(event){sfTodayV2Autopilot()},
    "click-92ed58992cd6":function(event){switchView('auto');setTimeout(()=>generateAutoPlanPreview(),0)},
    "click-97ee3c81be13":function(event){tplDelete(decodeURIComponent(this.getAttribute('data-sf-click-arg0')||''))},
    "change-9e6af7207dd5":function(event){toggleAbsenceTimeFields()},
    "click-a13a445a6952":function(event){tplSave()},
    "click-a2f9ae005f5b":function(event){spApproveRequest(decodeURIComponent(this.getAttribute('data-sf-click-arg0')||''),'employee')},
    "click-a3b12c2a8a2b":function(event){document.getElementById('features').scrollIntoView({behavior:'smooth'})},
    "change-a7f8aa3e6dd1":function(event){renderAbsenceDashboard()},
    "click-a95329a8b526":function(event){location.reload()},
    "click-a9613aacc07f":function(event){saveDailySoll()},
    "click-a9f8ebb7c7a7":function(event){saveGeneralShiftTimes()},
    "click-b4359b779113":function(event){sfTodayNav('schedule')},
    "click-b5e380207ff9":function(event){saveAbsenceDialog()},
    "click-b651fe93bd1c":function(event){spApproveRequest(decodeURIComponent(this.getAttribute('data-sf-click-arg0')||''),'worksCouncil')},
    "click-b724b05c55b2":function(event){tplEditStandard(decodeURIComponent(this.getAttribute('data-sf-click-arg0')||''))},
    "change-b76a8c2177af":function(event){if(document.getElementById('absEnd').value<this.value)document.getElementById('absEnd').value=this.value;updateAbsenceModalConflicts()},
    "click-b8dbdb5ccc60":function(event){spCloseAssignModal()},
    "click-be05309e09a6":function(event){switchView('absence');setTimeout(()=>openAbsenceDialog(),0)},
    "click-c0914cff080f":function(event){dayClick(event,decodeURIComponent(this.getAttribute('data-sf-click-arg0')||''))},
    "change-c75ff2c2f69d":function(event){renderTimeTracking()},
    "click-ca637a8ff4d6":function(event){openApp('overview')},
    "click-cad6a512ee6a":function(event){applyAutoPlanPreview()},
    "click-cc3ca09ef113":function(event){clearAbsenceEmployeeSearch()},
    "click-d16fb0b8d7fe":function(event){sfTodayV2Nav(decodeURIComponent(this.getAttribute('data-sf-click-arg0')||''))},
    "click-d271707b21b1":function(event){tplClose()},
    "click-da15b2dbd346":function(event){sfTodayV2Nav('time')},
    "click-daf986f55d4e":function(event){SFAutoPlanWorkspace.expandDays(false)},
    "click-e08b36d4ef31":function(event){tplToggleStandard(decodeURIComponent(this.getAttribute('data-sf-click-arg0')||''))},
    "click-e456652c3ffe":function(event){openScheduleFromDashboard()},
    "click-e67cc623c3f6":function(event){switchView('schedule'); window.scrollTo({top:0,behavior:'instant'})},
    "click-eb48dcc0720c":function(event){sfTodayV2Nav('auto')},
    "click-edb4d32093fc":function(event){SFAutoPlanWorkspace.unresolvedPage(1)},
    "click-ef9b7ccfb4ba":function(event){tplToggle(decodeURIComponent(this.getAttribute('data-sf-click-arg0')||''))},
    "click-f021434166dc":function(event){spSaveComplianceSettings()},
    "click-f11c22db8918":function(event){spCloseComplianceCenter()},
    "click-f266db50b2c9":function(event){SFMonthOptimizer.optimize()},
    "click-f6f7bec93b6d":function(event){generateAutoPlanPreview()},
    "click-ff47ef55d170":function(event){chooseType(decodeURIComponent(this.getAttribute('data-sf-click-arg0')||''))}
  });
  const bound=new WeakMap();
  function prepare(event){
    const type=event.type,attribute='data-sf-'+type;
    for(const node of event.composedPath()){
      if(typeof node.getAttribute!=='function')continue;
      const key=node.getAttribute(attribute),handler=key?.startsWith(type+'-')?actions[key]:undefined;
      let listeners=bound.get(node);const old=listeners?.[type];
      if(old&&old.key===key)continue;
      if(old){node.removeEventListener(type,old.listener);delete listeners[type];}
      if(!handler)continue;
      if(!listeners){listeners=Object.create(null);bound.set(node,listeners);}
      const listener=function(ev){
        // A later procedural .onclick assignment replaces the original HTML handler.
        if(this.getAttribute(attribute)!==key||typeof this['on'+type]==='function')return;
        if(handler.call(this,ev)===false)ev.preventDefault();
      };
      listeners[type]={key,listener};node.addEventListener(type,listener);
    }
  }
  // Capture prepares real target listeners even for synchronous .click() calls.
  // Handlers receive the real event/currentTarget and preserve native bubbling.
  for(const type of ['click','change','input','mousedown','focus','keydown'])document.addEventListener(type,prepare,true);
})();
