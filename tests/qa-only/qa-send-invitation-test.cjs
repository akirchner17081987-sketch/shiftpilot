const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
let source=fs.readFileSync(__dirname+'/send-invitation-qa.ts','utf8')
 .replace(/^import .*;\s*$/gm,'').replace(/: string/g,'').replace(/: number/g,'').replace(/: Request/g,'')
 .replace(/\]!/g,']').replace(/Deno\.env\.get\(([^)]*)\)!/g,'Deno.env.get($1)');
let handler,sent=[];
const context={Deno:{serve:fn=>handler=fn,env:{get:()=> 'test-only'}},crypto:webcrypto,TextEncoder,Request,Response,JSON,String,Array,encodeURIComponent,
 createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'test'}},error:null})},rpc:async()=>({data:{email:'fake@example.invalid',company:'QA test A, QA test B',qa_share:'legacy-test-share'},error:null})}),
 nodemailer:{createTransport:()=>({sendMail:async m=>{sent.push(m)},close(){}})}};
vm.runInNewContext(source,context);
const branch='https://shiftpilot-git-codex-qa-multi-employee-invitations-secure-match.vercel.app';
const old='https://shiftpilot-groe9qswu-secure-match.vercel.app';
const body=JSON.stringify({companyId:'20000000-0000-4000-8000-000000000001',inviteId:'30000000-0000-4000-8000-000000000001',kind:'employeeInvite',token:'a'.repeat(64)});
(async()=>{
 const preflight=await handler(new Request('https://example.invalid',{method:'OPTIONS',headers:{origin:branch}}));assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),branch);
 const denied=await handler(new Request('https://example.invalid',{method:'OPTIONS',headers:{origin:'https://attacker.example'}}));assert.equal(denied.status,403);
 for(const origin of [branch,old]){const r=await handler(new Request('https://example.invalid',{method:'POST',headers:{origin,authorization:'Bearer test','content-type':'application/json'},body}));assert.equal(r.status,200)}
 assert.equal(sent.length,2);assert.match(sent[0].text,/QA test A, QA test B/);assert.ok(sent[0].text.includes(branch+'/?employeeInvite='));assert.ok(!sent[0].text.includes('legacy-test-share'));
 assert.ok(sent[1].text.includes(old+'/?employeeInvite='));assert.ok(sent[1].text.includes('legacy-test-share'));
 console.log('PASS: QA invitation names both companies, targets selected preview, preserves previous preview and rejects foreign origin; no mail sent');
})().catch(e=>{console.error(e);process.exitCode=1});

