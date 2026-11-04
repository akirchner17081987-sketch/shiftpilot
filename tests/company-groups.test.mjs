import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code=fs.readFileSync(new URL('../assets/company-switcher-v1.js',import.meta.url),'utf8');
const ids=['3dbc2d99-78d7-4b82-bcaf-fe11db8213d3','1f23f5a3-1cbb-430f-af90-36ed34004440','ee0e5c9d-d5ae-48e6-abff-37c179a01929','1e6e00d6-9dd0-4d31-b851-44cb66d85dd5'];
const names=['Secontec Services','Secontec Services - 8h','Secontec Services - 9h','Sicherheitsmanufaktur'];
async function render(allowed,current){
  const list={innerHTML:'',insertAdjacentHTML(){},querySelectorAll(){return []},querySelector(){return null}};
  const header={focus(){}},error={textContent:''};
  const dialog={querySelector(s){return s==='header button'?header:s==='.sf-company-list'?list:error},remove(){}};
  const button={setAttribute(){},querySelector(){return null},focus(){}};
  const document={head:{appendChild(){}},body:{appendChild(){}},getElementById(){return null},createElement(tag){return tag==='style'?{}:dialog},querySelector(s){return s==='button.company-card'?button:null},addEventListener(){}};
  const B={ready:true,user:{id:'fixture'},role:'OWNER',companyId:current,updateState(){},client:{from(table){let id;const q={select(){return q},eq(k,v){if(k==='id')id=v;return q},single(){return Promise.resolve({data:{name:names[ids.indexOf(id)]}})},then(resolve){return Promise.resolve({data:allowed.map(company_id=>({company_id,role:'OWNER',status:'ACTIVE'}))}).then(resolve)}};return q}}};
  vm.runInNewContext(code,{window:{SFBackend:B},document,sessionStorage:{getItem(){return null},setItem(){},removeItem(){}},location:{reload(){}},console});
  await button.onclick();return list.innerHTML;
}
test('Secontec group contains only accessible companies, with independent company separated',async()=>{
 const html=await render([ids[2],ids[0],ids[3]],ids[0]);
 assert.match(html,/<details class="sf-company-group" open>/);assert.match(html,/SECONTEC · part of Clearway/);
 assert.ok(html.indexOf('Secontec Services</b>')<html.indexOf('Secontec Services - 9h</b>'));
 assert.doesNotMatch(html,/Secontec Services - 8h/);assert.match(html,/<div class="sf-company-other">/);assert.match(html,/Sicherheitsmanufaktur/);
});
test('no Secontec group is shown without a matching active membership',async()=>{
 const html=await render([ids[3]],ids[3]);assert.doesNotMatch(html,/SECONTEC · part of Clearway/);assert.match(html,/Sicherheitsmanufaktur/);
});
