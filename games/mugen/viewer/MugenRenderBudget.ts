const DEFAULT_PIXEL_BUDGET = 1920 * 1080;

/** Keeps pixel-art rendering sharp without letting high-DPI displays multiply GPU fill cost unchecked. */
export function mugenRenderPixelRatio(cssWidth: number, cssHeight: number, devicePixelRatio: number, pixelBudget = DEFAULT_PIXEL_BUDGET): number {
  const cssPixels = Math.max(1, finitePositive(cssWidth) * finitePositive(cssHeight));
  const sourceRatio = Math.max(.75, finitePositive(devicePixelRatio));
  const budgetRatio = Math.sqrt(Math.max(1, finitePositive(pixelBudget)) / cssPixels);
  return Math.min(sourceRatio, 1.5, Math.max(.75, budgetRatio));
}

function finitePositive(value: number): number { return Number.isFinite(value) && value > 0 ? value : 1; }
