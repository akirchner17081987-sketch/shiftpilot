import { expect, test } from '@playwright/test';
import { demoPerspectiveSwitch, openEmployeeArea, openManagerArea, primeDemoSession, waitForDemoReady } from './helpers/demo-ready.mjs';

test('demo switches between manager workspace and the existing employee portal', async ({ page }) => {
  await primeDemoSession(page);
  await page.route('**/demo-auth', async route => {
    await route.fulfill({headers:{'Access-Control-Allow-Origin':'*'}, status: 200, contentType: 'application/json', body: JSON.stringify({ expiresAt: new Date(Date.now() + 3_600_000).toISOString() }) });
  });
  await page.goto('/demo');
  await waitForDemoReady(page);

  const managerSwitch = demoPerspectiveSwitch(page);
  await expect(managerSwitch).toBeVisible();
  await expect(managerSwitch.locator('[data-demo-perspective="manager"]')).toHaveAttribute('aria-pressed', 'true');
  await managerSwitch.locator('[data-demo-perspective="employee"]').click();

  const portal = page.locator('#sfEmployeePortal');
  await expect(portal).toBeVisible();
  await expect(portal).toContainText('Mitarbeiterportal');
  await expect(portal).toContainText('Anna Becker');
  await expect(portal).not.toContainText('permission denied');
  await expect(page.locator('#appShell')).toHaveCount(0);
  await expect(demoPerspectiveSwitch(page).locator('[data-demo-perspective="employee"]')).toHaveAttribute('aria-pressed', 'true');
  const upcoming=portal.locator('.sf-portal-stat').filter({hasText:'Kommende Schichten'}).locator('strong');
  const nextShift=portal.locator('.sf-portal-stat').filter({hasText:'Nächste Schicht'}).locator('strong');
  const plannedHours=portal.locator('.sf-portal-stat').filter({hasText:'Geplante Stunden'}).locator('strong');
  await expect(upcoming).not.toHaveText('0');
  await expect(nextShift).not.toHaveText('–');
  await expect(plannedHours).not.toHaveText('0.0 h');
  await openEmployeeArea(page,'disruptions');
  const disruptions=portal.locator('[data-sf-portal-section="disruptions"]');
  await expect(disruptions).toBeVisible();
  await expect(disruptions).toContainText('2 offen');
  await expect(disruptions).toContainText('Kurzfristige Krankmeldung');
  await expect(disruptions).toContainText('Dringender Ersatz für den Spätdienst');
  await disruptions.locator('[data-decline]').first().click();
  await page.getByRole('dialog').getByRole('button',{name:'Ablehnen'}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(disruptions).toContainText('Abgelehnt');
  await disruptions.locator('[data-accept]').first().click();
  await page.getByRole('dialog').getByRole('button',{name:'Verbindlich übernehmen'}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(disruptions).toContainText('Übernommen');
  await openEmployeeArea(page,'shifts');
  await expect(portal.locator('.sf-shift-item').first()).toBeVisible();
  expect(await portal.locator('.sf-shift-item').count()).toBeGreaterThanOrEqual(2);
  const offerButton=portal.locator('.sf-market-offer').filter({hasText:'Im Marktplatz anbieten'}).first();
  await expect(offerButton).toBeVisible({timeout:15_000});
  await offerButton.click();
  await page.getByRole('button',{name:'Angebot veröffentlichen'}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await openEmployeeArea(page,'marketplace');
  const market=portal.locator('[data-sf-portal-section="marketplace"]');
  await expect(market).toBeVisible();
  await expect(market).toContainText('Verfügbare Schichten');
  await expect(market).toContainText('Eigenes Angebot');
  await expect(portal.locator('.sf-employee-view-empty')).toBeHidden();
  const availableBefore=await market.locator('[data-take]').count();
  expect(availableBefore).toBeGreaterThan(0);
  await market.locator('[data-take]').first().click();
  await page.getByRole('button',{name:'Zur Prüfung einreichen'}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(market).toContainText('Freigabe ausstehend');
  const scrollbar = await portal.locator('.sf-portal-main').evaluate(element => ({
    firefox: getComputedStyle(element).scrollbarColor,
    maxWidth: getComputedStyle(element).maxWidth,
    width: getComputedStyle(element, '::-webkit-scrollbar').width,
    thumb: getComputedStyle(element, '::-webkit-scrollbar-thumb').backgroundColor,
  }));
  expect(scrollbar.firefox).not.toBe('auto');
  expect(scrollbar.maxWidth).toBe('none');
  expect(['7px','9px']).toContain(scrollbar.width);
  expect(scrollbar.thumb).not.toBe('rgba(0, 0, 0, 0)');

  await demoPerspectiveSwitch(page).locator('[data-demo-perspective="manager"]').click();
  await expect(portal).toHaveCount(0);
  await expect(page.locator('#appShell')).toBeVisible();
  await expect(demoPerspectiveSwitch(page).locator('[data-demo-perspective="manager"]')).toHaveAttribute('aria-pressed', 'true');

  await demoPerspectiveSwitch(page).locator('[data-demo-perspective="employee"]').click();
  await expect(page.locator('#sfEmployeePortal')).toBeVisible();
  await demoPerspectiveSwitch(page).locator('[data-demo-perspective="manager"]').click();
  await expect(page.locator('#appShell')).toBeVisible();
});

test('demo employee can review and confirm presentation shift changes', async ({ page }) => {
  await primeDemoSession(page);
  await page.route('**/demo-auth', async route => {
    await route.fulfill({headers:{'Access-Control-Allow-Origin':'*'}, status: 200, contentType: 'application/json', body: JSON.stringify({ expiresAt: new Date(Date.now() + 3_600_000).toISOString() }) });
  });
  await page.goto('/demo');
  await waitForDemoReady(page);
  await demoPerspectiveSwitch(page).locator('[data-demo-perspective="employee"]').click();

  const portal=page.locator('#sfEmployeePortal');
  await openEmployeeArea(page,'changes');
  const changes=portal.locator('[data-sf-portal-section="changes"]');
  await expect(changes).toBeVisible();
  await expect(changes.locator('.sf-change-card')).toHaveCount(3);
  await expect(changes).toContainText('Antwort erforderlich');
  await expect(changes).toContainText('Übernommen');
  await expect(changes).toContainText('Abgelehnt');
  await expect(portal.locator('[data-count-for="changes"]').first()).toHaveText('3');

  page.once('dialog',dialog=>dialog.accept());
  await changes.locator('[data-sf-change-decision="APPROVED"]').click();
  await expect(changes).toContainText('Bestätigt');
  await expect(changes.locator('[data-sf-change-decision]')).toHaveCount(0);
});

test('demo employee sees absence examples and can submit a local request', async ({ page }) => {
  await primeDemoSession(page);
  await page.route('**/demo-auth', async route => {
    await route.fulfill({headers:{'Access-Control-Allow-Origin':'*'}, status: 200, contentType: 'application/json', body: JSON.stringify({ expiresAt: new Date(Date.now() + 3_600_000).toISOString() }) });
  });
  await page.goto('/demo');
  await waitForDemoReady(page);
  await demoPerspectiveSwitch(page).locator('[data-demo-perspective="employee"]').click();

  const portal=page.locator('#sfEmployeePortal');
  await openEmployeeArea(page,'absences');
  const absences=portal.locator('[data-sf-portal-section="absences"]');
  await expect(absences.locator('.sf-ae3-row')).toHaveCount(3);
  await expect(absences).toContainText('Fortbildung');
  await expect(absences).toContainText('In Prüfung');
  await expect(absences).toContainText('Urlaub');
  await expect(absences).toContainText('Genehmigt');
  await expect(absences).toContainText('Abgelehnt');

  await absences.getByRole('button',{name:'Antrag stellen'}).click();
  const dialog=page.getByRole('dialog',{name:'Abwesenheit melden'});
  await dialog.locator('#sfAe3Type').selectOption({label:'Sonderurlaub'});
  await dialog.locator('#sfAe3Note').fill('Demo-Antrag zur Präsentation');
  await dialog.getByRole('button',{name:'Antrag senden'}).click();
  await expect(dialog).toHaveCount(0);
  await expect(absences.locator('.sf-ae3-row')).toHaveCount(4);
  await expect(absences).toContainText('Sonderurlaub');
  await expect(absences).toContainText('Demo-Antrag zur Präsentation');
});

test('demo time tracking persists employee entries and monthly accounts render', async ({ page }, testInfo) => {
  await primeDemoSession(page);
  await page.route('**/demo-auth', async route => {
    await route.fulfill({headers:{'Access-Control-Allow-Origin':'*'}, status: 200, contentType: 'application/json', body: JSON.stringify({ expiresAt: new Date(Date.now() + 3_600_000).toISOString() }) });
  });
  await page.goto('/demo');
  await waitForDemoReady(page);
  await demoPerspectiveSwitch(page).locator('[data-demo-perspective="employee"]').click();

  const portal=page.locator('#sfEmployeePortal');
  await openEmployeeArea(page,'time');
  const timeCard=portal.locator('#sfEmployeeTimeCard');
  await expect(timeCard.locator('.sf-time-item')).toHaveCount(6);
  await expect(timeCard).toContainText('Zur Prüfung');
  await expect(timeCard).toContainText('Bestätigt');
  await expect(timeCard).toContainText('Korrektur nötig');
  await expect(timeCard).toContainText('7,50 Std.');
  if(testInfo.project.name==='desktop-chromium')await page.screenshot({path:testInfo.outputPath('arbeitszeiterfassung-demo-geprueft.png')});

  const editable=timeCard.locator('[data-time-report]').first();
  const item=editable.locator('xpath=ancestor::*[@data-emp-time]');
  await editable.click();
  const dialog=page.locator('#sfTimeModal');
  await dialog.locator('#sfTimeNote').fill('Persistenzprüfung Demo');
  await dialog.locator('.sf-time-confirm').click();
  await expect(dialog).toHaveCount(0);
  await expect(item).toContainText('Zur Prüfung');

  await openEmployeeArea(page,'account');
  const account=portal.locator('#sfEmployeeTimeAccount');
  await expect(account).toBeVisible();
  const current=await account.locator('.sf-ta-employee-grid').innerText();
  await account.locator('.sf-ta-employee-month').fill('2026-08');
  await account.locator('.sf-ta-employee-month').dispatchEvent('change');
  await expect(account.locator('.sf-ta-employee-month')).toHaveValue('2026-08');
  await expect.poll(()=>account.locator('.sf-ta-employee-grid').innerText()).not.toBe(current);

  await demoPerspectiveSwitch(page).locator('[data-demo-perspective="manager"]').click();
  await openManagerArea(page,'reports');
  const managerAccount=page.locator('#sfTimeAccounts');
  await expect(managerAccount).toBeVisible();
  await expect(managerAccount.locator('#sfTaBody tr')).toHaveCount(8);
  await expect(managerAccount.locator('.sf-ta-empty')).toHaveCount(0);
  await expect(page.locator('#sfTaMonth')).toHaveCount(1);
  await expect(page.locator('#sfDatevMonth')).toHaveCount(1);
  const accountTab=managerAccount.locator('[data-sf-ta-tab="account"]');
  const datevTab=managerAccount.locator('[data-sf-ta-tab="datev"]');
  await expect(accountTab).toHaveAttribute('aria-selected','true');
  await expect(managerAccount.locator('#sfTaAccountPane')).toBeVisible();
  await expect(managerAccount.locator('#sfTaDatevPane')).toBeHidden();
  await datevTab.click();
  await expect(datevTab).toHaveAttribute('aria-selected','true');
  await expect(managerAccount.locator('#sfTaAccountPane')).toBeHidden();
  await expect(managerAccount.locator('#sfTaDatevPane')).toBeVisible();
  await accountTab.click();
  await expect(managerAccount.locator('#sfTaAccountPane')).toBeVisible();
  if(testInfo.project.name==='desktop-chromium')await managerAccount.screenshot({path:testInfo.outputPath('stundenkonto-manager-geprueft.png')});
});
