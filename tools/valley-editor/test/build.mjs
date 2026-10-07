import { rollup } from 'rollup';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { haiyuePlugins } from '../../../config/rollup.shared.js';
process.chdir(fileURLToPath(new URL('../../../',import.meta.url)));
await mkdir('artifacts/valley-editor',{recursive:true});
const bundle=await rollup({input:'tools/valley-editor/src/document.ts',plugins:haiyuePlugins({declaration:false,tsconfig:'tools/valley-editor/tsconfig.json'})});
await bundle.write({file:'artifacts/valley-editor/document.mjs',format:'es',inlineDynamicImports:true});
await bundle.close();
