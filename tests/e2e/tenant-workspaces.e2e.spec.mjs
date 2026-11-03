import { test, expect } from '@playwright/test';
import { primeDemoSession, waitForDemoReady, demoPerspectiveSwitch } from './helpers/demo-ready.mjs';

test('company palettes reach visible workspaces and dialogs without hiding content', async ({page}, testInfo) => {
  test.setTimeout(90000);
  await primeDemoSession(page);
  await page.route('**/demo-auth', route => route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},status:200,contentType:'application/json',body:JSON.stringify({expiresAt:new Date(Date.now()+3600000).toISOString()})}));
  await page.goto('/demo.html');
  await waitForDemoReady(page);
  const theme={theme_key:'custom',globe_accents:false,dark_primary:'#9147FF',dark_accent:'#B887FF',dark_background:'#151318',dark_surface:'#26232B',dark_text:'#FFFFFF',dark_muted:'#D3CBD8',light_primary:'#6630A4',light_accent:'#7842B4',light_background:'#EEEAF2',light_surface:'#FFFFFF',light_text:'#211C25',light_muted:'#514958'};
  await page.evaluate(theme=>window.SFCorporateTheme.apply(theme),theme);
  await page.locator('#appShell .sidebar [data-view="employees"]').first().evaluate(el=>el.click());
  await expect(page.locator('#view-employees')).toBeVisible();
  await expect(page.locator('#view-employees h1')).toContainText('Mitarbeiter');
  await expect(page.locator('#sfOrbitHome img')).toBeVisible();
  await expect.poll(()=>page.locator('#sfOrbitHome img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
  await expect(page.locator('#view-employees .sp-employee-stat').first()).toHaveCSS('background-color','rgb(38, 35, 43)');
  await expect(page.locator('#view-employees .sp-employee-stat strong').first()).toBeVisible();
  await page.screenshot({path:testInfo.outputPath('manager-dark.png')});
  await page.evaluate(()=>{window.SFDialog.confirm({title:'Prüfung',message:'Beispieltext'});});
  await expect(page.locator('.sf-dialog h2')).toHaveText('Prüfung');
  await expect(page.locator('.sf-dialog-confirm')).toHaveCSS('background-color','rgb(145, 71, 255)');
  await page.locator('.sf-dialog-cancel').click();
  await page.evaluate(()=>{document.documentElement.dataset.sfTheme='light'});
  await expect(page.locator('#view-employees .sp-employee-stat').first()).toHaveCSS('background-color','rgb(255, 255, 255)');
  await expect(page.locator('#view-employees h1')).toBeVisible();
  await page.screenshot({path:testInfo.outputPath('manager-light.png')});
  await page.locator('#appShell .sidebar [data-view="schedule"]').first().evaluate(el=>el.click());
  await expect(page.locator('#view-schedule')).toBeVisible();
  await expect(page.locator('#view-schedule .cal-toolbar')).toHaveCSS('background-color','rgb(255, 255, 255)');
  await expect(page.locator('#view-schedule').getByText('Wochenplanung',{exact:true}).first()).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.style.getPropertyValue('--sf-calendar-icon'))).toContain('%236630A4');
  await demoPerspectiveSwitch(page).locator('[data-demo-perspective="employee"]').click();
  await expect(page.locator('#sfEmployeePortal')).toBeVisible();
  await page.locator('#sfEmployeePortal [data-sf-employee-view="account"]').first().evaluate(el=>el.click());
  await expect(page.locator('#sfEmployeePortal')).toHaveAttribute('data-sf-portal-active','account');
  await expect(page.locator('#sfEmployeePortal .sf-ac-controls')).toHaveCSS('background-color','rgb(255, 255, 255)');
  await expect.poll(()=>page.locator('#sfEmployeePortal input[type="month"].sf-month-shortened').first().evaluate(el=>decodeURIComponent(el.style.getPropertyValue('--sf-month-label-image')))).toContain('#211C25');
  await expect(page.locator('#sfEmployeePortal .sf-ac-head')).toBeVisible();
  await page.screenshot({path:testInfo.outputPath('portal-light.png')});
  await page.evaluate(()=>window.SFCorporateTheme.apply({theme_key:'original'}));
  await expect(page.locator('html')).not.toHaveAttribute('data-sf-brand-ready',/./);
  await expect.poll(()=>page.evaluate(()=>document.documentElement.style.getPropertyValue('--sf-calendar-icon'))).toBe('');
  await page.evaluate(()=>{window.SFDialog.confirm({title:'Original',message:'Beispieltext'});});
  await expect(page.locator('.sf-dialog-confirm')).toHaveCSS('background-color','rgb(49, 205, 176)');
  await page.locator('.sf-dialog-cancel').click();
});

test('Secontec manager areas keep their content visible', async ({page}) => {
  test.setTimeout(120000);
  await primeDemoSession(page);
  await page.route('**/demo-auth', route => route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},status:200,contentType:'application/json',body:JSON.stringify({expiresAt:new Date(Date.now()+3600000).toISOString()})}));
  await page.goto('/demo.html');
  await waitForDemoReady(page);
  await page.evaluate(()=>window.SFCorporateTheme.apply({theme_key:'secontec',globe_accents:true}));
  const views=['schedule','overview','auto','disruptions','marketplace','employees','absence','time','billing','reports','audit','settings'];
  for(const mode of ['dark','light']){
    await page.evaluate(value=>{document.documentElement.dataset.sfTheme=value},mode);
    for(const view of views){
      await page.locator(`#appShell .sidebar [data-view="${view}"], #appShell .side-bottom [data-view="${view}"]`).first().evaluate(el=>el.click());
      const area=page.locator(`#view-${view}.active`);
      await expect(area,mode+' '+view).toBeVisible();
      await expect(area.locator('h1:visible,h2:visible,h3:visible').first(),mode+' '+view+' heading').toBeVisible();
      await expect(page.locator('#sfOrbitHome img'),mode+' '+view+' logo').toBeVisible();
      if(view==='overview')await expect(area.locator('.sf-orbit-hero[data-location-map="true"] .sf-orbit-hero-copy p')).toHaveCSS('color','rgb(198, 205, 211)');
    }
  }
});
