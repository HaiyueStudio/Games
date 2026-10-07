import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('.',import.meta.url));
const port=Number(process.argv[2] ?? 4177);
const types={ '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.gltf':'model/gltf+json', '.png':'image/png' };
const server=createServer(async(request,response)=>{
  try {
    const pathname=decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    const target=resolve(root,`.${pathname==='/'?'/index.html':pathname}`);
    if(!target.startsWith(resolve(root)+sep)) { response.writeHead(403).end(); return; }
    const content=await readFile(target);
    response.writeHead(200,{'content-type':types[extname(target)]??'application/octet-stream','cache-control':'no-store'}).end(content);
  } catch { response.writeHead(404).end('Not found. Run npm run build:target -- game:valley-of-light first.'); }
});
server.listen(port,'127.0.0.1',()=>console.log(`谷外之光 — http://127.0.0.1:${port}/`));
