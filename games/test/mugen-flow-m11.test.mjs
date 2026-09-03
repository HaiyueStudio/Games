import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({ resolve(specifier, context, nextResolve) { const relativeWithoutExtension = /^\.{1,2}\//u.test(specifier) && !/\.[a-z0-9]+$/iu.test(specifier); return nextResolve(relativeWithoutExtension ? `${specifier}.ts` : specifier, context); } });

const { resolveMugenDrawScale, mugenCharacterToStageScale, mugenStageViewportTransform } = await import('../mugen/game/MugenCharacterScale.ts');

test('M11 character scale follows MUGEN localcoord and CNS [Size]', () => {
  assert.deepEqual(resolveMugenDrawScale({}), [1, 1]);
  assert.deepEqual(resolveMugenDrawScale({ 'size.xscale': .5, 'size.yscale': .5 }), [.5, .5]);
  assert.deepEqual(mugenCharacterToStageScale([320, 240], [320, 240], [.5, .5]), [.5, .5]);
  assert.deepEqual(mugenCharacterToStageScale([320, 240], [1280, 720], [1, 1]), [.25, 1 / 3]);
  assert.throws(() => resolveMugenDrawScale({ 'size.xscale': 0 }), /positive/u);
});

test('M11 viewport keeps stage aspect ratio and centers its render area', () => {
  assert.deepEqual(mugenStageViewportTransform({ width: 1920, height: 1080 }, [320, 240]), { scale: 4.5, offsetX: 240, offsetY: 0 });
  assert.deepEqual(mugenStageViewportTransform({ width: 1280, height: 720 }, [1280, 720]), { scale: 1, offsetX: 0, offsetY: 0 });
});

test('M11 game flow is rendered through Haiyue GUI from title to fight', () => {
  const html = read('../mugen/index.html'); const flow = read('../mugen/game/MugenFlowUi.ts'); const main = read('../mugen/main.ts');
  assert.match(html, /id="flow-canvas"/u);
  for (const text of ['单人模式', '双人模式', 'AI 对战', '设置', '选择角色', '选择舞台', '进入战斗']) assert.match(flow, new RegExp(text, 'u'));
  assert.match(flow, /HaiyueEngine/u); assert.match(flow, /GuiSystem/u); assert.match(main, /#flowScreen/u); assert.match(main, /mugenCharacterToStageScale/u); assert.match(main, /actionNumber: 0/u);
});

function read(path) { return readFileSync(new URL(path, import.meta.url), 'utf8'); }
