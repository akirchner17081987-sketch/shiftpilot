import {createHash} from 'node:crypto';
import {readFile,writeFile,readdir} from 'node:fs/promises';

export const pages=['index.html','demo.html','demo-abschluss.html','qr-time.html','impressum.html','datenschutz.html','offline.html'];
const hash=text=>createHash('sha256').update(text).digest('hex').slice(0,24);
export async function hardenStaticCsp(output){
 let extracted=0;
 for(const page of pages){
  const file=new URL(page,output);let html=await readFile(file,'utf8');const preload=[];
  const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
  for(const match of scripts.reverse()){
   const [,attributes,body]=match;
   if(/\bsrc\s*=/i.test(attributes)){
    if(body.trim())throw Error('External script has unexpected inline body: '+page);
    continue;
   }
   if(!body.trim())continue;
   // These entries move from the page root to /assets/. Keep relative imports valid.
   const code=body.replace(/(\bfrom\s*['"])\.\/assets\//g,'$1./');
   const name='assets/page-'+page.replace('.html','')+'-'+hash(code)+(/\btype\s*=\s*["']module["']/i.test(attributes)?'.mjs':'.js');
   await writeFile(new URL(name,output),code);
   const tag='<script'+attributes+' src="/'+name+'"></script>';
   preload.push(/\btype\s*=\s*["']module["']/i.test(attributes)?'<link rel="modulepreload" href="/'+name+'">':'<link rel="preload" as="script" href="/'+name+'">');
   html=html.slice(0,match.index)+tag+html.slice(match.index+match[0].length);extracted++;
  }
  if(/\son[a-z]+\s*=/i.test(html))throw Error('Inline event attribute in built page: '+page);
  if(/<script\b(?![^>]*\bsrc\s*=)[^>]*>\s*\S/i.test(html))throw Error('Inline script in built page: '+page);
  if(/(?:src|href)\s*=\s*["']\s*javascript:/i.test(html))throw Error('Executable URL in built page: '+page);
  html=html.replace(/<head([^>]*)>/i,'<head$1>'+preload.reverse().join(''));
  await writeFile(file,html);
 }
 // Also guard HTML templates created later by application modules. Vendor bundles
 // are verified separately against their upstream integrity manifest.
 for(const file of await readdir(new URL('assets/',output))){
  if(!/\.m?js$/.test(file))continue;
  const code=await readFile(new URL('assets/'+file,output),'utf8');
  if(/\son(?:click|change|input|mousedown|focus|keydown)\s*=\s*["']/.test(code)||/setAttribute\(['"]on[a-z]+['"]/.test(code))throw Error('Inline event generation in application module: '+file);
 }
 return extracted;
}
