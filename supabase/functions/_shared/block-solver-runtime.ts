// Version-pinned, single-threaded solver. Only the public Wasm engine is fetched;
// planning input stays in the authenticated worker and never leaves Supabase.
import loadHighs from "npm:highs@1.15.4";
const ASSET="https://schichtfunk.de/assets/vendor/highs-1.15.4-f13134e3e335.wasm";
const SHA256="f13134e3e335e7bad984ff12abeb41e86e0eeeb1752ae8a85322cc6839df8acd";
let loaded:Promise<any>|null=null;
export function loadBlockSolver():Promise<any>{
 if(!loaded)loaded=(async()=>{
  const response=await fetch(ASSET,{signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error("Die zusätzliche Blocksuche konnte nicht geladen werden.");
  const bytes=await response.arrayBuffer();
  if(bytes.byteLength!==3531401)throw Error("Die Blocksuche-Datei ist unvollständig.");
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))).map(v=>v.toString(16).padStart(2,"0")).join("");
  if(digest!==SHA256)throw Error("Die Version der Blocksuche-Datei stimmt nicht überein.");
  return await loadHighs({wasmBinary:new Uint8Array(bytes),print(){},printErr(){}});
 })().catch(error=>{loaded=null;throw error;});
 return loaded;
}
