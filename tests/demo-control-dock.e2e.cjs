const { chromium } = require('@playwright/test');

const baseUrl = process.env.SF_TEST_BASE_URL || 'http://127.0.0.1:4175';
const scripts = [
  'assets/demo-mode-v1.js',
  'assets/demo-role-switch-v1.js',
  'assets/demo-scenarios-v1.js',
  'assets/demo-reset-v1.js',
  'assets/demo-control-dock-v1.js',
];

async function prepare(page) {
  await page.route('**/api/demo-auth', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString() }),
  }));
  await page.addInitScript(() => {
    sessionStorage.setItem('sf_demo_session_v1', 'active');
    sessionStorage.setItem('sf_demo_perspective_v1', 'manager');
  });
  await page.goto(`${baseUrl}/#app`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  for (const script of scripts) await page.addScriptTag({ url: `${baseUrl}/${script}` });
  await page.locator('#sfDemoControlDock').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('#sfDemoControlDock #sfDemoPerspectiveSwitch').waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(500);
}

async function state(page) {
  return page.evaluate(() => {
    const dock = document.getElementById('sfDemoControlDock');
    const main = document.querySelector('#appShell .main');
    const portalMain = document.querySelector('#sfEmployeePortal .sf-portal-main');
    const rect = dock.getBoundingClientRect();
    const contentRect = (portalMain || main)?.getBoundingClientRect();
    const visible = element => element && getComputedStyle(element).display !== 'none' && element.getBoundingClientRect().height > 0;
    return {
      dockBottom: Math.round(innerHeight - rect.bottom),
      dockHeight: Math.round(rect.height),
      controls: ['#sfDemoBadge', '#sfDemoPerspectiveSwitch', '[data-demo-scenarios]', '#sfDemoResetBtn', '#sfDemoExitBtn', '#sfDemoEmployeeExit'].filter(selector => visible(dock.querySelector(selector))),
      controlDetails: [...dock.querySelectorAll('#sfDemoBadge,#sfDemoPerspectiveSwitch,[data-demo-scenarios],#sfDemoResetBtn,#sfDemoExitBtn,#sfDemoEmployeeExit')].filter(visible).map(element => ({ id: element.id || 'scenarios', text: element.textContent.trim(), color: getComputedStyle(element).color, fontSize: getComputedStyle(element).fontSize, width: Math.round(element.getBoundingClientRect().width) })),
      outside: [...document.querySelectorAll('#sfDemoBadge,#sfDemoPerspectiveSwitch,[data-demo-scenarios],#sfDemoResetBtn,#sfDemoExitBtn,#sfDemoEmployeeExit')].filter(element => !dock.contains(element)).length,
      contentGap: contentRect ? Math.round(rect.top - contentRect.bottom) : -1,
      toolbarLabel: dock.querySelector('[role="toolbar"]')?.getAttribute('aria-label'),
    };
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  for (const config of [
    { name: 'desktop', viewport: { width: 1440, height: 900 } },
    { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  ]) {
    const page = await browser.newPage(config);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await prepare(page);
    const manager = await state(page);
    console.log(`${config.name} Manager: ${JSON.stringify(manager)}`);
    if (manager.controls.length < 5 || manager.outside !== 0 || manager.contentGap < 0 || manager.toolbarLabel !== 'Demo bedienen') throw Error(`${config.name}: Manager-Dock unvollständig oder überdeckt Inhalte.`);
    await page.screenshot({ path: `test-results/demo-control-dock-${config.name}.png`, fullPage: false });

    await page.locator('#sfDemoControlDock [data-demo-perspective="employee"]').click();
    await page.locator('#sfEmployeePortal').waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(300);
    const employee = await state(page);
    console.log(`${config.name} Mitarbeiter: ${JSON.stringify(employee)}`);
    if (employee.controls.length < 5 || employee.outside !== 0 || employee.contentGap < 0) throw Error(`${config.name}: Mitarbeiter-Dock unvollständig oder überdeckt Inhalte.`);
    await page.screenshot({ path: `test-results/demo-control-dock-${config.name}-employee.png`, fullPage: false });
    if (errors.length) throw Error(`${config.name}: ${JSON.stringify(errors)}`);
    await page.close();
  }
  await browser.close();
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
