import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {webcrypto} from 'node:crypto';
const source=fs.readFileSync(new URL('../supabase/functions/qr-independent/index.ts',import.meta.url),'utf8').replace(/^import .*;\s*/,'');
const script=stripTypeScriptTypes(source);
function fixture(result={ok:true}){
 let handler;const calls=[];
 vm.runInNewContext(script,{Response,Uint8Array,TextDecoder,crypto:webcrypto,Deno:{env:{get:name=>name==='SUPABASE_URL'?'https://database.invalid':'synthetic-backend-key'},serve:fn=>handler=fn},fetch:async(url,options)=>{calls.push({url,...JSON.parse(options.body)});return Response.json(result)}});
 const send=(body,origin='https://schichtfunk.de')=>handler(new Request('https://edge.invalid',{method:'POST',headers:{origin,'content-type':'application/json'},body:typeof body==='string'?body:JSON.stringify({qrToken:'a'.repeat(64),personnelNo:'FIKTIV',...body})}));
 return{calls,send};
}
test('PIN login uses only the PIN RPC, returns a random session token, never falls back to date',async()=>{
 const h=fixture(),r=await h.send({action:'LOGIN',pin:'739281',startDate:'2020-01-15'}),body=await r.json();
 assert.equal(r.status,200);assert.match(body.sessionToken,/^[a-f0-9]{64}$/);assert.equal(h.calls.length,1);assert.match(h.calls[0].url,/qr_independent_pin_login$/);assert.equal(h.calls[0].p_pin,'739281');assert.ok(!('p_start_date' in h.calls[0]));assert.ok(!JSON.stringify(body).includes('synthetic-backend-key'));
});
test('one-time setup passes the code to the protected RPC without echoing secrets',async()=>{
 const h=fixture(),r=await h.send({action:'SET_PIN',pin:'739281',setupCode:'482719530618'});assert.equal(r.status,200);assert.equal(h.calls[0].p_setup_code,'482719530618');assert.equal(h.calls[0].p_pin,'739281');assert.ok(!JSON.stringify(await r.json()).includes('482719530618'));
});
test('explicit legacy login remains compatible during the staged rollout',async()=>{
 const h=fixture(),r=await h.send({action:'LOGIN',startDate:'2020-01-15'});assert.equal(r.status,200);assert.match(h.calls[0].url,/qr_independent_login$/);
});
test('bad PIN formats and malformed setup codes never call the database or trigger date fallback',async()=>{
 for(const args of [{pin:123456},{pin:'abc123'},{pin:''},{pin:'12345'},{pin:'123456789'},{action:'SET_PIN',pin:'739281',setupCode:'000'}]){const h=fixture(),r=await h.send({action:'LOGIN',startDate:'2020-01-15',...args});assert.equal(r.status,400);assert.equal(h.calls.length,0)}
});
test('rate limits are reported as 429 with retry timing and no usable session',async()=>{
 const h=fixture({ok:false,error:'Zu viele Versuche',rate_limited:true,retry_after_seconds:900});const r=await h.send({action:'LOGIN',pin:'739281'}),body=await r.json();assert.equal(r.status,429);assert.equal(body.retry_after_seconds,900);assert.equal(body.sessionToken,undefined);
});
test('database-denied date fallback never releases a session token',async()=>{
 const h=fixture({ok:false,error:'Bitte mit persönlicher PIN anmelden'});const r=await h.send({action:'LOGIN',startDate:'2020-01-15'});assert.equal(r.status,401);assert.equal((await r.json()).sessionToken,undefined);
});
test('origin, malformed JSON and actual request-size limits reject before database access',async()=>{
 for(const [body,origin,status] of [['null',undefined,400],['[]',undefined,400],['{',undefined,400],[' '.repeat(2049),undefined,413],[{action:'LOGIN',pin:'739281'},'https://foreign.invalid',403]]){const h=fixture(),r=await h.send(body,origin);assert.equal(r.status,status);assert.equal(h.calls.length,0)}
});
