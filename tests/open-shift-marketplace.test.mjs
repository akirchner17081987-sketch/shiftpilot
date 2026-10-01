import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../assets/open-shift-marketplace-v1.js',import.meta.url),'utf8');
function module(){const context={window:{SFBackend:{}},document:{},Map,Set};vm.runInNewContext(source,context);return context.window.SFOpenShiftMarket;}
test('open demand is grouped by both date and shift, retaining each missing place',()=>{
 const result=module().groups([{date:'2026-12-02',type:'ND'},{date:'2026-12-01',type:'FD'},{date:'2026-12-01',type:'ND'},{date:'2026-12-01',type:'FD'}]);
 assert.deepEqual(JSON.parse(JSON.stringify(result)),[{date:'2026-12-01',type:'FD',count:2},{date:'2026-12-01',type:'ND',count:1},{date:'2026-12-02',type:'ND',count:1}]);
});
test('grouping neither changes input nor invents positions for fully staffed dates',()=>{
 const data=[{date:'2026-12-01',type:'FD',reason:'Kein Vorschlag'}],before=JSON.stringify(data);module().groups(data);assert.equal(JSON.stringify(data),before);assert.equal(module().groups([]).length,0);
});

