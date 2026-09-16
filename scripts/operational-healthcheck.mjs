const siteUrl=(process.env.SCHICHTFUNK_SITE_URL||'https://home-5021411544.app-ionos.space').replace(/\/$/,'');
const supabaseUrl=(process.env.SUPABASE_URL||'https://zbvloohfjleadjnqhbbh.supabase.co').replace(/\/$/,'');
const publishableKey=String(process.env.SUPABASE_PUBLISHABLE_KEY||'').trim();
const timeoutMs=Number(process.env.HEALTHCHECK_TIMEOUT_MS||10000);

const checks=[];
const now=new Date().toISOString();

async function request(name,url,{headers={},validate,method='GET'}={}){
  const started=Date.now();
  let lastError;
  for(let attempt=1;attempt<=2;attempt++){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const response=await fetch(url,{method,headers,redirect:'follow',signal:controller.signal,cache:'no-store'});
      const body=method==='HEAD'?'':await response.text();
      clearTimeout(timer);
      const elapsedMs=Date.now()-started;
      if(!response.ok) throw new Error(`HTTP ${response.status}`);
      if(validate) await validate({response,body});
      checks.push({name,url,status:'ok',httpStatus:response.status,elapsedMs,attempt});
      return;
    }catch(error){
      clearTimeout(timer);
      lastError=error;
      if(attempt===1) await new Promise(resolve=>setTimeout(resolve,750));
    }
  }
  checks.push({name,url,status:'failed',error:String(lastError?.message||lastError),elapsedMs:Date.now()-started});
}

await request('IONOS Startseite',`${siteUrl}/`,{
  validate:({response,body})=>{
    if(!/SchichtFunk/i.test(body)) throw new Error('SchichtFunk marker missing');
    const required={
      'content-security-policy':/default-src/i,
      'strict-transport-security':/max-age=/i,
      'x-content-type-options':/nosniff/i
    };
    for(const [header,pattern] of Object.entries(required)){
      const value=response.headers.get(header)||'';
      if(!pattern.test(value)) throw new Error(`security header missing/invalid: ${header}`);
    }
  }
});

await request('PWA Manifest',`${siteUrl}/site.webmanifest`,{
  validate:({body})=>{
    const manifest=JSON.parse(body);
    if(!/SchichtFunk/i.test(String(manifest.name||manifest.short_name||''))) throw new Error('manifest name invalid');
  }
});

await request('Service Worker',`${siteUrl}/schichtfunk-sw.js`,{
  validate:({body})=>{
    if(body.length<100) throw new Error('service worker unexpectedly small');
  }
});

await request('Datenschutzseite',`${siteUrl}/datenschutz.html`,{
  validate:({body})=>{
    if(!/Datenschutz|SchichtFunk/i.test(body)) throw new Error('privacy page marker missing');
  }
});

if(!publishableKey){
  checks.push({name:'Supabase Auth Health',url:`${supabaseUrl}/auth/v1/health`,status:'failed',error:'SUPABASE_PUBLISHABLE_KEY missing'});
}else{
  await request('Supabase Auth Health',`${supabaseUrl}/auth/v1/health`,{
    headers:{apikey:publishableKey},
    validate:({body})=>{
      const payload=JSON.parse(body);
      if(String(payload.name||'').toLowerCase()!=='gotrue') throw new Error('unexpected auth health payload');
    }
  });
}

const failed=checks.filter(check=>check.status!=='ok');
const report={checkedAt:now,siteUrl,supabaseUrl,ok:failed.length===0,checks};
console.log(JSON.stringify(report,null,2));

if(process.env.GITHUB_STEP_SUMMARY){
  const fs=await import('node:fs/promises');
  const lines=[
    '# SchichtFunk Operational Health Check',
    '',
    `Zeitpunkt: ${now}`,
    '',
    '| Prüfung | Status | HTTP | Dauer |',
    '|---|---:|---:|---:|',
    ...checks.map(c=>`| ${c.name} | ${c.status==='ok'?'✅':'❌'} | ${c.httpStatus??'-'} | ${c.elapsedMs??'-'} ms |`),
    '',
    failed.length?'**Ergebnis: FEHLER – Incident-Runbook prüfen.**':'**Ergebnis: alle Prüfungen bestanden.**'
  ];
  await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,lines.join('\n')+'\n');
}

if(failed.length) process.exit(1);
