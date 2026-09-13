const uuidRe=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedRoles=new Set(['OWNER','ADMIN']);

export function lifecycleCors(req){
  const origin=String(req.headers.get('origin')||'');
  const configured=String(Deno.env.get('PRIVACY_ALLOWED_ORIGINS')||'').split(',').map(x=>x.trim()).filter(Boolean);
  const allowed=new Set([
    'https://schichtfunk.de','https://www.schichtfunk.de',
    'https://home-5021411544.app-ionos.space','http://localhost:4173','http://127.0.0.1:4173',
    ...configured
  ]);
  if(origin&&!allowed.has(origin))return null;
  return {
    ...(origin?{'Access-Control-Allow-Origin':origin}:{}),
    'Access-Control-Allow-Headers':'authorization, content-type',
    'Access-Control-Allow-Methods':'POST, OPTIONS',
    'Access-Control-Max-Age':'600','Cache-Control':'no-store, max-age=0','Vary':'Origin'
  };
}

export function parseLifecycleRequest(input){
  const action=String(input?.action||'').toLowerCase();
  const companyId=String(input?.companyId||'');
  const employeeId=String(input?.employeeId||'');
  const requestId=input?.requestId==null?null:String(input.requestId);
  const retentionProfileId=input?.retentionProfileId==null?null:String(input.retentionProfileId);
  const legalHoldUntil=input?.legalHoldUntil==null?null:String(input.legalHoldUntil);
  const reason=String(input?.reason||'').trim();
  const asOf=input?.asOf==null?null:String(input.asOf);
  const idempotencyKey=input?.idempotencyKey==null?null:String(input.idempotencyKey);
  if(!['preview','stage','approve'].includes(action))throw new Error('INVALID_ACTION');
  if(!uuidRe.test(companyId))throw new Error('INVALID_TARGET');
  if(action!=='approve'&&!uuidRe.test(employeeId))throw new Error('INVALID_TARGET');
  if(asOf&&!/^\d{4}-\d{2}-\d{2}$/.test(asOf))throw new Error('INVALID_DATE');
  if(action==='stage'){
    if(!uuidRe.test(idempotencyKey||''))throw new Error('INVALID_IDEMPOTENCY_KEY');
    if(reason.length<10||reason.length>1000)throw new Error('INVALID_REASON');
  }
  if(action==='approve'){
    if(!uuidRe.test(requestId||'')||!uuidRe.test(retentionProfileId||''))throw new Error('INVALID_APPROVAL');
    if(legalHoldUntil&&!Number.isFinite(Date.parse(legalHoldUntil)))throw new Error('INVALID_LEGAL_HOLD');
  }
  return {action,companyId,employeeId,reason,asOf,idempotencyKey,requestId,retentionProfileId,legalHoldUntil};
}

export function authorizeLifecycleRequest({membership,userId,aal,request}){
  if(!userId)throw new Error('UNAUTHENTICATED');
  if(!membership||membership.user_id!==userId||membership.company_id!==request.companyId
    ||membership.status!=='ACTIVE'||!allowedRoles.has(membership.role))throw new Error('FORBIDDEN');
  if(request.action!=='preview'&&aal!=='aal2')throw new Error('MFA_REQUIRED');
  return true;
}

export function readJwtAal(token){
  try{
    const payload=token.split('.')[1];
    if(!payload)return 'aal1';
    const normalized=payload.replace(/-/g,'+').replace(/_/g,'/');
    const json=JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length/4)*4,'=')));
    return json?.aal==='aal2'?'aal2':'aal1';
  }catch{return 'aal1'}
}
