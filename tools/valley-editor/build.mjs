import { rollup } from 'rollup';
import { fileURLToPath } from 'node:url';
import { haiyuePlugins } from '../../config/rollup.shared.js';
process.chdir(fileURLToPath(new URL('../../',import.meta.url)));
const bundle=await rollup({input:'tools/valley-editor/src/main.ts',plugins:haiyuePlugins({declaration:false,tsconfig:'tools/valley-editor/tsconfig.json'})});
await bundle.write({file:'tools/valley-editor/bundle.js',format:'iife',inlineDynamicImports:true,sourcemap:true});
await bundle.close();
console.log('Valley Editor built with public Editor Platform / Shell exports.');
