import type { MugenFixedStepInputDriverOptions } from '../runtime/input/MugenInputRuntime';

export const MUGEN_BINDABLE_ACTIONS = Object.freeze(['up', 'down', 'left', 'right', 'attack1', 'attack2', 'attack3', 'attack4'] as const);
export type MugenBindableAction = typeof MUGEN_BINDABLE_ACTIONS[number];
export type MugenBindingPlayer = 'P1' | 'P2';

export interface MugenPlayerKeyBindings { readonly up: string; readonly down: string; readonly left: string; readonly right: string; readonly attack1: string; readonly attack2: string; readonly attack3: string; readonly attack4: string; }
export interface MugenKeyBindings { readonly schemaVersion: 1; readonly players: Readonly<Record<MugenBindingPlayer, MugenPlayerKeyBindings>>; }

const STORAGE_KEY = 'haiyue.mugen.key-bindings.v1';
const VALID_CODE = /^[A-Za-z0-9]{1,32}$/u;

export const MUGEN_DEFAULT_KEY_BINDINGS: MugenKeyBindings = freezeBindings({
  schemaVersion: 1,
  players: {
    P1: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', attack1: 'KeyU', attack2: 'KeyI', attack3: 'KeyJ', attack4: 'KeyK' },
    P2: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', attack1: 'Numpad4', attack2: 'Numpad5', attack3: 'Numpad1', attack4: 'Numpad2' },
  },
});

export function loadMugenKeyBindings(storage: Pick<Storage, 'getItem'> | null = safeStorage()): MugenKeyBindings {
  if (!storage) return MUGEN_DEFAULT_KEY_BINDINGS;
  try { const raw = storage.getItem(STORAGE_KEY); return raw === null ? MUGEN_DEFAULT_KEY_BINDINGS : parseBindings(JSON.parse(raw)); }
  catch { return MUGEN_DEFAULT_KEY_BINDINGS; }
}

export function saveMugenKeyBindings(value: MugenKeyBindings, storage: Pick<Storage, 'setItem'> | null = safeStorage()): MugenKeyBindings {
  const normalized = parseBindings(value); storage?.setItem(STORAGE_KEY, JSON.stringify(normalized)); return normalized;
}

export function assignMugenKey(value: MugenKeyBindings, player: MugenBindingPlayer, action: MugenBindableAction, code: string): MugenKeyBindings {
  const normalizedCode = keyboardCode(code); const current = value.players[player]; const previous = current[action]; const next = { ...current, [action]: normalizedCode };
  const collision = MUGEN_BINDABLE_ACTIONS.find(candidate => candidate !== action && current[candidate] === normalizedCode);
  if (collision) next[collision] = previous;
  return freezeBindings({ schemaVersion: 1, players: { ...value.players, [player]: next } });
}

export function createMugenBrowserPlayerBindings(value: MugenKeyBindings): NonNullable<MugenFixedStepInputDriverOptions['players']> {
  const bindings = parseBindings(value);
  return Object.freeze((['P1', 'P2'] as const).map((id, index) => {
    const keys = bindings.players[id];
    return Object.freeze({
      id, gamepadIndex: index,
      bindings: Object.freeze({
        up: { keys: [keys.up], gamepadAxes: [{ axis: 1, direction: 'negative' as const }] },
        down: { keys: [keys.down], gamepadAxes: [{ axis: 1, direction: 'positive' as const }] },
        left: { keys: [keys.left], gamepadAxes: [{ axis: 0, direction: 'negative' as const }] },
        right: { keys: [keys.right], gamepadAxes: [{ axis: 0, direction: 'positive' as const }] },
        x: { keys: [keys.attack1], gamepadButtons: [3] }, y: { keys: [keys.attack2], gamepadButtons: [4] },
        a: { keys: [keys.attack3], gamepadButtons: [0] }, b: { keys: [keys.attack4], gamepadButtons: [1] },
        z: { keys: [], gamepadButtons: [5] }, c: { keys: [], gamepadButtons: [2] },
        start: { keys: [index === 0 ? 'Enter' : 'Numpad0'], gamepadButtons: [9] },
      }),
    });
  }));
}

export function mugenKeyLabel(code: string): string {
  if (/^Key[A-Z]$/u.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/u.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/u.test(code)) return `小键盘 ${code.slice(6)}`;
  return ({ ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: '空格', Enter: 'Enter' } as Readonly<Record<string, string>>)[code] ?? code;
}

function parseBindings(value: unknown): MugenKeyBindings {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.players)) throw new TypeError('MUGEN key binding document is invalid.');
  const players = {} as Record<MugenBindingPlayer, MugenPlayerKeyBindings>;
  for (const id of ['P1', 'P2'] as const) {
    const source = value.players[id]; if (!isRecord(source)) throw new TypeError(`MUGEN ${id} key bindings are missing.`);
    const result = {} as Record<MugenBindableAction, string>; const used = new Set<string>();
    for (const action of MUGEN_BINDABLE_ACTIONS) { const code = keyboardCode(source[action]); if (used.has(code)) throw new TypeError(`MUGEN ${id} key ${code} is duplicated.`); used.add(code); result[action] = code; }
    players[id] = result;
  }
  return freezeBindings({ schemaVersion: 1, players });
}

function freezeBindings(value: { readonly schemaVersion: 1; readonly players: Readonly<Record<MugenBindingPlayer, MugenPlayerKeyBindings>> }): MugenKeyBindings { return Object.freeze({ schemaVersion: 1, players: Object.freeze({ P1: Object.freeze({ ...value.players.P1 }), P2: Object.freeze({ ...value.players.P2 }) }) }); }
function keyboardCode(value: unknown): string { if (typeof value !== 'string' || !VALID_CODE.test(value) || value === 'Escape') throw new TypeError(`Invalid keyboard code: ${String(value)}.`); return value; }
function safeStorage(): Storage | null { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } }
function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
