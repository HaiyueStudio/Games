export type PixelRatioChoice = 'auto' | 1 | 1.5 | 2 | 3;
export interface QualitySettings { msaa: boolean; pixelRatio: PixelRatioChoice; }
export const defaultQuality = (): QualitySettings => ({msaa:true,pixelRatio:'auto'});
export function parseQuality(raw: string | null): QualitySettings {
  try {
    const value=JSON.parse(raw ?? 'null');
    return {msaa:typeof value?.msaa==='boolean'?value.msaa:true,
      pixelRatio:['auto',1,1.5,2,3].includes(value?.pixelRatio)?value.pixelRatio:'auto'};
  } catch { return defaultQuality(); }
}
export function resolvePixelRatio(choice: PixelRatioChoice, deviceRatio: number): number {
  const native=Number.isFinite(deviceRatio)&&deviceRatio>0?deviceRatio:1;
  return choice==='auto'?Math.min(native,2):choice;
}
