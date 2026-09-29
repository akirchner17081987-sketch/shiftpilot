import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';

const required=name=>{const value=process.env[name]?.trim();if(!value)throw new Error(`${name} fehlt`);return value};
const url=required('SF_MFA_TEST_URL').replace(/\/$/,'');
const key=required('SF_MFA_TEST_KEY');
const password=required('SF_MFA_TEST_PASSWORD');
const accounts=[
  {label:'OWNER-Testkonto',email:required('SF_MFA_OWNER_EMAIL')},
  {label:'Mitarbeiter-Testkonto',email:required('SF_MFA_EMPLOYEE_EMAIL')},
];

assert.ok(!url.includes('zbvloohfjleadjnqhbbh'),'Der MFA-Livetest darf niemals gegen Produktion laufen.');
for(const account of accounts)assert.match(account.email,/@example\.invalid$/,'Nur fiktive .invalid-Konten sind zulässig.');

const base32Decode=value=>{
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';
  for(const char of value.toUpperCase().replace(/=|\s/g,'')){const index=alphabet.indexOf(char);if(index<0)throw new Error('Ungültiges TOTP-Secret');bits+=index.toString(2).padStart(5,'0')}
  const bytes=[];for(let i=0;i+8<=bits.length;i+=8)bytes.push(parseInt(bits.slice(i,i+8),2));return Buffer.from(bytes);
};
const totp=secret=>{
  const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const digest=createHmac('sha1',base32Decode(secret)).update(counter).digest();const offset=digest.at(-1)&15;
  return ((digest.readUInt32BE(offset)&0x7fffffff)%1000000).toString().padStart(6,'0');
};
const differentCode=code=>((Number(code)+1)%1000000).toString().padStart(6,'0');
const state=()=>({accessToken:null,refreshToken:null});
const decodeClaims=token=>JSON.parse(Buffer.from(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'),'base64').toString('utf8'));

async function request(session,method,path,body){
  const response=await fetch(`${url}/auth/v1${path}`,{method,headers:{apikey:key,'Content-Type':'application/json',...(session.accessToken?{Authorization:`Bearer ${session.accessToken}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const text=await response.text();let data=null;try{data=text?JSON.parse(text):null}catch{data=text}
  if(!response.ok)return {data:null,error:new Error(data?.msg||data?.message||data?.error_description||data?.error||`HTTP ${response.status}`)};
  if(data?.access_token){session.accessToken=data.access_token;session.refreshToken=data.refresh_token}
  return {data,error:null};
}

const ok=(result,step)=>{if(result.error)throw new Error(`${step}: ${result.error.message}`);return result.data};
const signIn=(session,email)=>request(session,'POST','/token?grant_type=password',{email,password});
const enroll=(session,name)=>request(session,'POST','/factors',{factor_type:'totp',friendly_name:name});
const challenge=(session,factorId)=>request(session,'POST',`/factors/${factorId}/challenge`,{factorId});
const verify=async(session,factorId,secret,code=totp(secret))=>{
  const started=ok(await challenge(session,factorId),'MFA-Challenge');
  return request(session,'POST',`/factors/${factorId}/verify`,{challenge_id:started.id,code});
};
const factors=session=>request(session,'GET','/user');
const unenroll=(session,factorId)=>request(session,'DELETE',`/factors/${factorId}`);
const refresh=session=>request(session,'POST','/token?grant_type=refresh_token',{refresh_token:session.refreshToken});
const signOut=(session,scope)=>request(session,'POST',`/logout?scope=${scope}`);
const assurance=session=>decodeClaims(session.accessToken).aal||'aal1';
const expectRefreshRejected=async(session,step)=>{const result=await refresh(session);assert.ok(result.error||!result.data?.access_token,`${step}: widerrufene Refresh-Sitzung wurde akzeptiert`)};

async function runAccount(account){
  const primary=state();ok(await signIn(primary,account.email),`${account.label}: Anmeldung`);assert.equal(assurance(primary),'aal1');

  const first=ok(await enroll(primary,'Primärfaktor Test'),`${account.label}: Primärfaktor anlegen`);
  ok(await verify(primary,first.id,first.totp.secret),`${account.label}: Primärfaktor bestätigen`);assert.equal(assurance(primary),'aal2');

  const backup=ok(await enroll(primary,'Ersatzfaktor Test'),`${account.label}: Ersatzfaktor anlegen`);
  ok(await verify(primary,backup.id,backup.totp.secret),`${account.label}: Ersatzfaktor bestätigen`);
  const user=ok(await factors(primary),`${account.label}: Faktoren auflisten`);
  assert.equal(user.factors.filter(f=>f.factor_type==='totp'&&f.status==='verified').length,2);

  const other=state();ok(await signIn(other,account.email),`${account.label}: zweite Sitzung`);assert.equal(assurance(other),'aal1');
  ok(await verify(other,first.id,first.totp.secret),`${account.label}: zweite Sitzung auf AAL2`);assert.equal(assurance(other),'aal2');
  ok(await signOut(primary,'others'),`${account.label}: andere Sitzungen widerrufen`);
  await expectRefreshRejected(other,`${account.label}: andere Sitzung`);

  const invalid=await verify(primary,backup.id,backup.totp.secret,differentCode(totp(backup.totp.secret)));
  assert.ok(invalid.error,`${account.label}: falscher TOTP-Code wurde akzeptiert`);

  ok(await unenroll(primary,first.id),`${account.label}: verlorenen Primärfaktor entfernen`);
  ok(await refresh(primary),`${account.label}: Sitzung nach Faktorentfernung aktualisieren`);
  const recovery=state();ok(await signIn(recovery,account.email),`${account.label}: Wiederherstellungssitzung`);assert.equal(assurance(recovery),'aal1');
  ok(await verify(recovery,backup.id,backup.totp.secret),`${account.label}: Ersatzfaktor verwenden`);assert.equal(assurance(recovery),'aal2');

  const third=state();ok(await signIn(third,account.email),`${account.label}: dritte Sitzung`);
  ok(await verify(third,backup.id,backup.totp.secret),`${account.label}: dritte Sitzung auf AAL2`);
  ok(await signOut(recovery,'global'),`${account.label}: globaler Sitzungswiderruf`);
  await expectRefreshRejected(third,`${account.label}: global widerrufene Sitzung`);
  primary.accessToken=null;primary.refreshToken=null;

  return {account:account.label,verifiedFactors:2,wrongCodeRejected:true,otherSessionRevoked:true,backupRecovery:'aal2',globalSessionRevoked:true};
}

const results=[];for(const account of accounts)results.push(await runAccount(account));
console.log(JSON.stringify({planned:12,executed:12,failed:0,results},null,2));
