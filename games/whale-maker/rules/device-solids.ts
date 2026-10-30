import type { Body, State } from './model';

/** Shared live device geometry, without importing movement or pipe rules. */
export function deviceSolids(s:State):Body[]{
    return [...s.p2Mechanisms.filter(d=>d.kind==='beat-block'&&d.active),...s.devices.flatMap(d=>d.kind==='extend-block'?d.blocks:d.kind.startsWith('trampoline')?d.kind==='trampoline-on'&&!s.redOn?[]:[d]:d.kind==='path-red'||d.kind==='path-blue'&&d.phase!=='done'||d.kind==='cannon-basic'||d.kind==='bill-blaster'?[d]:[])];
}
