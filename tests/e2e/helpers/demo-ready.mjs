export async function primeDemoSession(page) {
  await page.addInitScript(() => {
    const path = (location.pathname || '').replace(/\/+$/, '') || '/';
    if (path !== '/demo' && path !== '/demo.html') return;
    sessionStorage.setItem('sf_demo_session_v1', 'active');
    sessionStorage.setItem('sf_demo_tour_seen_v1', 'complete');
  });
}

export async function waitForDemoReady(page, options = {}) {
  const {
    perspective = true,
    scenarios = false,
    readability = true,
    timeout = 20_000,
  } = options;

  // Die Oberfläche selbst ist das belastbare End-to-End-Signal: Der Demo-Kern
  // hält appShell bis zum abgeschlossenen Bootstrap verborgen. Interne Marker
  // können bei späteren Integrations-Reinitialisierungen kurz fehlen und dürfen
  // deshalb keinen ansonsten nutzbaren Browserlauf blockieren.
  await page.waitForFunction(
    () => {
      const html = document.documentElement;
      const shell = document.getElementById('appShell');
      if (!shell || html.dataset.sfDemo !== '1') return false;
      const style = getComputedStyle(shell);
      return style.display !== 'none' && style.visibility !== 'hidden';
    },
    null,
    { timeout },
  );

  await page.locator('#appShell').waitFor({ state: 'visible', timeout });
  await page.locator('#sfDemoBadge').waitFor({ state: 'visible', timeout });

  if (readability) {
    await page.waitForFunction(
      () => window.__sfDemoReadabilityV1 === true
        || !!document.getElementById('sfDemoReadabilityV1Css')
        || !!document.querySelector('style[data-sf-demo-readability],link[data-sf-demo-readability]'),
      null,
      { timeout },
    );
  }

  if (perspective || scenarios) {
    await page.waitForFunction(
      () => !!document.getElementById('sfDemoControlDock'),
      null,
      { timeout },
    );
    await page.locator('#sfDemoControlDock').waitFor({ state: 'visible', timeout });
  }

  if (perspective) {
    await page.locator('#sfDemoPerspectiveSwitch')
      .waitFor({ state: 'visible', timeout });
  }

  if (scenarios) {
    await page.locator('[data-demo-scenarios]')
      .waitFor({ state: 'visible', timeout });
  }

  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

export async function openManagerArea(page, view, timeout = 15_000) {
  const mobileToggle = page.locator('#sfMobileManagerNavToggle');
  if (await mobileToggle.isVisible().catch(() => false)) {
    const expanded = await mobileToggle.getAttribute('aria-expanded');
    if (expanded !== 'true') await mobileToggle.click();
    await page.locator('#appShell').waitFor({ state: 'visible', timeout });
  }

  const target = page.locator(`#appShell .sidebar [data-view="${view}"]`).first();
  await target.waitFor({ state: 'visible', timeout });
  await target.scrollIntoViewIfNeeded();
  await target.click();
  await page.waitForFunction(
    value => document.getElementById(`view-${value}`)?.classList.contains('active'),
    view,
    { timeout },
  );
}

export async function openEmployeeArea(page, view, timeout = 10_000) {
  const portal = page.locator('#sfEmployeePortal');
  await portal.waitFor({ state: 'visible', timeout });

  const visibleTarget = portal.locator(`[data-sf-employee-view="${view}"]:visible`).first();
  if (await visibleTarget.isVisible().catch(() => false)) {
    await visibleTarget.scrollIntoViewIfNeeded();
    await visibleTarget.click();
  } else {
    const toggle = portal.locator('.sf-employee-more-toggle');
    if (await toggle.isVisible().catch(() => false)) {
      if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
      const target = portal.locator(`.sf-employee-more-panel [data-sf-employee-view="${view}"]:visible`).first();
      await target.waitFor({ state: 'visible', timeout });
      await target.scrollIntoViewIfNeeded();
      await target.click();
    } else {
      throw new Error(`Mitarbeiterbereich "${view}" ist in der aktuellen Ansicht nicht erreichbar.`);
    }
  }

  await page.waitForFunction(
    value => document.getElementById('sfEmployeePortal')?.dataset.sfPortalActive === value,
    view,
    { timeout },
  );
}

export function demoPerspectiveSwitch(page) {
  return page.locator('#sfDemoPerspectiveSwitch');
}

export function demoScenarioControl(page) {
  return page.locator('[data-demo-scenarios]');
}

export function demoExitControl(page) {
  return page.locator('#sfDemoControlDock').getByRole('button', { name: 'Demo beenden' });
}
