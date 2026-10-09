import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
function content(){const c={window:{}};vm.runInNewContext(read('assets/help-center-content-v3.js'),c);vm.runInNewContext(read('assets/help-center-guides-v1.js'),c);return c;}
const manifest=JSON.parse(read('documentation/help-center-feature-coverage.json'));
test('all audited features resolve to existing help and implementation sources',()=>{
 const {window:{SFHelpContent:h,SFHelpGuides:g}}=content();const ids=h.categories.map(c=>c[0]);assert.equal(new Set(ids).size,ids.length);
 const questions=Object.values(h.articles).flat().map(a=>a[0]);assert.equal(new Set(questions).size,questions.length);
 assert.deepEqual(Object.keys(h.articles).sort(),[...ids].sort());
 for(const [id] of h.categories)for(const [q,a] of h.articles[id]){assert.ok(q.trim()&&a.trim());assert.ok(!/<script|javascript:/i.test(q+a));}
 for(const row of manifest.addedArticles){assert.ok(h.articles[row.category].some(a=>a[0]===row.question));for(const source of row.sources)assert.ok(read(source));}
 for(const row of manifest.moduleInventory){assert.ok(ids.includes(row.category));assert.ok(read(row.source));}
 for(const [q,guide] of Object.entries(g)){assert.ok(questions.includes(q));assert.ok(read(guide.image).includes('<svg'));assert.ok(guide.steps.length&&guide.alt);}
});
test('production help renderer displays each category and finds every added article',()=>{
 const c=content(),nodes=new Map(),listeners={};function node(id){if(!nodes.has(id))nodes.set(id,{value:'',innerHTML:'',textContent:'',hidden:true,addEventListener(type,fn){this[type]=fn;},setAttribute(){},focus(){}});return nodes.get(id);}
 c.document={getElementById:node,querySelector:()=>node('helpButton'),addEventListener(type,fn){listeners[type]=fn;}};c.setTimeout=fn=>fn();
 const html=read('index.html'),script=html.match(/<script id="schichtfunk-help-center-v2-js">([\s\S]*?)<\/script>/);assert.ok(script);vm.runInNewContext(script[1],c);
 node('helpButton').click();assert.equal(node('sfHelpModal').hidden,false);
 for(const [id,name] of c.window.SFHelpContent.categories){listeners.click({target:{closest:selector=>selector==='[data-hcat]'?{dataset:{hcat:id}}:null}});assert.equal(node('sfHelpCategoryTitle').textContent,name);for(const [q] of c.window.SFHelpContent.articles[id])assert.ok(node('sfHelpResults').innerHTML.includes(q));}
 for(const row of manifest.addedArticles){node('sfHelpSearch').value=row.question;node('sfHelpSearch').input();assert.ok(node('sfHelpResults').innerHTML.includes(row.question),row.question);}
 node('sfHelpSearch').value='zzzzkeinartikelzzzz';node('sfHelpSearch').input();assert.ok(node('sfHelpResults').innerHTML.includes('Kein passender Artikel'));
 node('sfHelpClose').click();assert.equal(node('sfHelpModal').hidden,true);
 for(const file of ['content-v3','guides-v1'])assert.match(html,new RegExp('help-center-'+file+'\\.js\\?v=20261009-help-audit1'));
});
