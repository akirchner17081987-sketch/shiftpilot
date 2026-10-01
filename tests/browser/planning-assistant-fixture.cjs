const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../..');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const style=index.match(/<style[^>]*>([\s\S]*?)<\/style>/)[1];
function fn(name){const start=index.indexOf('function '+name+'(');if(start<0)throw Error(name);let p=index.indexOf('{',start),n=1;while(n&&++p<index.length){if(index[p]==='{')n++;if(index[p]==='}')n--;}return index.slice(start,p+1);}
const appFunctions=['employeeMonthlyTarget','plannedAssignmentHours','plannedMonthlyHoursForEmployee','autoPlannedHours','autoEligibleEmployees'].map(fn).join('\n');
const fixtures=`
window.__errors=[];window.addEventListener('error',e=>window.__errors.push(e.message));
const TYPES=[{id:'FD',name:'Frühdienst',start:'06:00',end:'14:00'},{id:'SD',name:'Spätdienst',start:'14:00',end:'22:00'},{id:'ND',name:'Nachtdienst',start:'22:00',end:'06:00'}];
let employees=[{id:'a',first:'Anna',last:'Beispiel',status:'active',planningTeam:'A',shifts:['FD','SD','ND'],weeklyHours:40,monthlyHours:180},{id:'b',first:'Ben',last:'Beispiel',status:'active',shifts:['FD','SD','ND'],weeklyHours:40,monthlyHours:180},{id:'c',first:'Clara',last:'Beispiel',status:'active',planningTeam:'C',shifts:['ND'],weeklyHours:40,monthlyHours:180}];
let assignments=[{id:'a1',date:'2026-12-01',type:'FD',employeeId:'a',start:'06:00',end:'14:00'}],absences=[],globalSoll={FD:2,SD:1,ND:1},dailySoll={},weekStart=new Date('2026-11-30T12:00:00');
const store={get:(k,d)=>d,set:()=>{}};const typeById=id=>TYPES.find(t=>t.id===id),getSoll=(date,type)=>dailySoll[date]?.[type]??globalSoll[type]??0,assignmentsFor=(date,type)=>assignments.filter(a=>a.date===date&&a.type===type),absent=()=>false;
function iso(d){return d.toISOString().slice(0,10)}function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}function currentWeekDates(){return Array.from({length:7},(_,i)=>addDays(weekStart,i))}function autoMonday(value){const d=new Date(value+'T12:00:00');d.setDate(d.getDate()-((d.getDay()+6)%7));return d}function autoPlanningDates(){return ['2026-12-01']}
window.SFBackend={ready:true,companyId:'test-company',role:'PLANNER',user:{id:'test-user'},companyTimeZone:'Europe/Berlin'};window.showView=view=>window.__lastView=view;
window.SFPlanningTeams={isLoaded:()=>true,rules:[{team:'E',start:'2026-12-01',pattern:['FD','FD','SD','SD','FREI','ND','ND','FREI','FREI','FREI'],offset:8}],get:()=>null};
window.SchichtFunkCalendarView={getPeriod:()=>({start:'2026-12-01',end:'2026-12-31'}),setMonth:()=>{},setMode:()=>{}};
`;
const scripts=['employee-rhythm-v1.js','compliance-core-v2.js','supabase-auto-plan-guard-v1.js','help-center-content-v3.js','planning-assistant-core-v1.js','planning-assistant-v1.js'].map(src=>'<script src="/assets/'+src+'"></script>').join('');
const html=`<!doctype html><html lang="de" data-sf-theme="dark"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SchichtFunk Planungsassistent · Lokale Prüfung</title><style>${style}</style><link rel="stylesheet" href="/assets/manager-theme-v1.css"><link rel="stylesheet" href="/assets/planning-assistant-v1.css"></head><body><header class="topbar" style="padding:20px"><img src="/assets/schichtfunk-logo.svg" alt="SchichtFunk" style="width:190px"><div class="top-actions"></div></header><main style="padding:30px"><h1>Dienstplanung · Dezember 2026</h1><p>Lokale Vorschau mit fiktiven Beispieldaten</p><section class="card" style="max-width:720px;padding:24px"><h2>Planung unterstützen</h2><p>Offene Dienste prüfen, Ersatzbesetzung finden und Teamrhythmen verstehen.</p></section></main><input hidden id="autoRespectHours" type="checkbox" checked><input hidden id="autoFairDistribution" type="checkbox" checked><script>${fixtures}\n${appFunctions}</script>${scripts}<script src="/qa-run.js"></script></body></html>`;
module.exports={html,root};
