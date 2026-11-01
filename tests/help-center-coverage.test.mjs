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
 assert.equal(manifest.reviewedAt,manifest.currentAudit.date);
 assert.equal(manifest.currentAudit.articleCount,questions.length);
 assert.equal(manifest.currentAudit.categoryCount,ids.length);
 assert.equal(manifest.currentAudit.baselineArticleCount+manifest.currentAudit.addedArticleCount,questions.length);
 assert.equal(manifest.currentAudit.assetJavaScriptCount,fs.readdirSync(new URL('../assets/',import.meta.url)).filter(f=>f.endsWith('.js')).length);
 assert.deepEqual(Object.keys(h.articles).sort(),[...ids].sort());
 for(const [id] of h.categories)for(const [q,a] of h.articles[id]){assert.ok(q.trim()&&a.trim());assert.ok(!/<script|javascript:/i.test(q+a));}
 for(const row of [...manifest.addedArticles,...(manifest.correctedArticles||[])]){assert.ok(h.articles[row.category].some(a=>a[0]===row.question));for(const source of row.sources)assert.ok(read(source));}
 const assetSources=manifest.moduleInventory.filter(x=>x.source.startsWith('assets/')&&x.source.endsWith('.js')).map(x=>x.source);assert.equal(new Set(assetSources).size,assetSources.length);assert.deepEqual([...assetSources].sort(),fs.readdirSync(new URL('../assets/',import.meta.url)).filter(f=>f.endsWith('.js')).map(f=>'assets/'+f).sort());
 assert.deepEqual(manifest.categoryCoverage.map(x=>({id:x.id,name:x.name,questions:x.questions})),JSON.parse(JSON.stringify(h.categories.map(([id,name])=>({id,name,questions:h.articles[id].map(a=>a[0])})))));
 for(const row of manifest.moduleInventory){assert.ok(ids.includes(row.category));assert.ok(read(row.source));}
 for(const [q,guide] of Object.entries(g)){assert.ok(questions.includes(q));assert.ok(fs.existsSync(new URL('../'+guide.image,import.meta.url)));assert.ok(guide.steps.length&&guide.alt);}
});
test('production help renderer displays each category and finds every added article',()=>{
 const c=content(),nodes=new Map(),listeners={};function node(id){if(!nodes.has(id))nodes.set(id,{value:'',innerHTML:'',textContent:'',hidden:true,addEventListener(type,fn){this[type]=fn;},setAttribute(){},focus(){}});return nodes.get(id);}
 c.document={getElementById:node,querySelector:()=>node('helpButton'),addEventListener(type,fn){listeners[type]=fn;}};c.setTimeout=fn=>fn();
 const html=read('index.html');assert.match(html,/<script defer id="schichtfunk-help-center-v2-js" src="assets\/help-center-renderer-v2\.js/);vm.runInNewContext(read('assets/help-center-renderer-v2.js'),c);
 node('helpButton').click();assert.equal(node('sfHelpModal').hidden,false);
 assert.match(node('sfHelpResults').innerHTML,/Schritt für Schritt/);assert.equal((node('sfHelpNav').innerHTML.match(/data-hgroup=/g)||[]).length,6);
 for(const [id,name] of c.window.SFHelpContent.categories){listeners.click({target:{closest:selector=>selector==='[data-hcat]'?{dataset:{hcat:id}}:null}});assert.equal(node('sfHelpCategoryTitle').textContent,name);for(const [q] of c.window.SFHelpContent.articles[id])assert.ok(node('sfHelpResults').innerHTML.includes(q.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#39;')));}
 for(const row of manifest.addedArticles){node('sfHelpSearch').value=row.question;node('sfHelpSearch').input();assert.ok(node('sfHelpResults').innerHTML.includes(row.question.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#39;')),row.question);}
 for(const [query,question] of [['TEAMLEITER 2FA','Wie erhalten Teamleiter Zugriff auf Personalgespräche?'],['krankheitsgrunde abwesenheit','Wer darf Abwesenheitsanträge und Krankheitsgründe sehen?'],['nacht lohnvorschau','Was berechnet die Lohnvorschau?'],['fortschritt autoplanung','Was bedeutet der Fortschrittsbalken der Auto-Planung?']]){node('sfHelpSearch').value=query;node('sfHelpSearch').input();assert.ok(node('sfHelpResults').innerHTML.includes(question),query);}
 node('sfHelpSearch').value='zzzzkeinartikelzzzz';node('sfHelpSearch').input();assert.ok(node('sfHelpResults').innerHTML.includes('Kein passender Artikel'));
 node('sfHelpClose').click();assert.equal(node('sfHelpModal').hidden,true);
 assert.match(html,/help-center-content-v3\.js\?v=20261016-help-audit1/);assert.match(html,/help-center-renderer-v2\.js\?v=20261012-help-audit1/);
});

test('visible help reflects automatic team-leader scope and the chosen private-data separation',()=>{const {window:{SFHelpContent:h}}=content();const answer=q=>Object.values(h.articles).flat().find(a=>a[0]===q)?.[1];assert.match(answer('Wie erhalten Teamleiter Zugriff auf Personalgespräche?'),/automatisch/);assert.doesNotMatch(answer('Wie erhalten Teamleiter Zugriff auf Personalgespräche?'),/ausdrücklich aus|neu gewählt/);assert.match(answer('Wer kann die Personalakte öffnen?'),/Private Dokumente.*Krankheitsgründe.*gesperrt/);assert.match(answer('Warum kann ein Teamleiter die Akte eines anderen Teamleiters nicht öffnen?'),/ausgeschlossen/);assert.match(answer('Was finde ich im Mitarbeiterportal?'),/Wunschplanung.*Schichtübergabe/);assert.match(answer('Was berechnet die Lohnvorschau?'),/22:00.*06:00/);});
