import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAddress,searchURL,selectPosition,locateStoredSite} from '../supabase/functions/location-geocode/core.mjs';
const address='Beispielstraße 86, 04158 Leipzig-Nord';
const candidate={lat:'51.38',lon:'12.35',display_name:'Synthetic building',address:{road:'Beispielstraße',house_number:'86',postcode:'04158',city:'Leipzig'}};
test('address lookup uses street and postal code, never object/company/contact names',()=>{
 const url=searchURL('https://geocoder.example.invalid/search',address);assert.equal(url.searchParams.get('street'),'Beispielstraße 86');assert.equal(url.searchParams.get('postalcode'),'04158');assert.equal(url.searchParams.get('q'),null);
 assert.equal(parseAddress('Beispielstraße 86'),null);assert.equal(parseAddress('Leipzig'),null);
 assert.equal(parseAddress('Döbichauer Str. 1-3, Halle 23a, 04435 Schkeuditz').house,'1-3');
 assert.equal(parseAddress('Handelszentrum 5/Stk 2, 5101 Bergheim bei Salzburg, Österreich').city,'Bergheim bei Salzburg');
 assert.throws(()=>searchURL('http://geocoder.example.invalid',address));
});
test('only full matching address results become a verified position',()=>{
 assert.equal(selectPosition(address,[candidate]).geocode_status,'verified');
 for(const patch of [{house_number:'860'},{postcode:'04159'},{road:'Andere Straße'},{city:'Berlin'}])assert.equal(selectPosition(address,[{...candidate,address:{...candidate.address,...patch}}]).geocode_status,'not_found');
 for(const patch of [{lat:100},{lon:200},{lat:null},{lat:''}])assert.equal(selectPosition(address,[{...candidate,...patch}]).geocode_status,'not_found');
 assert.equal(selectPosition(address,[candidate,{...candidate,lat:'52.38'}]).geocode_status,'ambiguous');
 assert.equal(selectPosition(address,[candidate,{...candidate,lat:'51.38001'}]).geocode_status,'verified');
 assert.equal(selectPosition(address,[candidate,{...candidate,lat:'51.3825'}]).geocode_status,'verified','several campus buildings at the same complete address share one map location');
 assert.equal(selectPosition('Leipzig',[candidate]).geocode_status,'incomplete');
 assert.equal(selectPosition('Beispielstraße 1-3, 04158 Leipzig',[{...candidate,address:{...candidate.address,house_number:'13'}}]).geocode_status,'not_found');
});
function fixture(patch={}){
 const site={id:'site-a',company_id:'company-a',address,is_active:true,geocode_status:'pending',...patch};
 const calls={reads:[],claims:[],writes:[],requests:[]};let deny=false,stale=false,claim=true;
 function query(mode){const filters=[];return {select(){return this},update(values){this.values=values;return this},eq(...args){filters.push(args);return this},async maybeSingle(){if(mode==='read'){calls.reads.push(filters);return {data:deny?null:{...site}}}calls.writes.push({filters,values:this.values});return {data:stale?null:{...site,...this.values}}}};}
 const args={companyId:site.company_id,siteId:site.id,enabled:true,caller:{from(){return query('read')}},admin:{from(){return query('write')},async rpc(name,params){calls.claims.push({name,params});return {data:claim}}},fetcher:async(url,opts)=>{calls.requests.push({url:String(url),opts});return {ok:true,json:async()=>[candidate]}},now:()=>Date.parse('2026-10-21T17:00:00Z')};
 return {args,site,calls,set deny(v){deny=v},set stale(v){stale=v},set claim(v){claim=v}};
}
test('tenant/role denial performs no privileged writes or external requests',async()=>{
 const f=fixture();f.deny=true;assert.equal((await locateStoredSite(f.args)).status,404);assert.equal(f.calls.claims.length,0);assert.equal(f.calls.requests.length,0);assert.deepEqual(f.calls.reads[0],[['company_id','company-a'],['id','site-a']]);
});
test('external transmission stays disabled until explicitly enabled',async()=>{
 const f=fixture();f.args.enabled=false;assert.equal((await locateStoredSite(f.args)).status,503);assert.equal(f.calls.requests.length,0);assert.equal(f.calls.claims.length,0);
});
test('verified positions and negative cached results never re-query the provider',async()=>{
 for(const patch of [{geocode_status:'verified',geocode_address:address,latitude:51.38,longitude:12.35},{geocode_status:'not_found',geocode_address:address,geocode_retry_at:'2026-10-22T17:00:00Z'}]){
  const f=fixture(patch);assert.equal((await locateStoredSite(f.args)).status,200);assert.equal(f.calls.requests.length,0);assert.equal(f.calls.claims.length,0);
 }
});
test('global rate claim happens before a request; a busy slot does no external work',async()=>{
 const f=fixture();f.claim=false;assert.equal((await locateStoredSite(f.args)).status,429);assert.equal(f.calls.requests.length,0);
});
test('successful result persists only to the original company/site/address snapshot',async()=>{
 const f=fixture();const r=await locateStoredSite(f.args);assert.equal(r.body.site.geocode_status,'verified');assert.equal(f.calls.requests.length,1);assert.equal(f.calls.writes.length,1);
 assert.deepEqual(f.calls.writes[0].filters,[['id','site-a'],['company_id','company-a'],['address',address],['is_active',true]]);
 assert.equal(r.body.site.company_id,'company-a');assert.equal(r.body.site.longitude,12.35);assert.equal(r.body.site.geocode_retry_at,null);
 assert.ok(f.calls.requests[0].opts.headers['User-Agent'].includes('SchichtFunk'));assert.equal(f.calls.requests[0].url.includes('company-a'),false);
});
test('address edits during lookup cannot save stale coordinates',async()=>{
 const f=fixture();f.stale=true;const r=await locateStoredSite(f.args);assert.equal(r.status,409);assert.equal(r.body.site,undefined);
});
test('provider failure is cached for an hour without invented coordinates or raw errors',async()=>{
 const f=fixture();f.args.fetcher=async()=>{throw Error('secret backend detail')};const r=await locateStoredSite(f.args);
 assert.equal(r.body.site.geocode_status,'error');assert.equal(r.body.site.longitude,null);assert.equal(r.body.site.geocode_retry_at,'2026-10-21T18:00:00.000Z');assert.ok(!JSON.stringify(r).includes('secret'));
});
test('incomplete and archived sites never query the provider',async()=>{
 const f=fixture({address:'Leipzig'});assert.equal((await locateStoredSite(f.args)).body.site.geocode_status,'incomplete');assert.equal(f.calls.requests.length,0);
 const g=fixture({is_active:false});assert.equal((await locateStoredSite(g.args)).status,404);assert.equal(g.calls.requests.length,0);
});
