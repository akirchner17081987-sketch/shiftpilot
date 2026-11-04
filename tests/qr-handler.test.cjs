const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
let source=fs.readFileSync(__dirname+'/../supabase/functions/qr-independent/index.ts','utf8');
source=source.replace(/^import .*;\s*/,'').replace(/:Record<string,unknown>/g,'').replace(/:Uint8Array\[\]/g,'').replace(/:Uint8Array/g,'').replace(/:unknown/g,'').replace(/:number/g,'').replace(/:string/g,'').replace(/:Response/g,'').replace(/:Request/g,'').replace(/ as number/g,'');
let handler,requests=[],ok=true;
const company='11111111-1111-1111-1111-111111111111';
const fetch=async(url,options)=>{
 requests.push({url,options});
 if(url.includes('/rpc/qr_break_timer_request'))return new Response(JSON.stringify(ok?{ok:true,state:'READY'}:{ok:false,error:'expired'}),{status:200});
 if(url.includes('time_qr_independent_sessions'))return new Response(JSON.stringify([{company_id:company}]),{status:200});
 if(url.includes('company_branding?'))return new Response(JSON.stringify([{theme_key:'secontec',dark_primary:'#EA5A06'}]),{status:200});
 throw Error('unexpected request '+url);
};
const context=vm.createContext({Deno:{serve:f=>handler=f,env:{get:k=>({SUPABASE_URL:'https://example.test',SUPABASE_SERVICE_ROLE_KEY:'secret'})[k]}},fetch,crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,URLSearchParams,AbortSignal,Request,Response,Set,Object,Number,String,JSON,Error,Array});
vm.runInContext(source,context);
async function req(action){return handler(new Request('https://example.test',{method:'POST',headers:{origin:'https://schichtfunk.de','content-type':'application/json'},body:JSON.stringify({action,terminalId:company,sessionToken:'a'.repeat(64)})}))}
(async()=>{
 let res=await req('STATUS'),v=await res.json();assert.equal(v.company_branding.theme_key,'secontec');assert.equal(requests.length,3);
 requests=[];res=await req('CLOCK_IN');v=await res.json();assert.equal(v.company_branding,undefined);assert.equal(requests.length,1);
 requests=[];ok=false;res=await req('STATUS');v=await res.json();assert.equal(v.company_branding,undefined);assert.equal(requests.length,1);
 console.log('Buchungsdienst: STATUS, Buchung und abgelehnte Sitzung erfolgreich geprueft');
})().catch(e=>{console.error(e);process.exitCode=1});
