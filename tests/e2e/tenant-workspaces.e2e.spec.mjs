import { test, expect } from '@playwright/test';
import { primeDemoSession, waitForDemoReady, demoPerspectiveSwitch, openEmployeeArea } from './helpers/demo-ready.mjs';

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

test('employee portal areas remain visible with the Secontec palette', async ({page},testInfo) => {
  test.setTimeout(180000);
  await primeDemoSession(page);
  await page.route('**/demo-auth', route => route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},status:200,contentType:'application/json',body:JSON.stringify({expiresAt:new Date(Date.now()+3600000).toISOString()})}));
  await page.goto('/demo.html');
  await waitForDemoReady(page);
  await page.evaluate(()=>window.SFCorporateTheme.apply({theme_key:'secontec',globe_accents:true}));
  await demoPerspectiveSwitch(page).locator('[data-demo-perspective="employee"]').click();
  const portal=page.locator('#sfEmployeePortal');
  await expect(portal).toBeVisible();
  const views=['shifts','disruptions','marketplace','handover','time','changes','swaps','absences','wishes','account','wage','profile','evidence'];
  for(const mode of ['dark','light']){
    await page.evaluate(value=>{document.documentElement.dataset.sfTheme=value},mode);
    await expect.poll(()=>portal.evaluate(el=>getComputedStyle(el).getPropertyValue('--orbit-accent').trim().toUpperCase())).toBe(mode==='dark'?'#EA5A06':'#B74400');
    await expect.poll(()=>portal.evaluate(el=>getComputedStyle(el,'::-webkit-scrollbar-thumb').backgroundColor)).toBe(mode==='dark'?'rgb(234, 90, 6)':'rgb(183, 68, 0)');
    for(const view of views){
      await openEmployeeArea(page,view,20000);
      await expect(portal,mode+' '+view).toHaveAttribute('data-sf-portal-active',view);
      await expect(portal.locator(`[data-sf-portal-section="${view}"]`).first(),mode+' '+view).toBeVisible();
      await expect(portal.locator('.sf-portal-logo img'),mode+' '+view).toBeVisible();
      if(view==='shifts') {
        await portal.locator('#sfMyShiftsMonth .sf-my-view-switch').getByRole('button',{name:'Kalender',exact:true}).click();
        await expect(portal.locator('#sfMyShiftsMonth .sf-my-month-summary > div').first()).toHaveCSS('background-image','none');
        await expect(portal.locator('#sfMyShiftsMonth .sf-my-today .sf-my-day-number i')).toHaveCSS('color',mode==='dark'?'rgb(234, 90, 6)':'rgb(183, 68, 0)');
        const outside=portal.locator('#sfMyShiftsMonth .sf-my-calendar-outside');
        const changedMonth=await outside.count()===0;
        if(changedMonth)await portal.getByRole('button',{name:'Vorheriger Monat',exact:true}).click();
        await expect(outside.first()).toHaveCSS('background-color',mode==='dark'?'rgb(26, 32, 38)':'rgb(255, 255, 255)');
        await expect(outside.first()).toHaveCSS('color',mode==='dark'?'rgb(198, 205, 211)':'rgb(80, 90, 98)');
        if(changedMonth)await portal.getByRole('button',{name:'Aktueller Monat',exact:true}).click();
      }
      if(view==='time') {
        const surface=mode==='dark'?'rgb(26, 32, 38)':'rgb(255, 255, 255)';
        await expect(portal.locator('.sf-qr-scan-inline')).toHaveCSS('background-color',surface);
        await expect(portal.locator('#sfQrBookingsFilter')).toHaveCSS('background-color',surface);
        await expect(portal.locator('.sf-qb-note')).toHaveCSS('border-left-color',mode==='dark'?'rgb(234, 90, 6)':'rgb(183, 68, 0)');
      }
      if(view==='account') {
        const history=portal.locator('#sfEmployeeTimeAccount .sf-ac-actions [data-ac="history"]');
        await expect(history).toHaveCSS('background-color',mode==='dark'?'rgb(26, 32, 38)':'rgb(255, 255, 255)');
        await expect(history).toHaveCSS('border-color',mode==='dark'?'rgb(234, 90, 6)':'rgb(183, 68, 0)');
        await expect(history).toHaveCSS('color',mode==='dark'?'rgb(255, 255, 255)':'rgb(32, 36, 40)');
      }
      if(view==='changes') {
        await expect(portal.locator('#sfEmployeeChanges .sf-ch-filters button').nth(1)).toHaveCSS('background-color',mode==='dark'?'rgb(26, 32, 38)':'rgb(255, 255, 255)');
      }
      if(view==='swaps') {
        await expect(portal.locator('.sf-sx-guide i').first()).toHaveCSS('color',mode==='dark'?'rgb(234, 90, 6)':'rgb(183, 68, 0)');
      }
      if(view==='absences') {
        await expect(portal.locator('.sf-ae3-categories button').first()).toHaveCSS('background-color',mode==='dark'?'rgb(26, 32, 38)':'rgb(255, 255, 255)');
        await portal.locator('.sf-ae3-add').click();
        const modal=page.locator('#sfAbsenceEmployeeV3Modal .sf-ae3-card');
        await expect(modal).toBeVisible();
        await expect(modal).toHaveCSS('background-color',mode==='dark'?'rgb(26, 32, 38)':'rgb(255, 255, 255)');
        await expect(modal.locator('#sfAe3Submit')).toHaveCSS('background-color',mode==='dark'?'rgb(234, 90, 6)':'rgb(183, 68, 0)');
        await expect(modal.locator('#sfAe3Cancel')).toHaveCSS('color',mode==='dark'?'rgb(255, 255, 255)':'rgb(32, 36, 40)');
        await expect(modal.locator('#sfAe3Type')).toHaveCSS('outline-color',mode==='dark'?'rgb(234, 90, 6)':'rgb(183, 68, 0)');
        expect(await modal.locator('#sfAe3From').evaluate(el=>getComputedStyle(el).backgroundImage)).toContain('data:image/svg+xml');
        await page.screenshot({path:testInfo.outputPath(`${mode}-absence-dialog.png`)});
        await page.locator('#sfAe3Cancel').click();
        await expect(modal).toHaveCount(0);
      }
      if(['disruptions','changes','swaps','handover','time','absences','wage','profile','marketplace'].includes(view)) await page.screenshot({path:testInfo.outputPath(`${mode}-${view}.png`)});
    }
  }
});
