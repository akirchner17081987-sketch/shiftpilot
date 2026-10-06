// Central display model. Original QR and manual records remain unchanged.
(function(root){
  'use strict';
  const stamp=value=>value?Date.parse(value):NaN;
  function union(intervals){
    const sorted=intervals.filter(([a,b])=>Number.isFinite(a)&&Number.isFinite(b)&&b>a).map(r=>r.slice()).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
    const result=[];
    for(const range of sorted){const last=result.at(-1);if(last&&range[0]<=last[1])last[1]=Math.max(last[1],range[1]);else result.push(range)}
    return result;
  }
  const length=intervals=>union(intervals).reduce((sum,[a,b])=>sum+b-a,0);
  function manualRange(row,now=Date.now()){const a=stamp(row.actual_start),b=stamp(row.actual_end)-Math.max(0,Number(row.actual_break_minutes)||0)*60000;return Number.isFinite(a)&&Number.isFinite(b)&&b>a&&stamp(row.actual_end)<=now?[[a,b]]:[]}
  const overlap=(a,b,c,d)=>Math.max(0,Math.min(b,d)-Math.max(a,c));
  function prepare(planned,bookings,asOf){
    const now=stamp(asOf)||Date.now();
    const rows=(planned||[]).map(row=>({...row,has_plan:true,source:'PLAN',manual_row:{...row},qr_bookings:[],as_of:asOf,paid_ranges:manualRange(row,now),completed_ranges:manualRange(row,now),confirmed_ranges:row.entry_status==='confirmed'?manualRange(row,now):[]}));
    const identities=new Set();
    for(const booking of bookings||[]){
      if(identities.has(booking.id))continue;identities.add(booking.id);
      const a=stamp(booking.started_at),end=stamp(booking.ended_at),b=Number.isFinite(end)?Math.min(end,now):now;
      if(!Number.isFinite(a)||b<a||(booking.ended_at&&!Number.isFinite(end)))continue;
      let row=rows.find(r=>r.has_plan&&r.assignment_id===booking.matched_assignment_id&&r.employee_id===booking.employee_id);
      if(!row&&!booking.matched_assignment_id){
        const candidates=rows.filter(r=>r.has_plan&&r.employee_id===booking.employee_id).map(r=>({row:r,overlap:overlap(a,b,stamp(r.starts_at),stamp(r.ends_at))})).filter(c=>c.overlap>0).sort((x,y)=>y.overlap-x.overlap||String(x.row.assignment_id).localeCompare(String(y.row.assignment_id)));
        row=candidates[0]?.row;
      }
      if(!row){row={assignment_id:null,id:'qr:'+booking.id,employee_id:booking.employee_id,employee_name:booking.employee_name,personnel_no:booking.personnel_no,shift_code:'QR',starts_at:booking.started_at,ends_at:booking.ended_at,planned_break_minutes:0,has_plan:false,source:'QR',manual_row:null,as_of:asOf,qr_bookings:[],paid_ranges:[],completed_ranges:[],confirmed_ranges:[]};rows.push(row)}
      row.source='QR';row.qr_bookings.push(booking);row.paid_ranges.push([a,b]);
      if(Number.isFinite(end)&&end<=now){row.confirmed_ranges.push([a,end]);row.completed_ranges.push([a,end])}
    }
    for(const row of rows){
      row.paid_ranges=union(row.paid_ranges);row.completed_ranges=union(row.completed_ranges);row.confirmed_ranges=union(row.confirmed_ranges);
      row.recorded_milliseconds=length(row.paid_ranges);row.confirmed_milliseconds=length(row.confirmed_ranges);
      if(row.source==='QR'){
        const starts=row.qr_bookings.map(q=>stamp(q.started_at));if(row.manual_row?.actual_start)starts.push(stamp(row.manual_row.actual_start));
        row.actual_start=new Date(Math.min(...starts.filter(Number.isFinite))).toISOString();
        row.is_running=row.qr_bookings.some(q=>!q.ended_at);
        row.actual_end=row.is_running?null:new Date(Math.max(...row.paid_ranges.map(r=>r[1]),...row.qr_bookings.map(q=>stamp(q.ended_at)).filter(Number.isFinite))).toISOString();
        row.actual_break_minutes=row.qr_bookings.reduce((sum,q)=>sum+Number(q.pause_minutes||0),0);
        row.entry_status=row.is_running?'qr_running':['recorded','correction_requested'].includes(row.manual_row?.entry_status)?row.manual_row.entry_status:'qr_booked';
      }
    }
    // Allocate overlapping intervals once, with QR-backed rows first.
    const counted=new Map();
    for(const row of rows.slice().sort((a,b)=>(a.source==='QR'?0:1)-(b.source==='QR'?0:1)||String(a.assignment_id||a.id).localeCompare(String(b.assignment_id||b.id)))){
      const previous=counted.get(row.employee_id)||[],all=union([...previous,...row.paid_ranges]);
      row.counted_milliseconds=Math.max(0,length(all)-length(previous));counted.set(row.employee_id,all);
    }
    return rows.sort((a,b)=>stamp(a.starts_at)-stamp(b.starts_at)||String(a.employee_name).localeCompare(String(b.employee_name),'de'));
  }
  function summary(rows,bounds={}){
    const completed=new Map(),all=new Map();let planned=0,pending=0,needs=0,running=0;
    const clip=ranges=>ranges.map(([a,b])=>[Math.max(a,bounds.start??-Infinity),Math.min(b,bounds.end??Infinity)]);
    for(const row of rows){
      if(row.has_plan)planned+=length(clip([[stamp(row.starts_at),stamp(row.ends_at)-Number(row.planned_break_minutes||0)*60000]]))/60000;
      if(row.entry_status==='recorded')pending++;
      if(row.entry_status==='correction_requested'||row.entry_status==='open')needs++;
      if(row.is_running)running++;
      for(const [map,ranges] of [[completed,row.completed_ranges],[all,row.paid_ranges]]){
        const intervals=map.get(row.employee_id)||[];intervals.push(...clip(ranges));map.set(row.employee_id,intervals);
      }
    }
    const total=map=>[...map.values()].reduce((sum,ranges)=>sum+length(ranges)/60000,0),actual=total(completed);
    return {planned,actual,live:Math.max(0,total(all)-actual),pending,needs,running};
  }
  const api={union,length,prepare,summary};root.SFCentralTime=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis);
