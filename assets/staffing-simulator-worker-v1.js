'use strict';
importScripts('solid-planning-core-v1.js?v=20261009-critical-period1','individual-month-planner-v1.js','month-optimizer-core-v1.js?v=20261010-wish1','ot-weekend-holiday-policy.js?v=20261010-wish1','wish-planning-core-v1.js?v=20261010-wish1','staffing-simulator-core-v1.js?v=20261010-wish1');
onmessage=async({data:{snapshot,scenarios}})=>{
 try{const results=[];for(let i=0;i<scenarios.length;i++){const result=await SFStaffingSimulatorCore.run(snapshot,scenarios[i],{progress:p=>postMessage({type:'progress',scenario:i,...p})});if(scenarios[i].outageId){const noOutage=await SFStaffingSimulatorCore.run(snapshot,{...scenarios[i],outageId:''},{progress:p=>postMessage({type:'progress',scenario:i,outageComparison:true,...p})});result.withoutOutage=noOutage.open;result.outageDifference=result.open-noOutage.open;}results.push(result);postMessage({type:'partial',result,index:i});}postMessage({type:'done',results});}
 catch(error){postMessage({type:'error',message:error.message||String(error)});}
};
