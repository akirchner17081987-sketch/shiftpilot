import { expect, test } from '@playwright/test';
import { demoPerspectiveSwitch, primeDemoSession, waitForDemoReady } from './helpers/demo-ready.mjs';

test('tenant palette reaches the current manager shell and restores the original', async ({ page }, testInfo) => {
  await primeDemoSession(page);
  await page.route('**/demo-auth', route => route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},status:200,contentType:'application/json',body:JSON.stringify({expiresAt:new Date(Date.now()+3600000).toISOString()})}));
  await page.goto('/demo.html');
  await waitForDemoReady(page);
  await expect.poll(()=>page.evaluate(()=>Boolean(window.SFCorporateTheme))).toBe(true);
  await page.evaluate(()=>window.SFCorporateTheme.apply({theme_key:'secontec',globe_accents:false,dark_primary:'#EA5A06',dark_background:'#101418',dark_surface:'#1A2026',dark_text:'#FFFFFF',dark_muted:'#C6CDD3'}));
  await expect(page.locator('html')).toHaveAttribute('data-sf-brand','secontec');
  await expect(page.locator('#sfOrbitHome img')).toHaveAttribute('src',/secontec-logo-official-white/);
  await expect(page.locator('#appShell')).toBeVisible();
  await expect.poll(()=>page.locator('html').evaluate(el=>getComputedStyle(el).getPropertyValue('--teal').trim().toUpperCase())).toBe('#EA5A06');
  await expect.poll(()=>page.locator('#appShell').evaluate(el=>getComputedStyle(el).getPropertyValue('--orbit-accent').trim().toUpperCase())).toBe('#EA5A06');
  await page.screenshot({path:testInfo.outputPath('secontec.png'),fullPage:true});
  await page.locator('#sfOrbitDock').getByRole('button',{name:'Einstellungen'}).click();
  await page.locator('#sfSettingsV2 [data-setting-tab="branding"]').click();
  await expect(page.locator('#sfBrandPreview')).toBeVisible();
  await expect(page.locator('#sfSettingsV2 .sf-set-head .status')).toHaveText('Für dieses Unternehmen');
  await expect.poll(()=>page.locator('#sfBrandGlobe').evaluate(el=>Math.round(el.getBoundingClientRect().width))).toBe(18);
  await page.evaluate(()=>{document.documentElement.dataset.sfTheme='light'});
  await expect.poll(()=>page.locator('#appShell').evaluate(el=>getComputedStyle(el).getPropertyValue('--orbit-accent').trim().toUpperCase())).toBe('#B74400');
  await demoPerspectiveSwitch(page).locator('[data-demo-perspective="employee"]').click();
  await expect(page.locator('#sfEmployeePortal')).toBeVisible();
  await expect(page.locator('#sfEmployeePortal .sf-portal-logo img')).toHaveAttribute('src',/secontec-logo-official-white/);
  await expect.poll(()=>page.locator('#sfEmployeePortal').evaluate(el=>getComputedStyle(el).getPropertyValue('--orbit-accent').trim().toUpperCase())).toBe('#B74400');
  await page.evaluate(()=>window.SFCorporateTheme.apply({theme_key:'original'}));
  await expect(page.locator('html')).not.toHaveAttribute('data-sf-brand',/./);
  await expect(page.locator('#sfEmployeePortal .sf-portal-logo img')).toHaveAttribute('src',/schichtfunk-company-logo/);
});

test('template dialog follows the tenant palette in dark and light mode', async ({ page }) => {
  await primeDemoSession(page);
  await page.route('**/demo-auth', route => route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},status:200,contentType:'application/json',body:JSON.stringify({expiresAt:new Date(Date.now()+3600000).toISOString()})}));
  await page.goto('/demo.html');
  await waitForDemoReady(page);
  await expect.poll(()=>page.evaluate(()=>Boolean(window.SFCorporateTheme))).toBe(true);
  await page.evaluate(()=>window.SFCorporateTheme.apply({theme_key:'secontec',globe_accents:false}));
  await page.evaluate(()=>{
    const fixture=document.createElement('div');
    fixture.id='brand-legacy-fixture';
    fixture.innerHTML='<div class="sf-plan-context"></div><div class="sf-open-market-entry"></div><div class="sf-abs-mgr-v2 clear"></div><div class="sf-auto-option-status"></div><div class="sf-set-note"></div><div id="view-billing"><div class="sf-datev"></div></div><div id="view-settings"><span class="sf-user-state active">Aktiv</span></div>';
    document.querySelector('#appShell').append(fixture);
  });
  for (const mode of ['dark','light']) {
    await page.evaluate(mode=>{document.documentElement.dataset.sfTheme=mode},mode);
    await page.evaluate(()=>window.openTemplateManager('new'));
    await expect(page.locator('#tplMgr .tpl-modal')).toBeVisible();
    const surface=await page.locator('html').evaluate(el=>getComputedStyle(el).getPropertyValue('--tenant-surface').trim());
    const actual=await page.locator('#tplMgr .tpl-modal').evaluate(el=>getComputedStyle(el).backgroundColor);
    const expected=await page.evaluate(value=>{const x=document.createElement('div');x.style.color=value;document.body.append(x);const c=getComputedStyle(x).color;x.remove();return c},surface);
    expect(actual).toBe(expected);
    for (const selector of ['.sf-plan-context','.sf-open-market-entry','.sf-abs-mgr-v2.clear','.sf-auto-option-status','.sf-set-note','.sf-datev','.sf-user-state.active']) {
      expect(await page.locator('#brand-legacy-fixture '+selector).evaluate(el=>getComputedStyle(el).backgroundColor), selector+' '+mode).toBe(expected);
    }
    await page.locator('#tplMgr .tpl-foot button').filter({hasText:'Schließen'}).click();
  }
  await page.evaluate(()=>window.SFCorporateTheme.apply({theme_key:'original'}));
  await expect(page.locator('html')).not.toHaveAttribute('data-sf-brand-ready','true');
});
