export async function waitForDemoReady(page, options = {}) {
  const {
    perspective = true,
    scenarios = false,
    readability = true,
    timeout = 20_000,
  } = options;

  await page.waitForFunction(
    ({ requireReadability }) => {
      const shell = document.getElementById('appShell');
      const backend = window.SFBackend;
      if (!shell || document.documentElement.dataset.sfDemo !== '1') return false;
      if (!backend?.ready || !backend?.client?.__sfDemoLocalClientV1) return false;
      if (document.documentElement.classList.contains('sf-demo-booting')) return false;
      if (requireReadability && !window.__sfDemoReadabilityV1) return false;
      return getComputedStyle(shell).display !== 'none';
    },
    { requireReadability: readability },
    { timeout },
  );

  await page.locator('#appShell').waitFor({ state: 'visible', timeout });
  await page.locator('#sfDemoBadge').waitFor({ state: 'attached', timeout });

  if (perspective || scenarios) {
    await page.waitForFunction(
      () => document.documentElement.dataset.sfDemoDock === '1'
        && !!document.getElementById('sfDemoControlDock'),
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
}

export async function openManagerArea(page, view) {
  const mobileToggle = page.locator('#sfMobileManagerNavToggle');
  if (await mobileToggle.isVisible().catch(() => false)) {
    const expanded = await mobileToggle.getAttribute('aria-expanded');
    if (expanded !== 'true') await mobileToggle.click();
  }

  const target = page.locator(`#appShell .sidebar [data-view="${view}"]`).first();
  await target.waitFor({ state: 'visible', timeout: 10_000 });
  await target.scrollIntoViewIfNeeded();
  await target.click();
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
