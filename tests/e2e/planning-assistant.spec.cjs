const {test,expect}=require('@playwright/test');
test.use({launchOptions:process.env.SF_ASSISTANT_BROWSER_EXECUTABLE?{executablePath:process.env.SF_ASSISTANT_BROWSER_EXECUTABLE}:{}});
const fs=require('fs'),path=require('path');
const {html,root}=require('../browser/planning-assistant-fixture.cjs');
for(const theme of ['dark','light'])test('Planning assistant '+theme+' chat, access and responsive layout',async({page},testInfo)=>{
 const external=[];
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname!=='sf-assistant.test'){external.push(url.href);await route.abort();return;}
  if(url.pathname.startsWith('/assets/')){
   const file=path.join(root,url.pathname);if(!file.startsWith(path.join(root,'assets'))){await route.abort();return;}
   const ext=path.extname(file),contentType={'.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'}[ext]||'application/octet-stream';
   await route.fulfill({contentType,body:fs.readFileSync(file)});return;
  }
  if(url.pathname==='/qa-run.js'){await route.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(root,'tests/browser/planning-assistant-qa.js'))});return;}
  await route.fulfill({contentType:'text/html',body:html});
 });
 await page.goto('http://sf-assistant.test/?theme='+theme);
 await page.waitForFunction(()=>!!window.__qaResults||window.__errors?.length>0,null,{timeout:15000});
 const report=await page.evaluate(()=>({results:window.__qaResults,errors:window.__errors,lastAnswer:document.querySelector('#sfPlanningChatLog .is-answer:last-child')?.textContent}));
 await testInfo.attach('assistant-checks',{body:Buffer.from(JSON.stringify(report,null,2)),contentType:'application/json'});
 expect(report.errors,report.lastAnswer).toEqual([]);expect(report.results.filter(x=>!x.pass)).toEqual([]);expect(external).toEqual([]);
 await testInfo.attach('assistant-'+theme,{body:await page.screenshot(),contentType:'image/png'});
 await page.keyboard.press('Escape');await expect(page.locator('#sfPlanningChat')).not.toBeVisible();
});

for(const theme of ['dark','light'])test('Labeled assistant dock remains visible in Orbit '+theme,async({page})=>{
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname!=='sf-assistant.test'){await route.abort();return;}
  if(url.pathname.startsWith('/assets/')){
   const file=path.join(root,url.pathname);if(!file.startsWith(path.join(root,'assets'))){await route.abort();return;}
   await route.fulfill({contentType:file.endsWith('.css')?'text/css':'application/javascript',body:fs.readFileSync(file)});return;
  }
  if(url.pathname==='/qa-run.js'){await route.fulfill({contentType:'application/javascript',body:''});return;}
  const body=html.replace('</head>','<link rel="stylesheet" href="/assets/orbit-shell-v1.css"></head>').replace('<body>','<body class="sf-orbit-manager"><div id="appShell" class="sf-orbit">').replace('</body>','</div></body>');
  await route.fulfill({contentType:'text/html',body});
 });
 await page.goto('http://sf-assistant.test/?theme='+theme);
 const dock=page.getByRole('button',{name:'Planungsassistent',exact:true});
 await expect(dock).toBeVisible();await expect(dock.locator('strong')).toBeVisible();await expect(dock.locator('small')).toBeVisible();
 expect(await dock.evaluate(el=>el.parentNode===document.body)).toBe(true);
 const bounds=await dock.boundingBox(),viewport=page.viewportSize();
 expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(viewport.width);expect(bounds.y+bounds.height).toBeLessThanOrEqual(viewport.height);
 await dock.click();await expect(page.locator('#sfPlanningChatInput')).toBeFocused();await expect(dock).toHaveAttribute('aria-expanded','true');
 const chat=await page.locator('#sfPlanningChat').boundingBox();expect(chat.y).toBeGreaterThanOrEqual(0);expect(chat.y+chat.height).toBeLessThanOrEqual(bounds.y);
 await page.keyboard.press('Escape');await expect(dock).toBeFocused();await expect(dock).toHaveAttribute('aria-expanded','false');
});
