import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const allowed=new Set([
  'https://schichtfunk.de','https://www.schichtfunk.de',
  'https://shiftpilot-two.vercel.app'
]);
const headersFor=(origin:string)=>({
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store',
  ...(allowed.has(origin)?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{})
});
const reply=(body:unknown,status:number,origin:string)=>new Response(JSON.stringify(body),{status,headers:headersFor(origin)});
const tokenPattern=/^[a-f0-9]{64}$/i;
const personnelPattern=/^[\p{L}\p{N}._\-/ ]{1,100}$/u;
const datePattern=/^\d{4}-\d{2}-\d{2}$/;
const hex=(data:Uint8Array)=>Array.from(data,b=>b.toString(16).padStart(2,'0')).join('');

async function rpc(name:string,body:Record<string,unknown>){
  const url=Deno.env.get('SUPABASE_URL')||'';
  const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(!url||!key)throw new Error('service_not_configured');
  let response:Response;
  try{response=await fetch(`${url}/rest/v1/rpc/${name}`,{
    method:'POST',headers:{'apikey':key,'Authorization':`Bearer ${key}`,
      'Content-Type':'application/json','Accept':'application/json'},
    body:JSON.stringify(body)
  })}catch{throw Object.assign(new Error('Verbindung zum Buchungsdienst unterbrochen'),{retryable:true})}
  let result;
  try{result=await response.json()}catch{throw Object.assign(new Error('Antwort des Buchungsdienstes unvollständig'),{retryable:true})}
  if(!response.ok)throw Object.assign(new Error(String(result?.message||'Buchung nicht möglich').slice(0,220)),{retryable:response.status>=500});
  return result;
}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get('origin')||'';
  if(origin&&!allowed.has(origin))return reply({ok:false,error:'Ursprung nicht erlaubt'},403,origin);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{
    ...headersFor(origin),'Access-Control-Allow-Headers':'authorization, apikey, content-type',
    'Access-Control-Allow-Methods':'POST, OPTIONS'
  }});
  if(req.method!=='POST')return reply({ok:false,error:'Methode nicht erlaubt'},405,origin);
  if(Number(req.headers.get('content-length')||0)>2048)return reply({ok:false,error:'Anfrage zu groß'},413,origin);
  let input:Record<string,unknown>;
  try{
    const reader=req.body?.getReader(),chunks:Uint8Array[]=[];let size=0;
    if(reader)while(true){
      const part=await reader.read();if(part.done)break;
      size+=part.value.byteLength;
      if(size>2048){await reader.cancel();return reply({ok:false,error:'Anfrage zu groß'},413,origin)}
      chunks.push(part.value);
    }
    const bytes=new Uint8Array(size);let offset=0;
    for(const part of chunks){bytes.set(part,offset);offset+=part.byteLength}
    input=JSON.parse(new TextDecoder().decode(bytes));
    if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('invalid_body');
  }catch{return reply({ok:false,error:'Ungültige Anfrage'},400,origin)}
  const action=String(input.action||'').toUpperCase();
  const qrToken=String(input.qrToken||'');
  const terminalId=typeof input.terminalId==='string'?input.terminalId:'';
  const desktop=Object.hasOwn(input,'terminalId');
  if(action!=='DESKTOP_TERMINALS'&&desktop&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(terminalId))return reply({ok:false,error:'Bitte einen Betrieb und Standort auswählen'},400,origin);
  if(action!=='DESKTOP_TERMINALS'&&!desktop&&!tokenPattern.test(qrToken))return reply({ok:false,error:'Ungültiger QR-Code'},400,origin);
  try{
    if(action==='DESKTOP_TERMINALS')return reply(await rpc('qr_desktop_terminals',{}),200,origin);
    const desktopRequest=(action:string,session:string,extra:Record<string,unknown>={})=>rpc('qr_desktop_request',{
      p_terminal_id:terminalId,p_action:action,p_personnel_no:null,p_pin:null,
      p_session_token:session,p_setup_code:null,p_request_id:null,...extra
    });
    if(action==='LOGIN'||action==='SET_PIN'){
      const personnelNo=String(input.personnelNo||'').trim();
      const pin=typeof input.pin==='string'?input.pin:'';
      const startDate=String(input.startDate||'');
      const setupCode=typeof input.setupCode==='string'?input.setupCode:'';
      if(!personnelPattern.test(personnelNo))return reply({ok:false,error:'Anmeldung nicht möglich. Bitte Angaben prüfen.'},401,origin);
      const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);const sessionToken=hex(bytes);
      let result;
      if(action==='SET_PIN'||Object.hasOwn(input,'pin')){
        if(!/^[0-9]{6,8}$/.test(pin)||(action==='SET_PIN'&&!/^[0-9]{12}$/.test(setupCode)))
          return reply({ok:false,error:'PIN oder Einrichtungscode hat ein ungültiges Format.'},400,origin);
        result=desktop?await desktopRequest(action,sessionToken,{p_personnel_no:personnelNo,p_pin:pin,p_setup_code:action==='SET_PIN'?setupCode:null}):await rpc('qr_independent_pin_login',{
          p_terminal_token:qrToken,p_personnel_no:personnelNo,p_pin:pin,
          p_session_token:sessionToken,p_setup_code:action==='SET_PIN'?setupCode:null
        });
      }else{
        if(!datePattern.test(startDate))return reply({ok:false,error:'Anmeldung nicht möglich. Bitte Angaben prüfen.'},401,origin);
        result=desktop?await rpc('qr_desktop_legacy_login',{p_terminal_id:terminalId,p_personnel_no:personnelNo,p_start_date:startDate,p_session_token:sessionToken}):await rpc('qr_independent_login',{
          p_terminal_token:qrToken,p_personnel_no:personnelNo,p_start_date:startDate,p_session_token:sessionToken
        });
      }
      if(!result?.ok)return reply({ok:false,error:result?.error||'Anmeldung nicht möglich.',retry_after_seconds:result?.retry_after_seconds},result?.rate_limited?429:401,origin);
      return reply({...result,sessionToken},200,origin);
    }
    if(!['STATUS','CLOCK_IN','BREAK_START','BREAK_END','CLOCK_OUT'].includes(action))
      return reply({ok:false,error:'Ungültige Aktion'},400,origin);
    const sessionToken=String(input.sessionToken||'');
    if(!tokenPattern.test(sessionToken))return reply({ok:false,error:'Bitte erneut anmelden'},401,origin);
    const requestId=input.requestId==null?null:String(input.requestId).toLowerCase();
    if(requestId!==null&&!tokenPattern.test(requestId))return reply({ok:false,error:'Ungültige Anfragekennung'},400,origin);
    const result=desktop?await desktopRequest(action,sessionToken,{p_request_id:requestId}):await rpc('qr_independent_action',{
      p_terminal_token:qrToken,p_session_token:sessionToken,p_action:action,p_request_id:requestId
    });
    return reply(result,200,origin);
  }catch(error){
    const message=error instanceof Error?error.message:'Buchung nicht möglich';
    if(error&&typeof error==='object'&&'retryable' in error&&error.retryable)
      return reply({ok:false,error:'Verbindung zum Buchungsdienst unterbrochen. Bitte den Buchungsstatus prüfen.',retryable:true},503,origin);
    const expired=/Anmeldung abgelaufen/.test(message);
    return reply({ok:false,error:message==='service_not_configured'?'Dienst derzeit nicht verfügbar':message},
      expired?401:400,origin);
  }
});
