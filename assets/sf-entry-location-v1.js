/* Presentation only: the employee's assigned workplace, never their home address or browser location. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SFEntryLocation = api;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  // Business-site coordinates already verified by location-map-core-v1.js.
  const places = [
    ['Leipzig', [12.3419772, 51.3278275]],
    ['Recklinghausen', [7.1795349, 51.6085523]],
    ['Hürth', [6.9058444, 50.8922173]],
    ['Rent Schkeuditz', [12.20510315, 51.35291425]],
    ['Hannover', [9.7394661, 52.3728319]],
    ['Bergheim', [13.0403314, 47.8424733]]
  ];
  const normalize = value => String(value || '').trim().toLocaleLowerCase('de-DE');
  function resolve(employee) {
    if (!employee || employee.deleted_at || employee.status && employee.status !== 'active') return null;
    const stored = (employee.qualifications || []).find(q => typeof q === 'string' && q.startsWith('__sp:team='));
    const team = normalize(stored ? stored.slice('__sp:team='.length) : employee.team);
    const place = places.find(([name]) => normalize(name) === team);
    return place ? {name: place[0], coordinates: place[1].slice()} : null;
  }
  async function forBackend(backend) {
    const user = backend?.user?.id, company = backend?.companyId;
    if (!(backend?.ready || backend?.shellReady) || !user || !company || !backend.client) return null;
    const own = backend.employeePortalData?.employee || backend.employeeRecord;
    if (own && own.company_id === company && own.auth_user_id === user && Array.isArray(own.qualifications)) return resolve(own);
    try {
      // Managers can also have an employee profile. Read only this account in this company.
      const result = await backend.client.from('employees')
        .select('id,company_id,auth_user_id,status,deleted_at,qualifications')
        .eq('company_id', company).eq('auth_user_id', user).eq('status', 'active')
        .is('deleted_at', null).maybeSingle();
      if (result.error || backend.user?.id !== user || backend.companyId !== company || !(backend.ready || backend.shellReady)) return null;
      if (result.data?.company_id !== company || result.data?.auth_user_id !== user) return null;
      return resolve(result.data);
    } catch (_) { return null; }
  }
  return {resolve, forBackend};
});
