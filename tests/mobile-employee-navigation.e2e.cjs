const { chromium } = require('@playwright/test');

const baseUrl = process.env.SF_TEST_BASE_URL || 'http://127.0.0.1:4175';

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push(message.text());
  });
  await page.route('**/api/demo-auth', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString() }),
  }));
  await page.addInitScript(() => {
    sessionStorage.setItem('sf_demo_session_v1', 'active');
    sessionStorage.setItem('sf_demo_perspective_v1', 'employee');
  });
  await page.goto(`${baseUrl}/#app`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.addScriptTag({ url: `${baseUrl}/assets/demo-mode-v1.js` });
  await page.addScriptTag({ url: `${baseUrl}/assets/demo-role-switch-v1.js` });
  await page.locator('#sfEmployeePortal .sf-employee-more-toggle').waitFor({ state: 'visible', timeout: 15000 });

  const compact = await page.evaluate(() => {
    const visible = element => {
      const rect = element.getBoundingClientRect();
      return getComputedStyle(element).display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const nav = document.querySelector('#sfEmployeePortal .sf-employee-nav-scroll');
    const buttons = [...nav.querySelectorAll(':scope > .sf-employee-nav-group > [data-sf-employee-view]')].filter(visible);
    const more = nav.querySelector('.sf-employee-more-toggle');
    return {
      labels: buttons.map(button => button.querySelector('b')?.textContent.trim()),
      columns: getComputedStyle(nav).gridTemplateColumns.split(' ').length,
      moreSize: [Math.round(more.getBoundingClientRect().width), Math.round(more.getBoundingClientRect().height)],
      expanded: more.getAttribute('aria-expanded'),
      horizontalOverflow: nav.scrollWidth > nav.clientWidth + 1,
    };
  });
  console.log(`Kompakte Navigation: ${JSON.stringify(compact)}`);
  if (JSON.stringify(compact.labels) !== JSON.stringify(['Übersicht', 'Meine Schichten', 'Arbeitszeit'])) throw Error('Die mobilen Hauptpunkte stimmen nicht.');
  if (compact.columns !== 4 || compact.moreSize[0] < 44 || compact.moreSize[1] < 44 || compact.expanded !== 'false' || compact.horizontalOverflow) throw Error('Die kompakte Navigation ist nicht korrekt dimensioniert.');

  await page.locator('#sfEmployeePortal .sf-employee-more-toggle').click();
  const dialog = page.locator('#sfEmployeeMorePanel');
  await dialog.waitFor({ state: 'visible' });
  const moreState = await page.evaluate(() => ({
    expanded: document.querySelector('.sf-employee-more-toggle').getAttribute('aria-expanded'),
    items: [...document.querySelectorAll('#sfEmployeeMorePanel [data-sf-employee-view]')].map(button => button.querySelector('b')?.textContent.trim()),
    focusedInside: document.querySelector('#sfEmployeeMorePanel')?.contains(document.activeElement),
  }));
  console.log(`Mehr-Menü offen: ${JSON.stringify(moreState)}`);
  if (moreState.expanded !== 'true' || moreState.items.length !== 8 || !moreState.focusedInside) throw Error('Das Mehr-Menü ist nicht vollständig oder nicht tastaturbereit.');
  await page.screenshot({ path: 'test-results/mobile-employee-navigation-more-390.png', fullPage: false });

  await page.keyboard.press('Escape');
  const closed = await page.locator('.sf-employee-more-toggle').getAttribute('aria-expanded');
  if (closed !== 'false') throw Error('Escape schließt das Mehr-Menü nicht.');
  await page.locator('.sf-employee-more-toggle').click();
  await page.locator('#sfEmployeeMorePanel [data-sf-employee-view="absences"]').click();
  const selected = await page.evaluate(() => ({
    active: document.getElementById('sfEmployeePortal').dataset.sfPortalActive,
    expanded: document.querySelector('.sf-employee-more-toggle').getAttribute('aria-expanded'),
    moreActive: document.querySelector('.sf-employee-more-toggle').classList.contains('active'),
  }));
  console.log(`Auswahl aus Mehr: ${JSON.stringify(selected)}`);
  if (selected.active !== 'absences' || selected.expanded !== 'false' || !selected.moreActive) throw Error('Die Auswahl aus dem Mehr-Menü wurde nicht korrekt übernommen.');
  if (errors.length) throw Error(`Browserfehler: ${JSON.stringify(errors)}`);
  await browser.close();
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
