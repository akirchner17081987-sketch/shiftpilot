export function safeEqual(left,right){
  const a=String(left??'');
  const b=String(right??'');
  let difference=a.length^b.length;
  const length=Math.max(a.length,b.length);
  for(let index=0;index<length;index++){
    difference|=(a.charCodeAt(index)||0)^(b.charCodeAt(index)||0);
  }
  return difference===0;
}

export function workerTokenAccepted(supplied,current,previous=''){
  const candidate=String(supplied??'');
  const active=String(current??'');
  const fallback=String(previous??'');
  if(!candidate||!active)return false;

  // Evaluate both configured slots before returning so a staged rotation does
  // not reveal which slot matched through an obvious short-circuit branch.
  const activeMatch=safeEqual(candidate,active);
  const previousMatch=fallback?safeEqual(candidate,fallback):false;
  return activeMatch||previousMatch;
}
