import assert from 'node:assert/strict';
import test from 'node:test';
import { ValleyAuthoring } from '../../../artifacts/valley-editor/document.mjs';

test('Editor history groups a gesture, restores references, and tracks the saved state',async()=>{
  const editor=new ValleyAuthoring();await editor.start();
  try {
    editor.select(['moving-a','moving-b']);
    const group=editor.groupSelected();
    assert.deepEqual(editor.map.groups.find(g=>g.id===group).position,[-.5,0,3]);
    assert.equal(editor.map.objects.find(o=>o.id==='moving-a').groupId,group);
    editor.platform.history.undo();
    assert.equal(editor.map.objects.find(o=>o.id==='moving-a').groupId,'sliding');
    assert.equal(editor.document.revision,editor.document.savedRevision);
    editor.platform.history.redo();
    editor.document.markSaved();
    editor.removeSelected();
    assert.equal(editor.map.objects.length,7);
    assert.notEqual(editor.document.revision,editor.document.savedRevision);
    editor.platform.history.undo();
    assert.equal(editor.map.objects.length,9);
    assert.equal(editor.document.revision,editor.document.savedRevision);
  } finally {await editor.dispose();}
});

test('split is one Editor transaction and both half-cubes survive JSON export and undo/redo',async()=>{
  const editor=new ValleyAuthoring();await editor.start();
  try {
    editor.select(['moving-a']);const before=editor.exportJSON();editor.splitSelected(3);
    const [a,b]=editor.selected.map(id=>editor.map.objects.find(o=>o.id===id));
    assert.equal(a.prismHalf,'a');assert.equal(b.prismHalf,'b');assert.deepEqual(b.position,a.position.map(v=>v+3));
    assert.equal(editor.map.opticalLinks.at(-1).aEnd,4);const exported=editor.exportJSON();
    editor.platform.history.undo();assert.equal(editor.exportJSON(),before);
    editor.platform.history.redo();assert.equal(editor.exportJSON(),exported);
    editor.importJSON(exported);assert.equal(editor.exportJSON(),exported);
  } finally {await editor.dispose();}
});

test('invalid imports and edits are atomic; valid imports are undoable',async()=>{
  const editor=new ValleyAuthoring();await editor.start();
  try {
    const before=editor.exportJSON();
    const bad=JSON.parse(before);bad.objects[0].type=999;
    assert.throws(()=>editor.importJSON(JSON.stringify(bad)),/未知物体/);
    assert.equal(editor.exportJSON(),before);assert.equal(editor.platform.history.canUndo,false);
    assert.throws(()=>editor.update('start',o=>o.position[0]=NaN),/变换/);
    assert.equal(editor.exportJSON(),before);
    const good=JSON.parse(before);good.name='往山谷之外';editor.importJSON(JSON.stringify(good));
    assert.equal(editor.map.name,'往山谷之外');editor.platform.history.undo();assert.equal(editor.exportJSON(),before);
    const panels=editor.shell.list('panel');assert.equal(panels.length,4);
    assert.equal(editor.platform.documents.snapshot().activeId,'valley-map-document');
  } finally {await editor.dispose();}
});

test('half-cell anchors snap to absolute grid positions and alignment is undoable',async()=>{
  const editor=new ValleyAuthoring();await editor.start();
  try {
    editor.update('moving-a',o=>o.position=[-.5,.5,2.5]);editor.update('moving-b',o=>o.position=[.5,.5,2.5]);
    editor.select(['moving-a','moving-b']);const before=editor.document.serialize();
    const moved=editor.movePreview(before,'moving-a',[1.1,0,.1],1);
    assert.deepEqual(moved.objects.find(o=>o.id==='moving-a').position,[1,.5,3]);
    assert.deepEqual(moved.objects.find(o=>o.id==='moving-b').position,[2,.5,3]);
    assert.deepEqual(editor.document.serialize(),before,'preview must not mutate the document');
    editor.alignSelected(1);assert.deepEqual(editor.map.objects.find(o=>o.id==='moving-a').position,[0,1,3]);
    editor.platform.history.undo();assert.deepEqual(editor.document.serialize(),before);
    editor.select(['start']);editor.duplicate();const copy=editor.map.objects.find(o=>o.id===editor.selected[0]);assert.deepEqual(copy.position,[-2,0,1]);
  } finally {await editor.dispose();}
});


test('corner pillars place individually, follow the host, duplicate and delete atomically',async()=>{
  const editor=new ValleyAuthoring();await editor.start();
  try {
    const a=editor.addPillar('moving-a',0),b=editor.addPillar('moving-a',1);assert.notEqual(a,b);assert.equal(editor.addPillar('moving-a',0),a);
    const exported=editor.exportJSON();editor.select(['moving-a']);editor.duplicate();
    const copy=editor.map.objects.find(o=>editor.selected.includes(o.id)&&o.type===1);assert.equal(editor.map.objects.filter(o=>o.attachment?.pathId===copy.id).length,2);
    editor.platform.history.undo();assert.equal(editor.exportJSON(),exported);editor.select(['moving-a']);editor.removeSelected();assert.ok(!editor.map.objects.some(o=>[a,b,'moving-a'].includes(o.id)));editor.platform.history.undo();assert.equal(editor.exportJSON(),exported);
    editor.select(['moving-a']);editor.splitSelected(3);assert.equal(editor.map.objects.find(o=>o.id===a).attachment,null);assert.deepEqual(editor.map.objects.find(o=>o.id===a).position,[-1.5,0,2.5]);editor.platform.history.undo();assert.equal(editor.exportJSON(),exported);
    const bad=JSON.parse(exported);bad.objects.find(o=>o.id===b).attachment.corner=0;assert.throws(()=>editor.importJSON(JSON.stringify(bad)),/空闲角点/);assert.equal(editor.exportJSON(),exported);
  } finally {await editor.dispose();}
});

test('placing a normal path never duplicates a platform anchor or adds an undo entry on failure',async()=>{
  const editor=new ValleyAuthoring();await editor.start();
  try {
    editor.add(3,[10,0,10]);const before=editor.exportJSON(),history=editor.platform.history.snapshot();
    assert.throws(()=>editor.add(1,[10,0,10]),/相邻空格/);assert.equal(editor.exportJSON(),before);assert.deepEqual(editor.platform.history.snapshot(),history);
    const next=editor.add(1,[11,0,10]);assert.deepEqual(editor.map.objects.find(o=>o.id===next).position,[11,0,10]);
    assert.throws(()=>editor.add(1,[11,0,10]),/相邻空格/);editor.platform.history.undo();assert.equal(editor.exportJSON(),before);
    editor.add(1,[10,1,10]);editor.add(1,[13,3,13]);
  } finally {await editor.dispose();}
});
