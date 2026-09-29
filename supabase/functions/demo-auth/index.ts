import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { bearer, cors, createToken, json, safeEqual, sha256Hex, verifyToken } from '../_shared/demo-security.js';

const SESSION_SECONDS=60*60;
const RATE_WINDOW_SECONDS=15*60;
const MAX_FAILURES=5;
const attempts=new Map<string,{count:number;resetAt:number}>();

Deno.serve(async req=>{
  const corsHeaders=cors(req);
  if(!corsHeaders)return json({ok:false,code:'origin_rejected'},403);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders});
  const secret=Deno.env.get('DEMO_SESSION_SECRET')||'';
  const expectedUser=Deno.env.get('DEMO_USER_SHA256')||'';
  const expectedPassword=Deno.env.get('DEMO_PASSWORD_SHA256')||'';
  if(!secret||!/^[a-f0-9]{64}$/i.test(expectedUser)||!/^[a-f0-9]{64}$/i.test(expectedPassword))return json({ok:false,code:'not_configured'},503,corsHeaders);

  if(req.method==='GET'){
    const access=await verifyToken(bearer(req),secret,'access');
    return access?json({ok:true,expiresAt:new Date(access.exp).toISOString()},200,corsHeaders):json({ok:false,code:'expired'},401,corsHeaders);
  }
  if(req.method==='DELETE')return json({ok:true},200,corsHeaders);
  if(req.method!=='POST')return json({ok:false,code:'method_not_allowed'},405,{...corsHeaders,Allow:'GET, POST, DELETE'});

  const now=Date.now();
  if(attempts.size>1000)for(const [key,value] of attempts)if(value.resetAt<=now)attempts.delete(key);
  const address=String(req.headers.get('x-forwarded-for')||req.headers.get('cf-connecting-ip')||'unknown').split(',')[0].trim();
  const agent=String(req.headers.get('user-agent')||'').slice(0,240);
  const clientKey=await sha256Hex(`${address}|${agent}|${secret}`);
  let failure=attempts.get(clientKey)||null;
  if(failure&&failure.resetAt<=now){attempts.delete(clientKey);failure=null}
  const signedFailure=await verifyToken(req.headers.get('x-demo-failure')||'',secret,'failure');
  if(signedFailure?.key===clientKey&&(!failure||Number(signedFailure.count)>failure.count))failure={count:Number(signedFailure.count)||0,resetAt:signedFailure.exp};
  if(failure&&failure.count>=MAX_FAILURES){
    const retryAfter=Math.max(1,Math.ceil((failure.resetAt-now)/1000));
    return json({ok:false,code:'rate_limited',retryAfter},429,{...corsHeaders,'Retry-After':String(retryAfter)});
  }

  let input:any;
  try{input=await req.json()}catch{return json({ok:false,code:'invalid_request'},400,corsHeaders)}
  const username=String(input?.username||'').trim().toLowerCase().slice(0,254);
  const password=String(input?.password||'').slice(0,512);
  const valid=safeEqual(await sha256Hex(username),expectedUser.toLowerCase())&&safeEqual(await sha256Hex(password),expectedPassword.toLowerCase());
  if(!valid){
    const state={count:(failure?.count||0)+1,resetAt:failure?.resetAt>now?failure.resetAt:now+RATE_WINDOW_SECONDS*1000};
    attempts.set(clientKey,state);
    const failureToken=await createToken({kind:'failure',key:clientKey,count:state.count,exp:state.resetAt},secret);
    const retryAfter=Math.max(1,Math.ceil((state.resetAt-now)/1000));
    return state.count>=MAX_FAILURES
      ?json({ok:false,code:'rate_limited',retryAfter,failureToken},429,{...corsHeaders,'Retry-After':String(retryAfter)})
      :json({ok:false,code:'invalid_credentials',attemptsRemaining:MAX_FAILURES-state.count,failureToken},401,corsHeaders);
  }

  attempts.delete(clientKey);
  const expiresAt=now+SESSION_SECONDS*1000;
  const accessToken=await createToken({kind:'access',exp:expiresAt},secret);
  return json({ok:true,expiresAt:new Date(expiresAt).toISOString(),accessToken},200,corsHeaders);
});
