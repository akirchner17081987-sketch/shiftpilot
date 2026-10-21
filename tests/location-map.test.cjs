const test=require('node:test'),assert=require('node:assert/strict');
const geo=require('../assets/location-map-core-v1.js');
test('only positions stored for the matching current address are rendered',()=>{
 assert.deepEqual(geo.resolve({address:'A 1, 12345 Ort',geocode_address:'A 1, 12345 Ort',geocode_status:'verified',longitude:12.35,latitude:51.38}),[12.35,51.38]);
 assert.equal(geo.resolve({address:'New',geocode_address:'Old',geocode_status:'verified',longitude:12.35,latitude:51.38}),null);
 assert.equal(geo.resolve({address:'A',geocode_address:'A',geocode_status:'pending',longitude:12.35,latitude:51.38}),null);
 assert.equal(geo.resolve({name:'Leipzig',address:'Nonnenstraße 21'}),null);
});
test('a missing or ambiguous address is never assigned an invented map position',()=>{
 for(const site of [{code:'LE',name:'Leipzig'},{name:'Hannover',address:'Neue Straße 8'},{name:'Berlin',address:'Georgstraße 38, 10115 Berlin'},{name:'Leipzig',address:'Nonnenstraße 210, 04229 Leipzig'},null])assert.equal(geo.resolve(site),null);
});
test('explicit validated coordinates are supported without matching another company by code',()=>{
 assert.deepEqual(geo.resolve({longitude:0,latitude:0}),[0,0]);assert.equal(geo.resolve({longitude:200,latitude:95}),null);assert.equal(geo.resolve({longitude:null,latitude:null}),null);assert.equal(geo.resolve({longitude:'',latitude:''}),null);assert.equal(geo.resolve({code:'HUE',name:'Unbekannt'}),null);
});
