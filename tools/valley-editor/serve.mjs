import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(fileURLToPath(new URL('../../',import.meta.url))),port=Number(process.argv[2]??4178);
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.gltf':'model/gltf+json','.png':'image/png'};
const server=createServer(async(req,res)=>{
  try {
    const url=new URL(req.url??'/','http://localhost');
    const redirect=pathname=>res.writeHead(302,{'location':pathname+url.search,'cache-control':'no-store'}).end();
    // Keep the browser's base URL aligned with the HTML's relative asset paths.
    if(url.pathname==='/'){redirect('/tools/valley-editor/index.html');return;}
    const pathname=decodeURIComponent(url.pathname);
    let path=resolve(root,`.${pathname}`);
    if(!path.startsWith(root+sep)){res.writeHead(403).end();return;}
    if((await stat(path)).isDirectory()){
      if(!url.pathname.endsWith('/')){redirect(url.pathname+'/');return;}
      path=resolve(path,'index.html');
    }
    const body=await readFile(path);
    res.writeHead(200,{'content-type':mime[extname(path)]??'application/octet-stream','cache-control':'no-store'}).end(body);
  } catch {res.writeHead(404).end('Not found');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Valley Editor: http://127.0.0.1:${server.address().port}/tools/valley-editor/index.html`));
