// Saved address coordinates; company membership and sites come from the signed-in workspace.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SFLocationGeo=api;})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 const normalize=value=>String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ß/g,'ss').replace(/strasse/g,'str').replace(/[^a-z0-9]/g,'');
 function resolve(site){
  if(site?.geocode_status&&site.geocode_status!=='verified')return null;
  if(site?.geocode_address!=null&&site.geocode_address!==site.address)return null;
  const longitude=Number(site?.longitude),latitude=Number(site?.latitude);
  if(site?.longitude!=null&&site?.latitude!=null&&String(site.longitude).trim()!==''&&String(site.latitude).trim()!==''&&Number.isFinite(longitude)&&Number.isFinite(latitude)&&longitude>=-180&&longitude<=180&&latitude>=-90&&latitude<=90)return [longitude,latitude];
  return null;
 }
 return{resolve,normalize};
});
