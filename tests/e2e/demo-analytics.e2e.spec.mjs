import { expect, test } from '@playwright/test';

test('demo explains and records only anonymous feature categories',async({page})=>{
  const events=[];
  await page.addInitScript(()=>sessionStorage.setItem('sf_demo_tour_seen_v1','complete'));
  await page.route('**/api/demo-auth',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,expiresAt:new Date(Date.now()+3_600_000).toISOString()})}));
  await page.route('**/api/demo-analytics',async route=>{events.push(route.request().postDataJSON());await route.fulfill({status:204,body:''})});
  await page.goto('/demo');

  const privacy=page.getByRole('button',{name:/Anonyme Auswertung/}).first();
  await expect(privacy).toBeVisible();
  await privacy.click();
  await expect(page.getByRole('heading',{name:'Anonyme Demo-Auswertung'})).toBeVisible();
  await expect(page.locator('#sfDemoPrivacyInfo')).toContainText('Keine Namen, Eingaben, Suchbegriffe, Freitexte');
  await expect(page.locator('#sfDemoPrivacyInfo')).toContainText('Tageszählern');
  await page.getByRole('button',{name:'Verstanden'}).click();

  await page.locator('[data-view="schedule"]').click();
  await page.locator('[data-demo-perspective="employee"]').click();
  await expect.poll(()=>events.some(event=>event.event==='session_started'&&event.value==='manager')).toBe(true);
  expect(events.some(event=>event.event==='area_opened'&&event.value==='schedule')).toBe(true);
  expect(events.some(event=>event.event==='perspective_changed'&&event.value==='employee')).toBe(true);
  for(const event of events)expect(Object.keys(event).sort()).toEqual(['event','value']);
  expect(JSON.stringify(events)).not.toContain('Anna');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
