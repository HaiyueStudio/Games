/** Run with a documented Codex browser tab, e.g.
 * await (await import('/.../Games/games/led-sudoku/browser-smoke.mjs')).run(tab)
 * Uses only visible DOM, public inputs and screenshots; no game-state backdoor.
 */
import assert from 'node:assert/strict';
export async function run(tab, origin = 'http://127.0.0.1:8317') {
  const p = tab.playwright;
  const text = id => p.locator(`#${id}`).textContent();
  await tab.goto(`${origin}/games/led-sudoku/?seed=20260920`);
  await p.locator('#busy').waitFor({ state: 'hidden', timeoutMs: 15000 });
  assert.match(await text('progress'), /25 \/ 81/);
  assert.match(await text('candidate-info'), /3 个规则候选 → 1 个 LED 候选/);
  assert.match(await text('candidate-info'), /7、9/);
  assert.match(await p.locator('#timer').getAttribute('aria-label'), /用时 \d+:\d{2}/);
  const rows = await p.evaluate(() => [...document.querySelectorAll('#keypad button')].map(e => Math.round(e.getBoundingClientRect().top)));
  assert.equal(new Set(rows).size, 3);
  assert.equal(rows[0], rows[2]); assert.equal(rows[3], rows[5]); assert.equal(rows[6], rows[8]);
  await p.locator('#notes').click(); await p.locator('#digit-6').click();
  assert.match(await text('status'), /候选笔记/);
  await p.locator('#notes').click(); await p.locator('#digit-6').click();
  assert.match(await text('progress'), /26 \/ 81/);
  await p.locator('#undo').click(); assert.match(await text('progress'), /25 \/ 81/);
  await p.locator('#explain').click(); assert.match(await text('status'), /R1C3 只剩 6/);
  await p.locator('#board').press('6'); assert.match(await text('progress'), /26 \/ 81/);
  await tab.goto(`${origin}/games/led-sudoku/`);
  await p.locator('#busy').waitFor({ state: 'hidden', timeoutMs: 15000 });
  assert.match(await text('progress'), /26 \/ 81/); assert.match(await text('status'), /已恢复/);
  await p.locator('#erase').click(); assert.match(await text('progress'), /25 \/ 81/);
  await p.locator('#solve').click(); await p.locator('#cancel-confirm').click(); assert.match(await text('progress'), /25 \/ 81/);
  await p.locator('#solve').click(); await p.locator('#accept-confirm').click(); assert.match(await text('status'), /辅助完成/);
  assert.match(await p.locator('#board-frame').getAttribute('class'), /is-complete/);
  await p.locator('#undo').click(); assert.match(await text('progress'), /25 \/ 81/);
  assert.doesNotMatch(await p.locator('#board-frame').getAttribute('class'), /is-complete/);
  await p.locator('#new').click();
  await p.locator('#led').uncheck();
  await p.locator('#cancel-new').click();
  assert.match(await text('mode-label'), /LED/);
  await p.locator('#new').click();
  assert.equal(await p.evaluate(() => document.querySelector('#led').checked), true);
  for (const rule of ['diagonal', 'missing', 'killer', 'renban', 'consecutive']) await p.locator(`#${rule}`).check();
  await p.locator('#start-new').click();
  await p.locator('#busy').waitFor({ state: 'hidden', timeoutMs: 15000 });
  assert.match(await text('mode-label'), /对角线 \+ 缺一门 \+ 杀手 \+ 连续数 \+ 差 1/);
  assert.match(await text('progress'), /25 \/ 72/);
  await p.locator('#new').click();
  await p.locator('#led').uncheck();
  for (const rule of ['diagonal', 'missing', 'killer', 'renban', 'consecutive']) await p.locator(`#${rule}`).uncheck();
  await p.locator('#start-new').click();
  await p.locator('#busy').waitFor({ state: 'hidden', timeoutMs: 15000 });
  assert.match(await text('mode-label'), /常规/);
  assert.match(await p.locator('#keypad').getAttribute('class'), /is-classic/);
  assert.match(await text('candidate-info'), /LED 灯段规则已关闭/);
  await tab.reload();
  await p.locator('#busy').waitFor({ state: 'hidden', timeoutMs: 15000 });
  assert.match(await text('mode-label'), /常规/);
  assert.match(await text('status'), /已恢复/);
  const errors = await tab.dev.logs({ levels: ['error'], limit: 30 }); assert.equal(errors.length, 0, JSON.stringify(errors));
  return { passed: true, checks: ['LED filtering', 'notes', 'placement', 'keyboard', 'erase', 'undo', 'hint explanation', 'save restore', 'solve/cancel/undo', 'combined settings', 'LED clock', '3x3 keypad', 'completion border', 'settings cancel', 'classic mode restore', 'console errors'] };
}

/** Four new variants: exercise public controls, per-cell clue text, save and mode switching. */
export async function runVariants(tab, origin = 'http://127.0.0.1:8317') {
  const p = tab.playwright, text = id => p.locator(`#${id}`).textContent();
  const url = `${origin}/games/led-sudoku/?seed=20260920&inequality=1&multiDiagonal=1&exclusion=1&parity=1`;
  if (await tab.url() === url) await tab.reload(); else await tab.goto(url);
  await p.locator('#busy').waitFor({ state: 'hidden', timeoutMs: 20000 });
  assert.match(await text('active-rules'), /数比 · 多对角线 · 排除点 · 奇偶/);
  assert.match(await text('cell-rules'), /红底.*数比/s);
  assert.equal(await p.locator('#digit-3').isEnabled(), true);
  assert.equal(await p.locator('#digit-7').isEnabled(), true);
  for (let n = 0; n < 3; n++) await p.locator('#board').press('ArrowLeft');
  assert.match(await text('cell-rules'), /亮灯匹配 2、8/);
  await p.locator('#board').press('ArrowDown');
  assert.match(await text('cell-rules'), /排除点/);
  assert.equal(await p.locator('#digit-2').isEnabled(), false);
  assert.equal(await p.locator('#digit-8').isEnabled(), false);
  await p.locator('#new').click();
  for (const key of ['inequality', 'multiDiagonal', 'exclusion', 'parity']) assert.equal(await p.evaluate(id => document.getElementById(id).checked, key), true);
  for (const key of ['diagonal', 'missing', 'killer', 'renban', 'consecutive']) await p.locator(`#${key}`).check();
  await p.locator('#start-new').click();
  await p.locator('#busy').waitFor({ state: 'hidden', timeoutMs: 20000 });
  assert.match(await text('progress'), /25 \/ 72/);
  await tab.goto(`${origin}/games/led-sudoku/`);
  await p.locator('#busy').waitFor({ state: 'hidden', timeoutMs: 20000 });
  assert.match(await text('status'), /已恢复/);
  assert.match(await text('active-rules'), /数比 · 多对角线 · 排除点 · 奇偶/);
  await p.locator('#new').click(); await p.locator('#led').uncheck();
  await p.locator('#start-new').click();
  await p.locator('#busy').waitFor({ state: 'hidden', timeoutMs: 20000 });
  assert.match(await text('mode-label'), /常规/);
  assert.match(await text('active-rules'), /排除点 · 奇偶/);
  await p.locator('#solve').click(); await p.locator('#accept-confirm').click();
  assert.match(await text('progress'), /已完成/);
  await p.locator('#undo').click(); assert.doesNotMatch(await text('progress'), /已完成/);
  assert.equal((await tab.dev.logs({ levels: ['error'], limit: 30 })).length, 0);
  return { passed: true, checks: ['four rule controls', 'parity and inequality candidates', 'partial exclusion set', 'surrounding cell filtering', 'all ten rules', 'combined save restore', 'classic variants', 'completion and undo', 'console errors'] };
}

/** Advanced rules and conflict UI; no private game state or storage access. */
export async function runAdvanced(tab, origin='http://127.0.0.1:8317') {
 const p=tab.playwright, text=id=>p.locator(`#${id}`).textContent();
 await tab.goto(`${origin}/games/led-sudoku/?seed=20260921&thermometer=1&skyscraper=1&xv=1&quadruple=1`);
 await p.locator('#busy').waitFor({state:'hidden',timeoutMs:30000});
 assert.equal(await p.locator('#glow').count(),0);assert.match(await text('active-rules'),/温度计 · 摩天大楼 · XV · 四数和/);
 assert.match(await text('cell-rules'),/摩天大楼.*XV 全标记/s);
 await p.locator('#digit-4').click();assert.match(await text('progress'),/26 \/ 81/);await p.locator('#undo').click();
 await p.locator('#new').click();
 for(const [on,off] of [['renban','thermometer'],['missing','skyscraper'],['inequality','xv'],['exclusion','quadruple'],['thermometer','renban'],['skyscraper','missing'],['xv','inequality'],['quadruple','exclusion']]) {
  await p.locator(`#${on}`).check();
  assert.equal(await p.evaluate(id=>document.getElementById(id).checked,off),false);assert.match(await text('rule-notice'),/已关闭/);
 }
 await p.locator('#consecutive').check();assert.equal(await p.evaluate(()=>document.getElementById('xv').checked),false);
 await p.locator('#xv').check();assert.equal(await p.evaluate(()=>document.getElementById('consecutive').checked),false);
 await p.locator('#cancel-new').click();assert.match(await text('active-rules'),/温度计 · 摩天大楼 · XV · 四数和/);
 await p.locator('#new').click();await p.locator('#led').uncheck();await p.locator('#start-new').click();
 await p.locator('#busy').waitFor({state:'hidden',timeoutMs:30000});assert.match(await text('mode-label'),/常规.*温度计.*摩天大楼.*XV.*四数和/);
 await tab.goto(`${origin}/games/led-sudoku/`);await p.locator('#busy').waitFor({state:'hidden',timeoutMs:30000});assert.match(await text('status'),/已恢复/);assert.match(await text('mode-label'),/常规/);
 assert.equal((await tab.dev.logs({levels:['error'],limit:20})).length,0);
 return {passed:true,checks:['no glow control','four active rules','visible clue explanations','candidate placement and undo','five symmetric rule conflicts','cancel preserves game','classic advanced game','advanced save restore','console errors']};
}

/** Ordered purple-line wording must agree between the live game and settings. */
export async function runOrdered(tab, origin='http://127.0.0.1:8317') {
  const p=tab.playwright;
  await tab.goto(`${origin}/games/led-sudoku/?seed=39&renban=1`);
  await p.locator('#busy').waitFor({state:'hidden',timeoutMs:30000});
  assert.match(await p.locator('#mode-label').textContent(),/连续数/);
  await p.locator('#help').click();
  assert.match(await p.locator('#line-rule-help').textContent(),/每步差 1，全部升序或全部降序，不能乱序或中途转向/);
  await p.locator('#close-help').click();await p.locator('#new').click();
  const label=await p.locator('label').filter({has:p.locator('#renban')}).textContent();
  assert.match(label,/连续数 · 升\/降/);assert.match(label,/每步差 1，全部升序或全部降序/);
  await p.locator('#cancel-new').click();
  assert.equal((await tab.dev.logs({levels:['error']})).length,0);
  return {passed:true,seed:39,checks:['current rule label','ordered help','ordered settings','console errors']};
}
