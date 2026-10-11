// Isolated browser fixtures in GitHub Actions. No production authentication or writes.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'test-results/planning-performance'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const base=process.env.SF_PERFORMANCE_BASE,baseline=p=>execFileSync('git',['show',base+':'+p],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});
const source=(variant,p)=>variant==='baseline'?baseline(p):read(p),index=read('index.html'),inline=[...index.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
const loader=read('assets/conflict-plausibility-v1.js'),files=[...loader.slice(loader.indexOf('const files='),loader.indexOf('const managerStart')).matchAll(/'([^']+\.js)'/g)].map(m=>m[1]);
const section=index.slice(index.indexOf('<section id="view-auto"'),index.indexOf('\n  <section id="view-reports"',index.indexOf('<section id="view-auto"'))).replace('class="view sf-auto-workspace"','class="view active sf-auto-workspace"');
function planning(variant){const s=source(variant,'index.html'),start=s.indexOf('let autoPlanPreview=[];');return s.slice(start,s.indexOf('\nfunction renderOverviewStats()',start))}
const fixture=String.raw`
window.qa={};window.weekStart=new Date('2027-01-04T12:00:00');window.employees=Array.from({length:40},(_,i)=>({id:'e'+i,first:'Test',last:'Person '+i,status:'active',weeklyHours:40,employment:'Vollzeit',shifts:['SD','ND']}));window.assignments=[];window.absences=[];window.TYPES=[{id:'SD',name:'Spätdienst',start:'14:00',end:'22:00'},{id:'ND',name:'Nachtdienst',start:'22:00',end:'06:00'}];window.globalSoll={SD:16,ND:16};window.dailySoll={};window.SFBackend={companyId:'qa-a'};window.SFCompliance={policy:{solidPlanningRules:{enabled:true}},isWeekPublished:()=>false};
window.iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');window.addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};window.typeById=id=>TYPES.find(t=>t.id===id);window.getSoll=()=>16;window.assignmentsFor=(date,type)=>assignments.filter(a=>a.date===date&&a.type===type);window.absent=()=>false;window.plannedAssignmentHours=()=>8;window.employeeMonthlyTarget=()=>180;window.showSaveToast=()=>{};
qa.preview=[];for(let m=1;m<=12;m++)for(let i=0;i<40;i++)for(let j=0;j<18;j++){const type=(i+j)%2?'SD':'ND',t=typeById(type),a={id:'qa-'+m+'-'+i+'-'+j,employeeId:'e'+i,type,date:'2027-'+String(m).padStart(2,'0')+'-'+String((i+j)%28+1).padStart(2,'0'),start:t.start,end:t.end,reason:'Fiktiver Planungsvorschlag'};(i<20?assignments:qa.preview).push(a)}qa.preview.sort((a,b)=>a.date.localeCompare(b.date));
document.getElementById('autoPlanPeriod').value='month';document.getElementById('autoPlanMonth').value='2027-01';document.getElementById('autoPlanMonthCount').value='12';
`;
let server,browser;
async function main(){
 fs.mkdirSync(out,{recursive:true});
 server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost'),variant=u.searchParams.get('variant')||'current';
  res.setHeader('Cache-Control','no-store');
  if(u.pathname==='/loader'){
   const role=u.searchParams.get('role')||'OWNER';res.writeHead(200,{'Content-Type':'text/html'});return res.end(`<!doctype html><html><head><meta charset="utf-8"></head><body><script>window.qa={executed:[],orderErrors:[],begin:performance.now()};window.SFBackend={ready:false,role:null,boot:async()=>{SFBackend.role=${JSON.stringify(role)};SFBackend.ready=true},baseOpenApp(){},init:async()=>{qa.initCount=qa.executed.length;await SFBackend.boot();qa.done=performance.now()}};</script><script src="/loader.js?variant=${variant}"></script></body></html>`);
  }
  if(u.pathname==='/loader.js'){res.writeHead(200,{'Content-Type':'application/javascript'});return res.end(source(variant,'assets/conflict-plausibility-v1.js'))}
  if(u.pathname==='/render'){
   res.writeHead(200,{'Content-Type':'text/html'});return res.end(`<!doctype html><html lang="de" data-sf-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${inline}</style><link rel="stylesheet" href="/assets/manager-theme-v1.css"><link rel="stylesheet" href="/assets/auto-plan-period-v1.css"><style>.main{padding:16px}#appShell{display:block}.content{min-width:0}</style></head><body><div id="appShell"><main class="main"><div class="content">${section}</div></main></div><script>${fixture}</script><script>${planning(variant)};autoPlanPreview=qa.preview;autoPlanAnalyzed=true;document.addEventListener('DOMContentLoaded',()=>qa.begin=performance.now());</script><script src="/workspace.js?variant=${variant}"></script><script>document.addEventListener('DOMContentLoaded',()=>qa.openMs=performance.now()-qa.begin);</script></body></html>`);
  }
  if(u.pathname==='/workspace.js'){res.writeHead(200,{'Content-Type':'application/javascript'});return res.end(source(variant,'assets/auto-plan-workspace-v1.js'))}
  // Controlled per-request latency exercises the real loader's download and execution ordering.
  if(req.headers.referer?.includes('/loader')&&u.pathname.startsWith('/assets/')){
   const n=files.indexOf(u.pathname.slice(1));return setTimeout(()=>{res.writeHead(200,{'Content-Type':'application/javascript'});res.end(`if(qa.executed.length!==${n})qa.orderErrors.push(${n});qa.executed.push(${JSON.stringify(files[n])});`)},30+(n%4)*8);
  }
  const file=path.join(root,u.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end()}
  res.writeHead(200,{'Content-Type':file.endsWith('.css')?'text/css':'application/javascript'});res.end(fs.readFileSync(file));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true});const metrics={conditions:'Isolated fixtures, 40 staff, 12 months, 8640 duties; controlled module latency of 30–54 ms. These timings are not measurements of a user production session.'};
 async function load(variant,role){const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/loader?variant='+variant+'&role='+role);await page.waitForFunction(()=>qa.done).catch(async e=>{console.error({variant,role,errors,state:await page.evaluate(()=>window.qa)});throw e});const r=await page.evaluate(()=>({ms:qa.done-qa.begin,count:qa.executed.length,initCount:qa.initCount,orderErrors:qa.orderErrors}));assert.deepEqual(r.orderErrors,[]);assert.deepEqual(errors,[]);assert.equal(r.initCount,56);assert.equal(r.count,role==='EMPLOYEE'?56:85);await page.close();return r}
 if(base)metrics.loaderBaseline=await load('baseline','OWNER');metrics.loaderCurrent=await load('current','OWNER');await load('current','EMPLOYEE');await load('current','TIME_TRACKING');
 if(base)assert.ok(metrics.loaderCurrent.ms<metrics.loaderBaseline.ms*.75,'Concurrent loader must materially reduce controlled latency');
 async function render(variant){const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/render?variant='+variant);const stats=await page.evaluate(()=>({openMs:qa.openMs,preview:autoPlanPreview.length,existing:assignments.length,cells:document.querySelectorAll('.sf-auto-stair-table td').length,details:document.querySelectorAll('#autoSuggestions .sf-auto-suggestion-row').length,total:document.querySelector('.sf-auto-draft-summary').textContent}));assert.equal(stats.preview,4320);assert.equal(stats.existing,4320);assert.match(stats.total,/69[.\s]?120 h/);assert.match(stats.total,/86[.\s]?400 h/);
  const samples=[];for(let n=0;n<3;n++)samples.push(await page.evaluate(()=>{const start=performance.now();renderAutoPlanning();return performance.now()-start}));stats.repeatMs=samples.sort((a,b)=>a-b)[1];
  if(variant==='current'){
   assert.equal(stats.cells,40*31);assert.ok(stats.details<=40,'Only an opened day should construct suggestion rows');assert.equal(await page.locator('[aria-label="Monat in der Planvorschau"] option').count(),12);
   await page.locator('[aria-label="Monat in der Planvorschau"]').selectOption('2027-12');assert.match(await page.locator('.sf-auto-stair-table caption').textContent(),/Dezember 2027/);assert.match(await page.locator('.sf-auto-draft-summary').textContent(),/69[.\s]?120 h/);
   const day=page.locator('#autoSuggestions details[data-auto-day]').nth(3);await day.locator('summary').click();assert.ok(await day.locator('.sf-auto-suggestion-row').count()>0);await page.evaluate(()=>renderAutoPlanning());assert.equal(await day.evaluate(e=>e.open),true);
   await page.evaluate(()=>{employees[20].last='Geändert';renderAutoPlanning()});await page.getByRole('button',{name:'Alle Tage öffnen',exact:true}).click();assert.equal(await page.locator('#autoSuggestions .sf-auto-suggestion-row').count(),4320);assert.match(await page.locator('#autoSuggestions').textContent(),/Geändert/);await page.getByRole('button',{name:'Alle schließen',exact:true}).click();
   await page.locator('#autoUnresolvedPanel > summary').click();const before=await page.locator('#autoUnresolved [data-auto-date]').first().getAttribute('data-auto-date');await page.locator('#autoUnresolved').getByRole('button',{name:'Weiter',exact:true}).click();assert.notEqual(await page.locator('#autoUnresolved [data-auto-date]').first().getAttribute('data-auto-date'),before);
   assert.deepEqual(await page.evaluate(()=>[autoPlanPreview.length,assignments.length]),[4320,4320]);
   for(const [theme,width]of[['dark',1440],['light',1440],['dark',390],['light',320]]){await page.setViewportSize({width,height:1000});await page.evaluate(t=>document.documentElement.dataset.sfTheme=t,theme);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true);await page.locator('#autoStaircase').screenshot({path:path.join(out,'preview-'+theme+'-'+width+'.png')})}
  }
  assert.deepEqual(errors,[]);await page.close();return stats;
 }
 if(base)metrics.renderBaseline=await render('baseline');metrics.renderCurrent=await render('current');
 if(base){assert.ok(metrics.renderCurrent.openMs<metrics.renderBaseline.openMs*.8,'Initial preview must be faster');assert.ok(metrics.renderCurrent.repeatMs<metrics.renderBaseline.repeatMs*.8,'Repeated preview must be faster')}
 fs.writeFileSync(path.join(out,'metrics.json'),JSON.stringify(metrics,null,2));console.log(JSON.stringify(metrics,null,2));console.log('Planning performance QA passed: ordered downloads, employee and time roles, full-period totals, monthly preview, lazy details, all-day expansion, mutable names, pagination and mobile light/dark.');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();await new Promise(r=>server?.close(r)||r())});
