import assert from 'node:assert/strict';
import test from 'node:test';
import { OS_BUTTON_HOVER_MS, osButtonSkin, osButtonTheme } from '../launcher/buttonStyle.ts';

const normal = { hover: false, focus: false, pressed: false, disabled: false };
const variants = ['primary', 'secondary', 'chip', 'icon'];
function luminance(color) {
  const values = color.startsWith('#') ? [1, 3, 5].map(start => parseInt(color.slice(start, start + 2), 16) / 255) : color.match(/[\d.]+/g).map(Number).slice(0, 3).map(value => value / 255);
  const linear = values.map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
}
function contrast(first, second) { const values = [luminance(first), luminance(second)].sort((left, right) => right - left); return (values[0] + .05) / (values[1] + .05); }

test('every OS button has explicit animated hover colors and readable normal, hover and pressed states', () => {
  assert.ok(OS_BUTTON_HOVER_MS >= 120 && OS_BUTTON_HOVER_MS <= 200);
  for (const variant of variants) for (const selected of [false, true]) {
    const resting = osButtonSkin(variant, normal, selected), over = osButtonSkin(variant, { ...normal, hover: true }, selected), pressed = osButtonSkin(variant, { ...normal, hover: true, pressed: true }, selected);
    assert.notEqual(resting.backgroundColor, over.hoverBackgroundColor);
    assert.notEqual(resting.borderColor, over.borderColor);
    assert.notEqual(pressed.backgroundColor, over.hoverBackgroundColor);
    assert.ok(contrast(resting.color, resting.backgroundColor) >= 4.5, variant + ' normal contrast');
    assert.ok(contrast(over.hoverColor, over.hoverBackgroundColor) >= 4.5, variant + ' hover contrast');
    assert.ok(contrast(pressed.hoverColor, pressed.hoverBackgroundColor) >= 4.5, variant + ' pressed contrast');
    assert.equal(pressed.contentInsets.top, 2); assert.equal(resting.contentInsets.top, 0);
    assert.equal(resting.radius, over.radius); assert.equal(pressed.radius, over.radius);
  }
});

test('focus remains visible outside hover while disabled buttons suppress all interactive styling', () => {
  for (const variant of variants) {
    const focused = osButtonSkin(variant, { ...normal, focus: true });
    assert.equal(focused.borderColor, '#c1f4ce');
    const disabled = osButtonSkin(variant, { ...normal, disabled: true });
    assert.deepEqual(osButtonSkin(variant, { hover: true, focus: true, pressed: true, disabled: true }, true), disabled);
    assert.equal(disabled.backgroundColor, disabled.hoverBackgroundColor);
    assert.equal(disabled.color, disabled.hoverColor); assert.equal(disabled.contentInsets.top, 0);
  }
});

test('immutable native GUI theme bindings are shared, scoped to buttons and preserve selected chip state', () => {
  for (const variant of [...variants, 'topbar', 'carousel']) {
    const resource = osButtonTheme(variant);
    assert.equal(resource, osButtonTheme(variant)); assert.equal(Object.isFrozen(resource), true);
    assert.deepEqual(resource.resolve('GuiImage', normal), {});
    assert.deepEqual(resource.resolve('GuiButton', normal), osButtonSkin(variant, normal));
    const release = resource.subscribe(() => assert.fail('immutable resource must not publish changes')); release(); release();
  }
  assert.notEqual(osButtonTheme('chip'), osButtonTheme('chip', true));
  assert.equal(osButtonTheme('chip', true).resolve('GuiButton', normal).backgroundColor, '#294f49');
});

test('theme resolution reuses stable nested objects for all sixteen input states to avoid whole-tree invalidation', () => {
  for (const variant of [...variants, 'topbar', 'carousel']) for (const selected of [false, true]) {
    const resource = osButtonTheme(variant, selected), resolved = [];
    for (let flags = 0; flags < 16; flags++) {
      const state = { hover: !!(flags & 1), focus: !!(flags & 2), pressed: !!(flags & 4), disabled: !!(flags & 8) };
      const skin = resource.resolve('GuiButton', state); resolved.push(skin);
      assert.equal(skin, resource.resolve('GuiButton', { ...state }));
      assert.equal(skin.contentInsets, resource.resolve('GuiButton', state).contentInsets);
      assert.equal(Object.isFrozen(skin), true); assert.equal(Object.isFrozen(skin.contentInsets), true);
      assert.deepEqual(skin, osButtonSkin(variant, state, selected));
    }
    for (let frame = 0; frame < 1000; frame++) assert.equal(resource.resolve('GuiButton', normal), resolved[0]);
    assert.equal(resource.resolve('GuiImage', normal), resource.resolve('GuiImage', { ...normal, hover: true }));
  }
});
