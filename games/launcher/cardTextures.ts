export const CARD_TEXTURE_WIDTH = 256;
export const CARD_TEXTURE_HEIGHT = 160;
export const CARD_GLOW_PADDING = 20;

export function cardTextures() {
  const glow = document.createElement('canvas');
  glow.width = CARD_TEXTURE_WIDTH + CARD_GLOW_PADDING * 2; glow.height = CARD_TEXTURE_HEIGHT + CARD_GLOW_PADDING * 2;
  const context = glow.getContext('2d')!;
  const outline = () => { context.beginPath(); context.roundRect(CARD_GLOW_PADDING, CARD_GLOW_PADDING, CARD_TEXTURE_WIDTH, CARD_TEXTURE_HEIGHT, 9); context.stroke(); };
  context.filter = 'blur(9px)'; context.lineWidth = 10; context.strokeStyle = 'rgba(82,255,196,.65)'; outline();
  context.filter = 'blur(4px)'; context.lineWidth = 5; context.strokeStyle = 'rgba(131,255,215,.9)'; outline();
  context.filter = 'blur(1px)'; context.lineWidth = 3; context.strokeStyle = '#bcffe5'; outline();
  context.filter = 'none'; context.lineWidth = 1.5; context.strokeStyle = '#efffd5'; outline();
  const shade = document.createElement('canvas'); shade.width = 1; shade.height = 128;
  const shadeContext = shade.getContext('2d')!, gradient = shadeContext.createLinearGradient(0, 0, 0, 128);
  gradient.addColorStop(0, 'rgba(3,13,27,0)'); gradient.addColorStop(.35, 'rgba(3,13,27,.55)'); gradient.addColorStop(1, 'rgba(3,13,27,.97)');
  shadeContext.fillStyle = gradient; shadeContext.fillRect(0, 0, 1, 128);
  return { glow, shade };
}
