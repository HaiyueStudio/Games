// These IDs are stored in native .ld files and in editor drafts.
export const gateNames = {
  1: '总花瓣',
  2: '区域花朵',
  3: '奖励',
  4: '本地图花瓣',
} as const;

export type GateType = keyof typeof gateNames;
export interface GateCondition {
  gate: GateType;
  requirement: number;
}

export function gateName(gate: number): string | undefined {
  return gateNames[gate as GateType];
}
