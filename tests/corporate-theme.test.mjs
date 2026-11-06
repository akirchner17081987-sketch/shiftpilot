import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const index=read('index.html'),loader=read('assets/conflict-plausibility-v1.js'),script=read('assets/corporate-theme-v1.js'),style=read('assets/corporate-theme-v1.css'),settings=read('assets/settings-management-v2.js'),migration=read('supabase/migrations/20261103061027_company_branding_white_label.sql'),serviceWorker=read('schichtfunk-sw.js'),apache=read('.htaccess'),vercel=read('vercel.json');

test('corporate theme installs before authenticated boot and leaves entry page unbranded',()=>{
  assert.ok(loader.indexOf("'assets/supabase-auth-v1.js'")<loader.indexOf("'assets/corporate-theme-v1.js'"));
  assert.ok(loader.includes("'assets/corporate-theme-v1.js'"));
  assert.match(script,/if\(!B\.ready\|\|!company\|\|!B\.client\)/);
  assert.doesNotMatch(style,/#sfEntryOverlay|#sfAuth/);
  assert.match(script,/theme_key:'original'/);
});

test('company selection is the only theme scope and users cannot choose a personal brand',()=>{
  assert.match(script,/B\.companyId/);
  assert.match(script,/from\('company_branding'\)/);
  assert.doesNotMatch(script,/localStorage\.(?:getItem|setItem).*brand/i);
  assert.match(settings,/\['branding','◆','Erscheinungsbild'\]/);
  assert.match(settings,/isAdmin/);
});

test('Secontec Services variants share the official orange and official local logo',()=>{
  assert.match(script,/#EA5A06/);
  assert.match(script,/secontec-logo-official-white\.svg/);
  assert.match(migration,/lower\(c\.name\) like 'secontec services%'/);
  assert.ok(fs.statSync(new URL('../assets/secontec-logo-official-white.svg',import.meta.url)).size>1000);
});

test('branding rows and files are tenant-isolated and write-restricted to owners and admins',()=>{
  assert.match(migration,/alter table public\.company_branding enable row level security/);
  assert.match(migration,/cm\.company_id=company_branding\.company_id/);
  assert.match(migration,/cm\.role in \('OWNER','ADMIN'\)/);
  assert.equal((migration.match(/e\.access_status='ACTIVE'/g)||[]).length,2);
  assert.match(migration,/values\('company-branding-assets','company-branding-assets',false,5242880/);
  assert.match(migration,/allowed_mime_types.*'image\/png','image\/jpeg','image\/webp'/s);
  assert.match(migration,/company_id=\(\(storage\.foldername\(name\)\)\[1\]\)::uuid/);
});

function luminance(hex){const c=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2]}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
test('seeded Secontec text colours meet WCAG AA on their backgrounds',()=>{
  for(const [text,background] of [['#FFFFFF','#101418'],['#C6CDD3','#101418'],['#FFFFFF','#1A2026'],['#202428','#E9EDF0'],['#505A62','#E9EDF0'],['#202428','#FFFFFF']])assert.ok(contrast(text,background)>=4.5,`${text} on ${background}`);
  assert.match(script,/Kontrast zu gering/);
  assert.match(script,/contrast\(next\[a\],next\[b\]\)<4\.5/);
});

test('uploads reject active content and enforce size and dimension limits',()=>{
  assert.match(script,/\['image\/png','image\/jpeg','image\/webp'\]/);
  assert.doesNotMatch(script,/image\/svg\+xml/);
  assert.match(script,/2\*1024\*1024/);
  assert.match(script,/createImageBitmap/);
  assert.match(script,/crypto\.randomUUID\(\)/);
  assert.match(script,/upsert:false/);
  assert.match(script,/createSignedUrl\(path,600\)/);
  assert.match(script,/480000/);
});

test('manager, dialogs, employee portal and mobile PWA surfaces use the tenant palette',()=>{
  for(const marker of ['#appShell .sidebar','#appShell .topbar','.absence-modal','.tpl-modal','#sfEmployeePortal','.sf-emp-mobile-dock','.sf-pwa-install-card'])assert.ok(style.includes(marker),marker);
  assert.match(style,/data-sf-theme="dark"/);
  assert.match(style,/data-sf-theme="light"/);
});

test('PWA refreshes tenant branding and CSP permits only the private Supabase image origin',()=>{
  assert.match(serviceWorker,/schichtfunk-shell-v10-pwa/);
  assert.match(serviceWorker,/networkFirst=cspCritical/);
  for(const policy of [apache,vercel])assert.match(policy,/img-src 'self' data: blob: https:\/\/ifgemrtvnmyqaidlxgxb\.supabase\.co/);
  assert.match(script,/delete root\.dataset\.sfGlobeAccents/);
});
