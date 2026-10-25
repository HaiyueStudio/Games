import type { GuiButton, GuiElementOptions, GuiStyle } from '@haiyue/engine/gui';

export type OsButtonVariant = 'primary' | 'secondary' | 'chip' | 'icon' | 'topbar' | 'carousel';
type ButtonResource = NonNullable<GuiElementOptions['themeResource']>;
type ButtonState = Parameters<ButtonResource['resolve']>[1];
export const OS_BUTTON_HOVER_MS = 160;

const palettes = {
  primary: { base: '#bcefc8', hover: '#dcffe5', pressed: '#8fcfa9', border: '#e2ffe9', hoverBorder: '#f1fff5', text: '#113b32', hoverText: '#0d332b' },
  secondary: { base: 'rgba(20,38,59,.88)', hover: '#29485f', pressed: '#102539', border: '#48667e', hoverBorder: '#8ae5d3', text: '#d9eaf6', hoverText: '#f1fff8' },
  chip: { base: 'rgba(16,34,51,.64)', hover: '#294d5c', pressed: '#173637', border: '#344e62', hoverBorder: '#74cfc1', text: '#bdd5e5', hoverText: '#ecfff5' },
  icon: { base: 'rgba(20,39,58,.88)', hover: '#2b4c60', pressed: '#142f3c', border: '#4d6d81', hoverBorder: '#9ce7d3', text: '#d9ebf8', hoverText: '#f1fff8' },
} as const;

export function osButtonSkin(variant: OsButtonVariant, state: ButtonState, selected = false): GuiStyle {
  if (variant === 'carousel') {
    const color = state.disabled ? '#607789' : state.pressed ? '#a0def0' : state.hover || state.focus ? '#f0fcff' : '#c6e7f5';
    const background = state.disabled ? 'rgba(12,27,43,.24)' : state.pressed ? 'rgba(19,51,72,.9)' : 'rgba(12,29,48,.52)';
    return { radius: 999, padding: 0, contentInsets: { top: 0, right: 0, bottom: 0, left: 0 },
      backgroundColor: background, hoverBackgroundColor: state.disabled || state.pressed ? background : 'rgba(43,80,104,.84)',
      borderColor: state.disabled ? 'rgba(107,154,180,.2)' : state.hover || state.focus ? '#9de5ff' : 'rgba(140,201,228,.48)',
      color, hoverColor: color, iconTint: color };
  }
  if (variant === 'topbar') {
    const color = state.disabled ? '#64748b' : state.pressed ? '#87cfc8' : state.focus ? '#c8fff0' : state.hover ? '#ffffff' : selected ? '#bdf4c8' : '#c0d0df';
    return { radius: 0, padding: 0, contentInsets: { top: 0, right: 0, bottom: 0, left: 0 },
      backgroundColor: 'transparent', hoverBackgroundColor: 'transparent', borderColor: 'transparent', color, hoverColor: color, iconTint: color };
  }
  selected = selected && variant !== 'primary';
  const palette = palettes[variant], inset = variant === 'icon' ? 4 : 8;
  const geometry = { radius: variant === 'chip' ? 14 : 12, padding: 0, contentInsets: { top: state.pressed && !state.disabled ? 2 : 0, right: inset, bottom: 0, left: inset } };
  if (state.disabled) return { ...geometry, backgroundColor: '#1b2a3b', hoverBackgroundColor: '#1b2a3b', borderColor: '#34485b', color: '#93a9bc', hoverColor: '#93a9bc' };
  const normal = selected ? '#294f49' : palette.base, over = selected ? '#39685c' : palette.hover;
  return { ...geometry,
    backgroundColor: state.pressed ? palette.pressed : normal,
    hoverBackgroundColor: state.pressed ? palette.pressed : over,
    borderColor: state.focus ? '#c1f4ce' : state.hover ? palette.hoverBorder : selected ? '#82cdae' : palette.border,
    color: selected ? '#dcffe9' : palette.text, hoverColor: selected ? '#f0fff4' : palette.hoverText,
  };
}

const resources = new Map<string, ButtonResource>();
const emptySkin = Object.freeze({});
export function osButtonTheme(variant: OsButtonVariant = 'secondary', selected = false): ButtonResource {
  const key = `${variant}:${selected}`;
  let resource = resources.get(key);
  if (!resource) {
    const skins = Array.from({ length: 16 }, (_, flags) => {
      const skin = osButtonSkin(variant, { hover: !!(flags & 1), focus: !!(flags & 2), pressed: !!(flags & 4), disabled: !!(flags & 8) }, selected);
      return Object.freeze({ ...skin, contentInsets: Object.freeze(skin.contentInsets!) });
    });
    resource = Object.freeze({ version: 1, resolve: (control: string, state: ButtonState) => control === 'GuiButton' ? skins[Number(state.hover) | Number(state.focus) << 1 | Number(state.pressed) << 2 | Number(state.disabled) << 3]! : emptySkin, subscribe: () => () => {} });
    resources.set(key, resource);
  }
  return resource;
}

export function osButtonSnapshot(button: GuiButton) {
  const skin = button.getResolvedStyle();
  return { hovered: button.hovered, pressed: button.pressed, focused: button.focused, disabled: button.disabled, duration: button.hoverTransitionMs,
    background: skin.backgroundColor, hoverBackground: skin.hoverBackgroundColor, border: skin.borderColor, color: skin.color, radius: skin.radius,
    ...(skin.icon ? { iconTint: skin.iconTint, iconSize: skin.iconSize, contentInsets: skin.contentInsets } : {}) };
}
