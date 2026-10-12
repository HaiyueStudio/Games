import {writeFileSync} from 'node:fs';
import {ValleyAuthoring,createValleyEditorApi,chapterTwoRecipe} from '../../artifacts/valley-editor/document.mjs';
// Build the public headless entry first: node tools/valley-editor/test/build.mjs
const editor=new ValleyAuthoring();await editor.start();
try {
  const api=createValleyEditorApi(editor),recipe=chapterTwoRecipe();api.apply(recipe);
  writeFileSync(new URL('../../games/valley-of-light/maps/chapter-two-garden.json',import.meta.url),api.exportJSON());
  writeFileSync(new URL('./recipes/chapter-two.commands.json',import.meta.url),JSON.stringify(recipe,null,2)+'\n');
  console.log(JSON.stringify(api.validate(recipe)));
}finally{await editor.dispose();}
