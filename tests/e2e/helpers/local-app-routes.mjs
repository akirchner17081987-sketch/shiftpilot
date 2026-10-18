// Optional offline app fixture: the real page/assets run against isolated demo data.
import fs from 'node:fs';
import path from 'node:path';
export async function installLocalAppRoutes(page) {
  const root=path.resolve(new URL('../../..',import.meta.url).pathname);
  await page.route('**/*',route=>{
    const u=new URL(route.request().url());
    if(u.hostname!=='localhost')return route.abort();
    const part=u.pathname==='/'?'index.html':u.pathname==='/demo'?'demo.html':u.pathname.slice(1),file=path.join(root,part);
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
    const type={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.json':'application/json'}[path.extname(file)]||'application/octet-stream';
    return route.fulfill({path:file,contentType:type});
  });
}
