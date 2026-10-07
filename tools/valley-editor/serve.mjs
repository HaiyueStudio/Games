import { createServer } from 'node:http';
import { readFile,stat } from 'node:fs/promises';
import { resolve,sep,extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url)),port=Number(process.argv[2]??4178);
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.gltf':'model/gltf+json','.png':'image/png'};
createServer(async(req,res)=>{try{let pathname=decodeURIComponent(new URL(req.url??'/','http://localhost').pathname);if(pathname==='/')pathname='/tools/valley-editor/index.html';let path=resolve(root,`.${pathname}`);if(!path.startsWith(resolve(root)+sep)){res.writeHead(403).end();return;}if((await stat(path)).isDirectory())path=resolve(path,'index.html');res.writeHead(200,{'content-type':mime[extname(path)]??'application/octet-stream','cache-control':'no-store'}).end(await readFile(path));}catch{res.writeHead(404).end('Not found');}}).listen(port,'127.0.0.1',()=>console.log(`Valley Editor: http://127.0.0.1:${port}/tools/valley-editor/index.html`));
