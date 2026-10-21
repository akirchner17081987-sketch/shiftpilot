// Only the stored object address is sent to the configured geocoder.
const normalized=value=>String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ß/g,'ss').replace(/strasse/g,'str').replace(/[^a-z0-9]/g,'');
const houseKey=value=>String(value||'').toLowerCase().replace(/–/g,'-').replace(/\s/g,'');
export function parseAddress(address){
 const text=String(address||'').trim(),postal=text.match(/\b(\d{4,5})\s+([^,]+)(?:,|$)/);
 if(!postal)return null;
 const street=text.slice(0,postal.index).replace(/[\s,–-]+$/,'').split(',')[0].split('/')[0].trim();
 const parts=street.match(/^(.+?)\s+(\d+[a-z]?(?:\s*[-–]\s*\d+[a-z]?)?)$/i);
 if(!parts||!postal[2].trim())return null;
 return {street,road:parts[1],house:parts[2],postcode:postal[1],city:postal[2].trim()};
}
export function searchURL(base,address){
 const parsed=parseAddress(address);if(!parsed)return null;
 const url=new URL(base);if(url.protocol!=='https:'||url.username||url.password)throw Error('Invalid geocoder URL');
 url.searchParams.set('street',parsed.street);url.searchParams.set('postalcode',parsed.postcode);
 url.searchParams.set('format','jsonv2');url.searchParams.set('addressdetails','1');url.searchParams.set('limit','5');
 return url;
}
export function selectPosition(address,candidates){
 const expected=parseAddress(address);if(!expected)return {geocode_status:'incomplete'};
 const matches=(Array.isArray(candidates)?candidates:[]).filter(item=>{
  const a=item.address||{},lat=Number(item.lat),lon=Number(item.lon);
  return item.lat!=null&&item.lon!=null&&String(item.lat).trim()!==''&&String(item.lon).trim()!==''&&Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180&&
   normalized(a.postcode)===normalized(expected.postcode)&&houseKey(a.house_number)===houseKey(expected.house)&&
   [a.road,a.pedestrian,a.residential].some(road=>road&&normalized(road)===normalized(expected.road))&&
   [a.city,a.town,a.village,a.municipality].some(city=>city&&(normalized(city)===normalized(expected.city)||expected.city.toLowerCase().startsWith(String(city).toLowerCase()+'-')||expected.city.toLowerCase().startsWith(String(city).toLowerCase()+' bei ')));
 });
 if(!matches.length)return {geocode_status:'not_found'};
 const first=matches[0],lat=Number(first.lat),lon=Number(first.lon);
 // One campus can contain several buildings/POIs at the same complete address.
 // Keep the provider's first address position; distant same-address hits need review.
 if(matches.some(item=>Math.hypot((Number(item.lat)-lat)*111320,(Number(item.lon)-lon)*111320*Math.cos(lat*Math.PI/180))>500))return {geocode_status:'ambiguous'};
 return {geocode_status:'verified',latitude:lat,longitude:lon,geocode_label:String(first.display_name||'').slice(0,1000),geocode_source:'nominatim'};
}
export async function locateStoredSite({caller,admin,companyId,siteId,enabled=false,baseURL='https://nominatim.openstreetmap.org/search',fetcher=fetch,now=()=>Date.now()}){
 // RLS performs the company-membership and manager-role check BEFORE any service-role write or external request.
 const {data:site,error}=await caller.from('company_locations').select('id,company_id,address,is_active,longitude,latitude,geocode_address,geocode_status,geocode_retry_at,geocode_source,geocode_label').eq('company_id',companyId).eq('id',siteId).maybeSingle();
 if(error||!site||!site.is_active) return {status:404,body:{error:'SITE_NOT_AVAILABLE'}};
 const dto=value=>Object.fromEntries(['id','company_id','address','longitude','latitude','geocode_address','geocode_status','geocode_retry_at','geocode_source','geocode_label'].map(key=>[key,value[key]??null]));
 if(site.geocode_address===site.address&&(site.geocode_status==='verified'||Date.parse(site.geocode_retry_at)>now()))return {status:200,body:{site:dto(site)}};
 if(!enabled)return {status:503,body:{error:'GEOCODING_NOT_ENABLED'}};
 if(!parseAddress(site.address))return {status:200,body:{site:{...dto(site),longitude:null,latitude:null,geocode_status:'incomplete'}}};
 const claim=await admin.rpc('sf_claim_location_geocode',{p_site_id:site.id,p_company_id:companyId,p_address:site.address});
 if(claim.error)throw Error('Geocoding claim failed');
 if(!claim.data)return {status:429,body:{error:'GEOCODING_BUSY',retry_ms:1500}};
 let position;
 try{
  const response=await fetcher(searchURL(baseURL,site.address),{headers:{'User-Agent':'SchichtFunk/1.0 (https://schichtfunk.de; object address geocoding)','Accept':'application/json'},signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Geocoder unavailable');
  position=selectPosition(site.address,await response.json());
 }catch{position={geocode_status:'error'};}
 const checked=new Date(now()).toISOString(),retry=position.geocode_status==='verified'?null:new Date(now()+(position.geocode_status==='error'?3600000:86400000)).toISOString();
 const values={longitude:null,latitude:null,geocode_label:'',geocode_source:'',...position,geocode_address:site.address,geocode_checked_at:checked,geocode_retry_at:retry};
 // Address edits/archive/company changes while the network request is running cannot install stale coordinates.
 const saved=await admin.from('company_locations').update(values).eq('id',site.id).eq('company_id',companyId).eq('address',site.address).eq('is_active',true).select().maybeSingle();
 if(saved.error)throw Error('Geocoding save failed');
 if(!saved.data)return {status:409,body:{error:'SITE_CHANGED'}};
 return {status:200,body:{site:dto(saved.data)}};
}
