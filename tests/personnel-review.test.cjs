const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');

test('new absences require a deliberate employee while edits retain their employee',async()=>{
 const {Window}=await import('happy-dom');
 const source=fs.readFileSync('index.html','utf8');
 const wrapper=source.slice(source.indexOf('const _openAbsenceDialogDynamicBase=openAbsenceDialog;'),source.indexOf('const _saveAbsenceDialogDynamicBase=saveAbsenceDialog;'));
 for(const editing of [false,true]){
  const window=new Window(),document=window.document;
  const context={document,employees:[{id:'first',first:'First',last:'Person'},{id:'existing',first:'Existing',last:'Person'}],setTimeout(){},updateAbsenceModalConflicts(){},absenceEmployeeLabel:e=>e.first+' '+e.last,openAbsenceDialog(id){document.body.innerHTML='<div class="abs-field"><select id="absEmp"><option value="first">First</option><option value="existing" '+(id?'selected':'')+'>Existing</option></select></div>'}};
  vm.createContext(context);vm.runInContext(wrapper,context);context.openAbsenceDialog(editing?'record':null);
  assert.equal(document.getElementById('absEmp').value,editing?'existing':'');
  assert.equal(document.getElementById('absEmpSearch').value,editing?'Existing Person':'');
  assert.equal(document.querySelector('label').htmlFor,'absEmpSearch');
  window.happyDOM.abort();
 }
});

test('QR pause details show seconds without independent minute rounding',()=>{
 const source=fs.readFileSync('assets/qr-independent-report-v1.js','utf8').replace('B.qrIndependentReport={refresh}','B.qrIndependentReport={pauseDuration}');
 const window={SFBackend:{}},document={addEventListener(){}};
 vm.runInNewContext(source,{window,document,Intl,Date,Number,Math,Map,Set,setTimeout(){}});
 const format=window.SFBackend.qrIndependentReport.pauseDuration;
 assert.equal(format(40/60),'0 Min. 40 Sek.');assert.equal(format(16+40/60),'16 Min. 40 Sek.');
 assert.equal(format(0),'0 Min. 0 Sek.');assert.equal(format(null),'Läuft');
});
