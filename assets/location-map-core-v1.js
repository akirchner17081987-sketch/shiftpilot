// Public address coordinates; company membership and names always come from the signed-in workspace.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SFLocationGeo=api;})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 const normalize=value=>String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ß/g,'ss').replace(/strasse/g,'str').replace(/[^a-z0-9]/g,'');
 const addresses=[
  ['kalscheurenerstr19',[6.9058444,50.8922173],['50354','hurth']],['nonnenstr21',[12.3419772,51.3278275],['04229','leipzig']],
  ['westring45',[7.1795349,51.6085523],['45659','recklinghausen']],['dobichauerstr13',[12.20510315,51.35291425],['04435','schkeuditz']],
  ['handelszentrum5',[13.0403314,47.8424733],['5101','bergheim']],['georgstr38',[9.7394661,52.3728319],['30159','hannover']]
 ];
 function resolve(site){
  const longitude=Number(site?.longitude),latitude=Number(site?.latitude);
  if(site?.longitude!=null&&site?.latitude!=null&&String(site.longitude).trim()!==''&&String(site.latitude).trim()!==''&&Number.isFinite(longitude)&&Number.isFinite(latitude)&&longitude>=-180&&longitude<=180&&latitude>=-90&&latitude<=90)return [longitude,latitude];
  const address=normalize(site?.address);if(!address)return null;
  const name=normalize(site?.name),words=String(site?.address||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ß/g,'ss').replace(/strasse/g,'str').replace(/[^a-z0-9]/g,' ');
  const match=addresses.find(([key,,places])=>{const street=key.replace(/\d+$/,'').replace(/str$/,'\\s*str'),number=key.match(/\d+$/)[0],house=number==='13'?'1\\s*3':number;return new RegExp(street+'\\s*'+house+'\\b').test(words)&&places.some(place=>address.includes(place)||name.includes(place));});return match?match[1].slice():null;
 }
 return{resolve,normalize};
});
