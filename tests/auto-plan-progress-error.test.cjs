const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('failed planning stops its timer, announces cancellation and permits a fresh retry',()=>{
 const nodes=new Map(),intervals=new Set();let time=1000;
 function node(id){if(!nodes.has(id)){const classes=new Set(),attrs=new Map();nodes.set(id,{hidden:false,disabled:false,textContent:'',firstElementChild:{style:{}},classList:{contains:k=>classes.has(k),remove:(...ks)=>ks.forEach(k=>classes.delete(k)),toggle:(k,value)=>value?classes.add(k):classes.delete(k)},setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k),getAttribute:k=>attrs.get(k)});}return nodes.get(id);}
 ['view-auto','sfAutoProgress','sfAutoProgressLabel','sfAutoProgressDetail','sfAutoProgressPercent','sfAutoProgressBar','sfAutoProgressTime'].forEach(node);
 const window={},context=vm.createContext({window,document:{getElementById:node},Date:{now:()=>time,parse:Date.parse},setInterval:fn=>{intervals.add(fn);return fn;},clearInterval:fn=>intervals.delete(fn),setTimeout});
 vm.runInContext(fs.readFileSync(require.resolve('../assets/auto-plan-progress-v1.js'),'utf8'),context);
 const p=window.SFAutoPlanProgress;node('autoPlanMonthCount').disabled=true;assert.equal(p.start(),true);assert.equal(node('autoPlanMonth').disabled,true);assert.equal(node('autoPlanMonthCount').disabled,true);assert.equal(node('sfAutoProgressPercent').textContent,'In Arbeit');
 time+=123000;p.finish('canceling statement due to statement timeout');
 assert.equal(p.isBusy(),false);assert.equal(node('autoPlanMonth').disabled,false);assert.equal(node('autoPlanMonthCount').disabled,true);assert.equal(intervals.size,0);assert.equal(node('view-auto').getAttribute('aria-busy'),undefined);
 assert.equal(node('sfAutoProgressPercent').textContent,'Abgebrochen');assert.equal(node('sfAutoProgressBar').getAttribute('aria-valuetext'),'Planung abgebrochen');assert.equal(node('sfAutoProgressDetail').textContent,'canceling statement due to statement timeout');
 const elapsed=node('sfAutoProgressTime').textContent;time+=60000;intervals.forEach(fn=>fn());assert.equal(node('sfAutoProgressTime').textContent,elapsed);
 assert.equal(p.start(),true);assert.equal(node('sfAutoProgress').classList.contains('is-error'),false);assert.equal(node('sfAutoProgressPercent').textContent,'In Arbeit');assert.equal(intervals.size,1);
 p.finish();assert.equal(node('sfAutoProgressPercent').textContent,'100 %');assert.equal(intervals.size,0);
});
test('opening a completed proposal starts a fresh review timer before showing its phase',()=>{
 const nodes=new Map(),intervals=new Set();let time=1792681200000;
 function node(id){if(!nodes.has(id)){const classes=new Set(),attrs=new Map();nodes.set(id,{hidden:false,disabled:false,textContent:'',firstElementChild:{style:{}},classList:{contains:k=>classes.has(k),remove:(...ks)=>ks.forEach(k=>classes.delete(k)),toggle:(k,value)=>value?classes.add(k):classes.delete(k)},setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k),getAttribute:k=>attrs.get(k)});}return nodes.get(id);}
 ['view-auto','sfAutoProgress','sfAutoProgressLabel','sfAutoProgressDetail','sfAutoProgressPercent','sfAutoProgressBar','sfAutoProgressTime'].forEach(node);
 const window={},context=vm.createContext({window,document:{getElementById:node},Date:{now:()=>time,parse:Date.parse},setInterval:fn=>{intervals.add(fn);return fn;},clearInterval:fn=>intervals.delete(fn),setTimeout});
 vm.runInContext(fs.readFileSync(require.resolve('../assets/auto-plan-progress-v1.js'),'utf8'),context);
 const p=window.SFAutoPlanProgress;p.phase('Berechnung fertig – Vorschlag wird geprüft','Gespeicherte Besetzung wird abgeglichen.');
 assert.equal(p.isBusy(),true);assert.equal(node('sfAutoProgressTime').textContent,'Vergangen: 0 s');assert.equal(node('sfAutoProgressLabel').textContent,'Berechnung fertig – Vorschlag wird geprüft');
 time+=2000;intervals.forEach(fn=>fn());assert.equal(node('sfAutoProgressTime').textContent,'Vergangen: 2 s');p.finish();assert.equal(intervals.size,0);
});
