import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page=fs.readFileSync(new URL('../demo.html',import.meta.url),'utf8');
const demo=fs.readFileSync(new URL('../assets/demo-mode-v1.js',import.meta.url),'utf8');
const roles=fs.readFileSync(new URL('../assets/demo-role-switch-v1.js',import.meta.url),'utf8');
const access=fs.readFileSync(new URL('../assets/supabase-employee-access-v1.js',import.meta.url),'utf8');
const portal=fs.readFileSync(new URL('../assets/employee-portal-vertical-layout-v1.js',import.meta.url),'utf8');

test('protected demo loads the perspective switcher',()=>{
  assert.match(page,/scrollbar-design-v1\.js/);
  assert.match(page,/demo-role-switch-v1\.js/);
  assert.match(roles,/sf_demo_session_v1/);
  assert.match(roles,/sf_demo_perspective_v1/);
});

test('manager and employee perspectives use the existing employee portal',()=>{
  assert.match(roles,/B\.openEmployeePortal\(\)/);
  assert.match(roles,/B\.restoreNonEmployeeShell\?\.\(\)/);
  assert.match(access,/B\.restoreNonEmployeeShell=restoreNonEmployeeShell/);
  assert.match(demo,/PERSPECTIVE_KEY/);
  assert.match(demo,/\?'EMPLOYEE':'ADMIN'/);
});

test('employee perspective derives its contents from the shared demo data',()=>{
  assert.match(roles,/EMPLOYEE_NO='D001'/);
  assert.match(roles,/allAssignments=assignments/);
  assert.match(roles,/allAbsences=absences/);
  assert.match(roles,/entries=timeEntries/);
  assert.match(roles,/Demo-Profil:/);
  assert.match(roles,/employee_my_time_account_month/);
  assert.match(roles,/employeeAccount\(args\.p_month\)/);
});

test('perspective selector is clearly labelled and reports its state',()=>{
  assert.match(roles,/role=\"group\"/);
  assert.match(roles,/aria-label=\"Demo-Perspektive wechseln\"/);
  assert.match(roles,/aria-pressed/);
  assert.match(roles,/Manager/);
  assert.match(roles,/Mitarbeiter/);
});

test('employee portal uses the full workspace width',()=>{
  assert.match(portal,/#sfEmployeePortal \.sf-portal-main\{max-width:none/);
  assert.match(roles,/#sfEmployeePortal \.sf-portal-main\{max-width:none!important/);
});
