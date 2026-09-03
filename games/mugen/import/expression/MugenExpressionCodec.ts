import { MUGEN_LIMITS } from '../contract';
import { validateExpressionProgram } from './MugenExpressionCompiler';
import type { MugenExpressionProgram } from './types';

const MAGIC = Uint8Array.of(0x48, 0x59, 0x4d, 0x45, 0x58, 0x50, 0x52, 0x00);
const HEADER_BYTES = 16;
const TEXT = new TextEncoder();
const DECODE = new TextDecoder('utf-8', { fatal: true });

export function encodeMugenExpressionProgram(program: MugenExpressionProgram): Uint8Array {
  validateExpressionProgram(program); const payload = TEXT.encode(canonicalJson(program)); if (HEADER_BYTES + payload.byteLength > MUGEN_LIMITS.worker.maxMessageBytes) throw new RangeError('MUGEN expression bytecode exceeds the encoded byte budget.'); const result = new Uint8Array(HEADER_BYTES + payload.byteLength); result.set(MAGIC); const view = new DataView(result.buffer); view.setUint16(8, 1, true); view.setUint16(10, 0, true); view.setUint32(12, payload.byteLength, true); result.set(payload, HEADER_BYTES); return result;
}

export function decodeMugenExpressionProgram(source: Uint8Array | ArrayBuffer): MugenExpressionProgram {
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source); if (bytes.byteLength > MUGEN_LIMITS.worker.maxMessageBytes) throw new RangeError('MUGEN expression bytecode exceeds the encoded byte budget.'); if (bytes.byteLength < HEADER_BYTES || !MAGIC.every((value, index) => bytes[index] === value)) throw new TypeError('MUGEN expression bytecode signature is invalid.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); if (view.getUint16(8, true) !== 1 || view.getUint16(10, true) !== 0 || view.getUint32(12, true) !== bytes.byteLength - HEADER_BYTES) throw new TypeError('MUGEN expression bytecode header is invalid.');
  let value: unknown; try { value = JSON.parse(DECODE.decode(bytes.subarray(HEADER_BYTES))); } catch { throw new TypeError('MUGEN expression bytecode payload is invalid UTF-8 JSON.'); }
  validateExpressionProgram(value); const program = deepFreeze(value); if (!equal(encodeMugenExpressionProgram(program), bytes)) throw new TypeError('MUGEN expression bytecode is not canonical.'); return program;
}

function canonicalJson(value: unknown): string { if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value); if (typeof value === 'number') { if (!Number.isFinite(value)) throw new TypeError('Non-finite bytecode value.'); return Object.is(value, -0) ? '0' : JSON.stringify(value); } if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`; if (value !== null && typeof value === 'object') { const record = value as Record<string, unknown>; return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`; } throw new TypeError('Unsupported bytecode value.'); }
function deepFreeze<T>(value: T): T { if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) { for (const child of Object.values(value)) deepFreeze(child); Object.freeze(value); } return value; }
function equal(left: Uint8Array, right: Uint8Array): boolean { return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]); }
