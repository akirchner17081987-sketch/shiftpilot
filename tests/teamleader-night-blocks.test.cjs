const {test}=require('node:test'),assert=require('node:assert/strict');
const S=require('../assets/solid-planning-core-v1.js'),B=require('../assets/background-auto-plan-core-v1.js');
const rules={enabled:true,confirmedRulesVersion:2,timezone:'Europe/Berlin',maxConsecutiveShifts:4,maxConsecutiveNightShifts:3,teamLeaderMaxConsecutiveNightShifts:4,minFreeCalendarDays:2,minNightRecoveryCalendarDays:3,minBlockRestHours:48,maxCalendarWeekHours:40};
const lead={id:'e',role:'Teamleiter',employment:'Vollzeit',weeklyHours:40,monthlyHours:180,shifts:['TL-LE','O1','O3']};
const rows=Array.from({length:4},(_,i)=>({employeeId:'e',date:'2027-01-0'+(i+4),type:'TL-LE',start:'20:00',end:'06:00'}));
test('four leader nights pass, fifth night and four ordinary employee nights remain blocked',()=>{assert.deepEqual(S.errors(lead,rows,rules),[]);assert.ok(S.errors(lead,[...rows,{...rows[0],date:'2027-01-08'}],rules).length);assert.ok(S.errors({...lead,role:'Sicherheitsmitarbeiter'},rows,rules).some(e=>/drei Nachtdienste/.test(e.message)));});
test('three full recovery days, 40 weekly hours and the 162-hour personal cap remain intact',()=>{assert.ok(S.errors(lead,[...rows,{...rows[0],date:'2027-01-11'}],rules).some(e=>/drei vollständig freie/.test(e.message)));assert.deepEqual(S.errors(lead,[...rows,{...rows[0],date:'2027-01-12'}],rules),[]);assert.ok(S.errors({...lead,maxWeeklyHours:30},rows,rules).some(e=>/30 Stunden/.test(e.message)));assert.equal(S.limits({...lead,monthlyHours:162},[{id:'TL-LE',start:'20:00',end:'06:00'}],rules).calendarLimit,162);});
test('background inputs preserve the role needed for the scoped night override',()=>{const packed=B.pack({month:'2027-01',employees:[lead],base:[],groups:[],capacities:[],solidRules:rules});assert.equal(B.unpack(packed).employees[0].role,'Teamleiter');assert.equal(S.employeeRules(B.unpack(packed).employees[0],rules).maxConsecutiveNightShifts,4);});
const fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
test('SQL employee rules use four nights only for leaders and retain ordinary and OT policies',async()=>{const db=new PGlite();try{await db.exec(`create schema private;create table public.employees(id uuid,company_id uuid,role text,employment text,weekly_hours numeric,qualifications text[],shift_permissions text[]);create function private.sf_month_meta(q text[],k text) returns text language sql as $$select null::text$$;`);await db.exec(fs.readFileSync('supabase/migrations/20261014000254_teamleader_four_night_blocks.sql','utf8'));const co='11111111-1111-1111-1111-111111111111',id='22222222-2222-2222-2222-222222222222';await db.query('insert into employees values($1,$2,$3,$4,40,$5,$6)',[id,co,'Teamleiter','Vollzeit',[],['TL-LE']]);const get=async()=>(await db.query('select private.sf_employee_planning_rules($1,$2,$3) p',[co,id,rules])).rows[0].p;assert.equal((await get()).maxConsecutiveNightShifts,4);assert.equal((await get()).minNightRecoveryCalendarDays,3);await db.query("update employees set role='Sicherheitsmitarbeiter'");assert.equal((await get()).maxConsecutiveNightShifts,3);}finally{await db.close();}});

test('55-hour calendar cap admits four day duties plus Sunday, preserves night recovery and rejects excess',()=>{
 const p={...rules,maxCalendarWeekHours:55},e={...lead,maxWeeklyHours:55};
 const days=[4,5,6,7,10].map(d=>({employeeId:'e',date:'2027-01-'+String(d).padStart(2,'0'),type:'OT',start:'08:00',end:'18:00'}));
 assert.deepEqual(S.errors(e,days,p),[]);
 assert.ok(S.errors(e,days,{...p,maxCalendarWeekHours:40}).some(x=>/40 Stunden/.test(x.message)));
 assert.ok(S.errors(e,[...rows,{...rows[0],date:'2027-01-10'}],p).some(x=>/drei vollständig freie/.test(x.message)));
 const six=Array.from({length:6},(_,i)=>({...days[0],date:'2027-01-0'+(i+4)}));
 assert.ok(S.errors(e,six,p).some(x=>/55 Stunden/.test(x.message)));
 assert.equal(S.limits({...e,monthlyHours:162},[{id:'TL-LE',start:'20:00',end:'06:00'}],p).calendarLimit,162);
});
