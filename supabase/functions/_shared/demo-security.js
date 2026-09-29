const encoder=new TextEncoder();
const decoder=new TextDecoder();
const base64url=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
const fromBase64url=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(value.length/4)*4,'=')),c=>c.charCodeAt(0));

export async function sha256Hex(value){
  const digest=await crypto.subtle.digest('SHA-256',encoder.encode(String(value)));
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

export function safeEqual(left,right){
  const a=String(left),b=String(right);
  if(a.length!==b.length)return false;
  let mismatch=0;
  for(let i=0;i<a.length;i++)mismatch|=a.charCodeAt(i)^b.charCodeAt(i);
  return mismatch===0;
}

async function signature(payload,secret){
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return base64url(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(payload))));
}

export async function createToken(value,secret){
  const payload=base64url(encoder.encode(JSON.stringify(value)));
  return `${payload}.${await signature(payload,secret)}`;
}

export async function verifyToken(raw,secret,kind){
  if(!raw||!secret)return null;
  const split=raw.lastIndexOf('.');
  if(split<1)return null;
  const payload=raw.slice(0,split),supplied=raw.slice(split+1);
  if(!safeEqual(supplied,await signature(payload,secret)))return null;
  try{
    const value=JSON.parse(decoder.decode(fromBase64url(payload)));
    return value?.kind===kind&&Number.isFinite(value.exp)&&value.exp>Date.now()?value:null;
  }catch{return null}
}

export function bearer(req){
  const value=String(req.headers.get('authorization')||'');
  return /^Bearer\s+/i.test(value)?value.replace(/^Bearer\s+/i,'').trim():'';
}

export function cors(req){
  const origin=String(req.headers.get('origin')||'');
  const configured=String(Deno.env.get('DEMO_ALLOWED_ORIGINS')||'').split(',').map(value=>value.trim()).filter(Boolean);
  const allowed=new Set(['https://schichtfunk.de','https://www.schichtfunk.de','https://home-5021411544.app-ionos.space','http://localhost:4173','http://127.0.0.1:4173',...configured]);
  if(origin&&!allowed.has(origin))return null;
  return {
    ...(origin?{'Access-Control-Allow-Origin':origin}:{}),
    'Access-Control-Allow-Headers':'authorization, content-type, x-demo-failure',
    'Access-Control-Allow-Methods':'GET, POST, DELETE, OPTIONS',
    'Access-Control-Max-Age':'600','Cache-Control':'no-store, max-age=0','Vary':'Origin'
  };
}

export function json(body,status,headers={}){
  return Response.json(body,{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8'}});
}
