const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const path = require('node:path');

(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage();
    await page.route('https://branding.test/',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><head></head><body></body></html>'}));
    await page.goto('https://branding.test/');
    await page.setContent('<meta name="theme-color" content="#08111f"><div id="appShell"><img class="app-brand-img" src="original.svg"></div><div id="sfEmployeePortal"><div class="sf-portal-logo"><img src="original.svg"></div></div><div id="admin"></div>');
    await page.evaluate(()=>{
      const rows={a:{theme_key:'secontec',globe_accents:false},b:{theme_key:'original'}};
      window.savedRows=[];window.uploaded=[];
      window.SFBackend={ready:false,companyId:null,role:'OWNER',user:{id:'user'},updateState(){},client:{
        from(){return {
          select(){return {eq(_key,id){return {single:async()=>({data:{name:id==='a'?'Secontec Services':'Other'}}),maybeSingle:async()=>({data:rows[id]})}}}},
          upsert(row){rows[row.company_id]=row;window.savedRows.push(row);return {select(){return {single:async()=>({data:row})}}}}
        }},
        storage:{from(){return {createSignedUrl:async()=>({data:{signedUrl:''}}),upload:async(path)=>{window.uploaded.push(path);return {}},remove:async()=>({})}}}
      }};
    });
    await page.addScriptTag({path:path.resolve(__dirname,'../assets/corporate-theme-v1.js')});
    assert.equal(await page.locator('html').getAttribute('data-sf-brand'),null);
    await page.evaluate(async()=>{SFBackend.ready=true;SFBackend.companyId='a';await SFCorporateTheme.load()});
    assert.equal(await page.locator('html').getAttribute('data-sf-brand'),'secontec');
    assert.match(await page.locator('.app-brand-img').getAttribute('src'),/secontec-logo-official-white/);
    assert.match(await page.locator('#sfEmployeePortal img').getAttribute('src'),/secontec-logo-official-white/);
    await page.evaluate(()=>{document.querySelector('#sfEmployeePortal .sf-portal-logo').innerHTML='<img src="late-original.svg">'});
    await page.waitForFunction(()=>document.querySelector('#sfEmployeePortal img').getAttribute('src').includes('secontec-logo'));
    await page.evaluate(()=>SFCorporateTheme.renderAdmin(document.getElementById('admin')));
    assert.equal(await page.locator('#sfBrandPreset').inputValue(),'secontec');
    await page.locator('#sfBrandPreviewMode').selectOption('light');
    assert.equal(await page.locator('#sfBrandPreview').getAttribute('data-mode'),'light');
    await page.locator('[data-brand-hex="dark_text"]').fill('invalid');
    await page.locator('#sfSaveBrand').click();
    assert.match(await page.locator('#sfBrandError').textContent(),/RRGGBB/);
    await page.locator('[data-brand-hex="dark_text"]').fill('#FFFFFF');
    const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=2;c.height=2;return c.toDataURL('image/png').split(',')[1]});
    await page.locator('#sfBrandLogo').setInputFiles({name:'logo.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
    await page.waitForFunction(()=>document.querySelector('#sfBrandPreview img').src.startsWith('blob:'));
    await page.locator('#sfSaveBrand').click();
    await page.waitForFunction(()=>window.savedRows.length===1||document.querySelector('#sfBrandError').textContent,{timeout:5000});
    assert.equal(await page.locator('#sfBrandError').textContent(),'');
    assert.equal(await page.evaluate(()=>window.savedRows[0].company_id),'a');
    assert.match(await page.evaluate(()=>window.savedRows[0].logo_path),/^a\/logo-/);
    await page.evaluate(async()=>{SFBackend.companyId='b';await SFCorporateTheme.load()});
    assert.equal(await page.locator('#sfBrandPreset').inputValue(),'original');
    assert.equal(await page.locator('#admin').getAttribute('data-sf-brand-company'),'b');
    assert.equal(await page.locator('html').getAttribute('data-sf-brand'),null);
    assert.equal(await page.locator('html').getAttribute('data-sf-globe-accents'),null);
    assert.equal(await page.locator('.app-brand-img').getAttribute('src'),'original.svg');
    console.log('Browser: entry, company themes, logos, preview and reset passed');
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
