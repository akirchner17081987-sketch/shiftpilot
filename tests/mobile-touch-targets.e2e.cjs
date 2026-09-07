const { chromium } = require('@playwright/test');

const baseUrl = process.env.SF_TEST_BASE_URL || 'http://127.0.0.1:4175';
const routes = ['/', '/demo.html', '/demo-abschluss.html'];

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  let browserErrors = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) browserErrors.push(message.text());
  });
  page.on('response', response => {
    if (response.status() >= 400 && !response.url().includes('/api/demo-auth')) {
      browserErrors.push(`${response.status()} ${response.url()}`);
    }
  });

  let failed = false;
  for (const route of routes) {
    browserErrors = [];
    await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(800);
    const result = await page.evaluate(() => {
      const selector = [
        'button',
        'a[href]',
        '[role="button"]',
        'summary',
        '[tabindex]:not([tabindex="-1"])',
        'input:not([type="hidden"])',
        'select',
        'textarea',
      ].join(',');
      const controls = [...document.querySelectorAll(selector)].filter(element => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      });
      const undersized = controls.map(element => {
        const rect = element.getBoundingClientRect();
        return {
          element: element.id || element.className || element.tagName,
          text: (element.textContent || '').trim().slice(0, 40),
          href: element.getAttribute('href') || '',
          display: getComputedStyle(element).display,
          minHeight: getComputedStyle(element).minHeight,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      }).filter(control => control.width < 44 || control.height < 44);
      return {
        title: document.title,
        viewport: innerWidth,
        mobileMedia: matchMedia('(max-width: 820px)').matches,
        touchStylesheet: [...document.styleSheets].some(sheet => sheet.href?.includes('mobile-responsive-v1.css')),
        controls: controls.length,
        undersized,
      };
    });
    console.log(`${route} (${result.viewport}px, CSS ${result.touchStylesheet}, Media ${result.mobileMedia}): ${result.controls} Touch-Ziele, ${result.undersized.length} zu klein`);
    if (result.undersized.length) {
      failed = true;
      console.log(JSON.stringify(result.undersized, null, 2));
    }
    if (browserErrors.length) {
      failed = true;
      console.log(`Browserfehler: ${JSON.stringify(browserErrors)}`);
    }
    if (route === '/demo-abschluss.html') {
      await page.screenshot({ path: 'test-results/mobile-touch-targets-390.png', fullPage: true });
    }
  }

  browserErrors = [];
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    document.getElementById('landingPage')?.setAttribute('style','display:none!important');
    document.getElementById('appShell')?.setAttribute('style','display:grid!important');
    document.querySelectorAll('.sf-auth-backdrop,#sfAuthBackdrop,#spAuthDialog').forEach(element => element.remove());
  });
  const toggle=page.locator('#sfMobileManagerNavToggle');
  await toggle.click({ force: true });
  await page.waitForTimeout(250);
  const openState=await page.evaluate(() => {
    const shell=document.getElementById('appShell');
    const sidebar=shell.querySelector('.sidebar');
    const label=sidebar.querySelector('[data-view="schedule"] span:nth-child(2)');
    const toggleButton=document.getElementById('sfMobileManagerNavToggle');
    const toggleRect=toggleButton.getBoundingClientRect();
    const sidebarRect=sidebar.getBoundingClientRect();
    return {
      expanded:toggleButton.getAttribute('aria-expanded'),
      sidebarLeft:Math.round(sidebarRect.left),
      labelVisible:getComputedStyle(label).display!=='none',
      labelled:toggleButton.getAttribute('aria-label'),
      toggleWidth:Math.round(toggleRect.width),
      toggleHeight:Math.round(toggleRect.height),
    };
  });
  console.log(`Manager-Menü offen: ${JSON.stringify(openState)}`);
  if(openState.expanded!=='true'||openState.sidebarLeft<0||!openState.labelVisible||openState.toggleWidth<44||openState.toggleHeight<44)failed=true;
  await page.screenshot({path:'test-results/mobile-manager-navigation-open-390.png',fullPage:false});
  await page.keyboard.press('Escape');
  const closedByEscape=await toggle.getAttribute('aria-expanded');
  console.log(`Manager-Menü nach Escape: ${closedByEscape}`);
  if(closedByEscape!=='false')failed=true;
  await toggle.click({ force: true });
  await page.locator('.sidebar [data-view="employees"]').click();
  await page.waitForTimeout(100);
  const selectionState=await page.evaluate(() => ({
    expanded:document.getElementById('sfMobileManagerNavToggle').getAttribute('aria-expanded'),
    current:document.querySelector('#sfMobileManagerNavToggle small').textContent,
  }));
  console.log(`Manager-Menü nach Bereichsauswahl: ${JSON.stringify(selectionState)}`);
  if(selectionState.expanded!=='false'||selectionState.current!=='Mitarbeiter')failed=true;

  await browser.close();
  if (failed) process.exitCode = 1;
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
