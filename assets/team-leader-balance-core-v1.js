// Bounded, opt-in reassignment of shift types on already scheduled workdays.
// It never changes an employee's workdays, protected duties or daily staffing.
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./solid-planning-core-v1.js'):root.SFSolidPlanningCore);if(typeof module==='object'&&module.exports)module.exports=api;else root.SFTeamLeaderBalanceCore=api})(typeof window==='undefined'?globalThis:window,function(S){
'use strict';
const codes=new Set(['O1','O3','TL']),rowKey=a=>[a.employeeId,a.date,a.type,a.start,a.end].join('|');
function counts(rows,leaders){return leaders.map(e=>rows.filter(a=>String(a.employeeId)===String(e.id)&&a.type==='TL').length)}
function balance(input,preview,highs,seconds=1.5){
 const rule=input.solidRules?.teamLeaderShiftBalance;
 if(!rule?.enabled||!highs||!Array.isArray(preview)||!preview.length)return{preview,changed:0,status:'disabled'};
 const employees=new Map(input.employees.map(e=>[String(e.id),e]));
 const merged=()=>[...new Map([...(input.base||[]).filter(a=>a.date.startsWith(input.month)),...preview].map(a=>[rowKey(a),a])).values()];
 const initialAll=merged();
 const leaders=input.employees.filter(e=>(e.shifts||[]).includes('TL')&&(e.shifts||[]).some(code=>code==='O1'||code==='O3')&&initialAll.some(a=>String(a.employeeId)===String(e.id)));
 if(leaders.length<2||leaders.length>12)return{preview,changed:0,status:'unsupported'};
 const original=counts(initialAll,leaders),total=original.reduce((n,x)=>n+x,0);
 if(total<leaders.length||preview.length>500)return{preview,changed:0,status:'unsupported'};
 const low=Math.floor(total/leaders.length),high=Math.ceil(total/leaders.length),spread=Math.max(...original)-Math.min(...original);
 if(spread<=1&&leaders.every((e,i)=>original[i]<initialAll.filter(a=>String(a.employeeId)===String(e.id)).length))return{preview,changed:0,status:'balanced'};
 const protectedKeys=new Set([...(input.base||[]),...(input.reserved||[])].map(a=>String(a.employeeId)+'|'+a.date));
 for(const w of input.wishes||[])if(w.status==='ACCEPTED'&&w.kind==='SHIFT')for(const e of input.employees)if([e.id,e._dbId].map(String).includes(String(w.employee_id)))for(let date=w.start_date;date&&date<=w.end_date;date=S.plus(date,1))protectedKeys.add(String(e.id)+'|'+date);
 const byCandidate=new Map();for(const a of input.candidates||[]){if(!codes.has(a.type)||!a.date.startsWith(input.month))continue;const key=String(a.employeeId)+'|'+a.date+'|'+a.type;if(!byCandidate.has(key))byCandidate.set(key,a);}
 const choices=preview.map(a=>{
  const e=employees.get(String(a.employeeId)),locked=protectedKeys.has(String(a.employeeId)+'|'+a.date)||a.status==='PUBLISHED'||a._dbStatus==='PUBLISHED';
  if(!e||locked||!codes.has(a.type))return[a];
  const variants=[a];for(const code of ['O1','O3','TL']){if(code===a.type||!(e.shifts||[]).includes(code))continue;const next=byCandidate.get(String(a.employeeId)+'|'+a.date+'|'+code);
   if(next&&next.resource===a.date+'|'+code&&S.duty(next,input.solidRules).hours===S.duty(a,input.solidRules).hours)variants.push({...a,type:code,start:next.start,end:next.end,resource:next.resource,blockId:undefined});}
  return variants;
 });
 const cost=[],lower=[],upper=[],integrality=[],columns=[],rowLower=[],rowUpper=[];
 const variable=(c,cap=1)=>{const i=cost.length;cost.push(c);lower.push(0);upper.push(cap);integrality.push(1);columns.push([]);return i};
 const constraint=(terms,min=-1e30,max=1e30)=>{const i=rowLower.length;rowLower.push(min);rowUpper.push(max);for(const [col,n]of terms)if(n)columns[col].push([i,n]);};
 const x=choices.map((variants,i)=>variants.map((a,j)=>variable(j?1:0)));
 if(cost.length>1300)return{preview,changed:0,status:'unsupported'};
 choices.forEach((variants,i)=>constraint(x[i].map(col=>[col,1]),1,1));
 const daily=new Map();preview.forEach(a=>{const k=a.date+'|'+a.type;daily.set(k,(daily.get(k)||0)+1)});
 for(const [k,need]of daily){const terms=[];choices.forEach((variants,i)=>variants.forEach((a,j)=>{if(a.date+'|'+a.type===k)terms.push([x[i][j],1])}));constraint(terms,need,need);}
 // No option may create a previously absent shift type or an extra employee on a date.
 for(let i=0;i<choices.length;i++)for(let j=0;j<choices[i].length;j++)if(!daily.has(choices[i][j].date+'|'+choices[i][j].type))upper[x[i][j]]=0;
 const byPerson=new Map();preview.forEach((a,i)=>{const id=String(a.employeeId),list=byPerson.get(id)||[];list.push(i);byPerson.set(id,list)});
 for(const list of byPerson.values()){
  list.sort((a,b)=>preview[a].date.localeCompare(preview[b].date));
  for(let n=1;n<list.length;n++){const left=list[n-1],right=list[n];if(S.plus(preview[left].date,1)!==preview[right].date)continue;
   choices[left].forEach((a,j)=>choices[right].forEach((b,k)=>{const first=S.duty(a,input.solidRules),next=S.duty(b,input.solidRules);if(S.transitionError(a.type,b.type,input.solidRules)||next.startMs-first.endMs<Math.max(11,Number(input.minRestHours)||11)*3600000-1)constraint([[x[left][j],1],[x[right][k],1]],0,1)}));
  }
 }
 const slack=[];for(const e of leaders){const terms=[];choices.forEach((variants,i)=>{if(String(preview[i].employeeId)!==String(e.id))return;variants.forEach((a,j)=>{if(a.type==='TL')terms.push([x[i][j],1])})});
  const fixedRows=initialAll.filter(a=>String(a.employeeId)===String(e.id)&&!preview.some(p=>String(p.employeeId)===String(a.employeeId)&&p.date===a.date)),fixedTL=fixedRows.filter(a=>a.type==='TL').length;
  const under=variable(100,preview.length),over=variable(100,preview.length),regular=variable(80,1);slack.push({e,under,over,regular,terms});
  constraint([...terms,[under,1]],low-fixedTL,1e30);constraint([...terms,[over,-1]],-1e30,high-fixedTL);
  const workdays=initialAll.filter(a=>String(a.employeeId)===String(e.id)).length;
  if(workdays>1)constraint([...terms,[regular,-1]],-1e30,workdays-1-fixedTL);
 }
 const starts=[0],indices=[],values=[];for(const col of columns){for(const [r,v]of col){indices.push(r);values.push(v)}starts.push(indices.length)}
 const model={numCols:cost.length,numRows:rowLower.length,sense:1,colCost:cost,colLower:lower,colUpper:upper,rowLower,rowUpper,integrality,matrix:{format:'csc',numCols:cost.length,numRows:rowLower.length,starts,indices,values}};
 let solver;try{
  solver=highs.createModel(model);solver.options.set({output_flag:false,presolve:'on',time_limit:Math.max(.05,Math.min(2,seconds)),mip_rel_gap:.001});
  const initial=cost.map(()=>0);x.forEach(v=>initial[v[0]]=1);slack.forEach(({e,under,over,regular})=>{const n=original[leaders.indexOf(e)],days=initialAll.filter(a=>String(a.employeeId)===String(e.id)).length;initial[under]=Math.max(0,low-n);initial[over]=Math.max(0,n-high);initial[regular]=Number(days>1&&n===days)});
  solver.setSolution({colValue:initial});solver.run();
  if(solver.info.get('primal_solution_status')!==2)return{preview,changed:0,status:'limited'};
  const y=Array.from(solver.getSolution().colValue),next=[];for(let i=0;i<choices.length;i++){const chosen=x[i].findIndex(col=>y[col]>.5);if(chosen<0||x[i].some(col=>Math.abs(y[col]-Math.round(y[col]))>1e-5))return{preview,changed:0,status:'invalid'};next.push(choices[i][chosen]);}
  const all=[...new Map([...(input.base||[]),...next].map(a=>[rowKey(a),a])).values()];
  const after=counts(all.filter(a=>a.date.startsWith(input.month)),leaders),afterSpread=Math.max(...after)-Math.min(...after);
  if(afterSpread>=spread)return{preview,changed:0,status:'unchanged'};
  if(next.some((a,i)=>a.employeeId!==preview[i].employeeId||a.date!==preview[i].date)||[...daily].some(([k,n])=>next.filter(a=>a.date+'|'+a.type===k).length!==n))return{preview,changed:0,status:'invalid'};
  for(const e of input.employees)if(S.errors(e,all,input.solidRules).length)return{preview,changed:0,status:'invalid'};
  return{preview:next,changed:next.filter((a,i)=>rowKey(a)!==rowKey(preview[i])).length,status:'balanced',counts:Object.fromEntries(leaders.map((e,i)=>[e.personnelNo||e.id,after[i]]))};
 }catch(_){return{preview,changed:0,status:'unavailable'};}finally{solver?.dispose();}
}
return{balance};
});
