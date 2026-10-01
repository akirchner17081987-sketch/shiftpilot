const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'../../',file),'utf8');
async function fixture(page){
  await page.route('https://schichtfunk.de/__date-picker',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="de"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body></body></html>'}));
  await page.goto('https://schichtfunk.de/__date-picker');
  await page.setContent('<main style="padding:16px;font:14px Segoe UI"><h1>Auto-Planung</h1><label>Gewünschter Tag <input type="date" id="day" name="day" value="2026-12-01"></label><label>Gewünschter Monat <input type="month" id="month" value="2026-12"></label><button id="outside" style="position:fixed;right:16px;bottom:16px">Weiter</button></main>');
  await page.addStyleTag({content:read('assets/date-month-controls-v1.css')});
  await page.addStyleTag({content:read('assets/date-picker-v1.css')});
  await page.addScriptTag({content:read('assets/date-picker-v1.js')});
  await page.addScriptTag({content:read('assets/date-month-format-v1.js')});
  await page.evaluate(()=>{window.events=[];for(const name of ['input','change'])document.getElementById('day').addEventListener(name,e=>events.push([name,e.target.value]));window.nativeCalls=0;HTMLInputElement.prototype.showPicker=()=>nativeCalls++});
}
test('day selection retains ISO values and fires input/change exactly once without the native picker',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));await fixture(page);
  await page.locator('#day').click();await expect(page.locator('#sfDatePicker')).toBeVisible();
  await expect(page.locator('#sfPickerTitle')).toHaveText('Dezember 2026');
  await expect(page.locator('.sf-picker-weekdays')).toHaveText('MoDiMiDoFrSaSo');
  await page.locator('#sfDatePicker [data-value="2026-12-15"]').click();
  await expect(page.locator('#day')).toHaveValue('2026-12-15');await expect(page.locator('#sfDatePicker')).toBeHidden();
  expect(await page.evaluate(()=>events)).toEqual([['input','2026-12-15'],['change','2026-12-15']]);expect(await page.evaluate(()=>nativeCalls)).toBe(0);expect(errors).toEqual([]);
});
test('month and year selection supports older birthdays and a change of year',async({page})=>{
  await fixture(page);await page.locator('#month').click();await page.getByLabel('Jahr wählen').fill('2027');await page.getByLabel('Jahr wählen').press('Tab');
  await page.getByRole('button',{name:'Januar 2027',exact:true}).click();await expect(page.locator('#month')).toHaveValue('2027-01');
  await expect(page.locator('#month')).toHaveAttribute('data-sf-month-short','Jan. 2027');
  await page.locator('#day').click();await page.getByRole('button',{name:'Monat und Jahr wählen'}).click();await page.getByLabel('Jahr wählen').fill('1987');await page.getByLabel('Jahr wählen').press('Tab');await page.getByRole('button',{name:'August 1987',exact:true}).click();await page.locator('[data-value="1987-08-17"]').click();await expect(page.locator('#day')).toHaveValue('1987-08-17');
});
test('min/max, step, required, readonly and disabled fields keep their restrictions',async({page})=>{
  await fixture(page);await page.evaluate(()=>{const d=document.getElementById('day');d.min='2026-12-05';d.max='2026-12-15';d.step='2';d.required=true;d.value='2026-12-05'});await page.locator('#day').click();
  for(const day of ['04','06','16'])await expect(page.locator('[data-value="2026-12-'+day+'"]').first()).toBeDisabled();await expect(page.getByRole('button',{name:'Datum leeren'})).toBeDisabled();
  await page.locator('[data-value="2026-12-07"]').click();await expect(page.locator('#day')).toHaveValue('2026-12-07');
  await page.evaluate(()=>document.getElementById('day').readOnly=true);await page.locator('#day').click();await expect(page.locator('#sfDatePicker')).toBeHidden();
  expect(await page.evaluate(()=>{document.getElementById('day').disabled=true;return SFDatePicker.open(document.getElementById('day'))})).toBe(false);
});
test('keyboard month navigation clamps January 31 to leap day and Escape restores focus',async({page})=>{
  await fixture(page);await page.evaluate(()=>document.getElementById('day').value='2028-01-31');await page.locator('#day').focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('PageDown');await page.keyboard.press('Enter');await expect(page.locator('#day')).toHaveValue('2028-02-29');
  await page.locator('#day').focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');await expect(page.locator('#day')).toHaveValue('2028-03-01');
  await page.locator('#day').click();await page.keyboard.press('Escape');await expect(page.locator('#sfDatePicker')).toBeHidden();await expect(page.locator('#day')).toBeFocused();
});
test('dynamic modal fields use the top layer; clearing, outside click and removal close the picker',async({page})=>{
  await fixture(page);await page.evaluate(()=>{const dialog=document.createElement('dialog');dialog.id='absence';dialog.innerHTML='<label>Von <input id="from" type="date" value="2026-12-01"></label>';document.body.append(dialog);dialog.showModal()});await page.locator('#from').click();await page.locator('[data-value="2026-12-10"]').click();await expect(page.locator('#from')).toHaveValue('2026-12-10');
  await page.locator('#from').click();await page.getByRole('button',{name:'Datum leeren'}).click();await expect(page.locator('#from')).toHaveValue('');
  await page.evaluate(()=>document.getElementById('absence').close());await page.locator('#day').click();await page.locator('#outside').click();await expect(page.locator('#sfDatePicker')).toBeHidden();
  await page.locator('#day').click();await page.evaluate(()=>document.getElementById('day').remove());await expect(page.locator('#sfDatePicker')).toBeHidden();
});
test('light/dark mode and narrow screens remain readable and within the viewport',async({page})=>{
  await fixture(page);await page.setViewportSize({width:320,height:568});await page.locator('#day').click();
  const dark=await page.locator('#sfDatePicker').evaluate(node=>getComputedStyle(node).backgroundColor);
  await page.evaluate(()=>document.documentElement.dataset.sfTheme='light');const light=await page.locator('#sfDatePicker').evaluate(node=>getComputedStyle(node).backgroundColor);expect(dark).not.toBe(light);
  const box=await page.locator('#sfDatePicker').boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(320);expect(box.y+box.height).toBeLessThanOrEqual(568);
  await page.screenshot({path:test.info().outputPath('datumsauswahl-hell.png')});
});
