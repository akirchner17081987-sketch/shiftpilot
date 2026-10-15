const test=require('node:test'),assert=require('node:assert/strict');
const geo=require('../assets/location-map-core-v1.js');
test('the six supplied business addresses resolve to their verified geographic positions',()=>{
 const sites=[{name:'Hürth',address:'Kalscheurener Str. 19 - 50354 Hürth'},{name:'Leipzig',address:'Nonnenstraße 21'},{name:'Recklinghausen',address:'Westring 45 - 45659 Recklinghausen'},{name:'Rent Schkeuditz',address:'Döbichauer Str. 1-3, Halle 23a, 04435 Schkeuditz'},{name:'Secontec Austria GmbH',address:'Handelszentrum 5/Stk 2, 5101 Bergheim bei Salzburg, Österreich'},{name:'SECONTEC GmbH',address:'Georgstraße 38, 30159 Hannover'}];
 const p=sites.map(geo.resolve);assert.ok(p.every(Array.isArray));assert(p[0][0]<p[1][0]);assert(p[3][0]<p[1][0]);assert(p[3][1]>p[1][1]);assert(p[4][1]<p[0][1]);assert(p[5][1]>p[2][1]);
});
test('a missing or ambiguous address is never assigned an invented map position',()=>{
 for(const site of [{code:'LE',name:'Leipzig'},{name:'Hannover',address:'Neue Straße 8'},{name:'Berlin',address:'Georgstraße 38, 10115 Berlin'},{name:'Leipzig',address:'Nonnenstraße 210, 04229 Leipzig'},null])assert.equal(geo.resolve(site),null);
});
test('explicit validated coordinates are supported without matching another company by code',()=>{
 assert.deepEqual(geo.resolve({longitude:0,latitude:0}),[0,0]);assert.equal(geo.resolve({longitude:200,latitude:95}),null);assert.equal(geo.resolve({longitude:null,latitude:null}),null);assert.equal(geo.resolve({longitude:'',latitude:''}),null);assert.equal(geo.resolve({code:'HUE',name:'Unbekannt'}),null);
});
