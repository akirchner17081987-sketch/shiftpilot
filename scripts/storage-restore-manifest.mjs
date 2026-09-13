const sha256Re=/^[a-f0-9]{64}$/i;

function indexManifest(rows,label){
  const map=new Map();
  for(const raw of rows||[]){
    const bucket=String(raw?.bucket||'');
    const path=String(raw?.path||'');
    const size=Number(raw?.size);
    const sha256=String(raw?.sha256||'').toLowerCase();
    if(!bucket||!path||!Number.isSafeInteger(size)||size<0||!sha256Re.test(sha256)){
      throw new Error(`INVALID_${label.toUpperCase()}_MANIFEST`);
    }
    const key=`${bucket}/${path}`;
    if(map.has(key))throw new Error(`DUPLICATE_${label.toUpperCase()}_OBJECT`);
    map.set(key,{bucket,path,size,sha256});
  }
  return map;
}

export function compareStorageManifests(expectedRows,restoredRows){
  const expected=indexManifest(expectedRows,'expected');
  const restored=indexManifest(restoredRows,'restored');
  const missing=[],unexpected=[],mismatched=[];
  for(const [key,item] of expected){
    const actual=restored.get(key);
    if(!actual){missing.push(key);continue}
    if(item.size!==actual.size||item.sha256!==actual.sha256)mismatched.push(key);
  }
  for(const key of restored.keys())if(!expected.has(key))unexpected.push(key);
  missing.sort();unexpected.sort();mismatched.sort();
  return {ok:missing.length===0&&unexpected.length===0&&mismatched.length===0,
    expectedCount:expected.size,restoredCount:restored.size,missing,unexpected,mismatched};
}
