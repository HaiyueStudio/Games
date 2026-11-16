import {readFileSync,writeFileSync} from 'node:fs';
import {ValleyAuthoring,createValleyEditorApi,mixAndJamRecipe} from '../../artifacts/valley-editor/document.mjs';
const source=JSON.parse(readFileSync(new URL('./sources/mixandjam/scene.json',import.meta.url),'utf8'));
const editor=new ValleyAuthoring();await editor.start();
try{const api=createValleyEditorApi(editor),recipe=mixAndJamRecipe(source);api.apply(recipe);
writeFileSync(new URL('./recipes/mixandjam.commands.json',import.meta.url),JSON.stringify(recipe,null,2)+'\n');
writeFileSync(new URL('../../games/valley-of-light/maps/mixandjam-monument.json',import.meta.url),api.exportJSON());
console.log(api.validate(recipe));}finally{await editor.dispose();}
