export const CARD_TEXTURE_WIDTH = 256;
export const CARD_TEXTURE_HEIGHT = 160;
export const CARD_GLOW_PADDING = 20;
export const CARD_CORNER_RADIUS = 24;

export function cardPreview(image: HTMLImageElement, canvas = document.createElement('canvas')): HTMLCanvasElement {
  canvas.width = CARD_TEXTURE_WIDTH * 2; canvas.height = CARD_TEXTURE_HEIGHT * 2;
  const context = canvas.getContext('2d')!; context.scale(2, 2);
  context.beginPath(); context.roundRect(0, 0, CARD_TEXTURE_WIDTH, CARD_TEXTURE_HEIGHT, CARD_CORNER_RADIUS); context.clip();
  const scale = Math.max(CARD_TEXTURE_WIDTH / image.naturalWidth, CARD_TEXTURE_HEIGHT / image.naturalHeight);
  const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
  context.drawImage(image, (CARD_TEXTURE_WIDTH - width) / 2, (CARD_TEXTURE_HEIGHT - height) / 2, width, height);
  return canvas;
}

export function cardTextures() {
  const glow = document.createElement('canvas');
  glow.width = CARD_TEXTURE_WIDTH + CARD_GLOW_PADDING * 2; glow.height = CARD_TEXTURE_HEIGHT + CARD_GLOW_PADDING * 2;
  const context = glow.getContext('2d')!;
  const outline = () => { context.beginPath(); context.roundRect(CARD_GLOW_PADDING, CARD_GLOW_PADDING, CARD_TEXTURE_WIDTH, CARD_TEXTURE_HEIGHT, CARD_CORNER_RADIUS); context.stroke(); };
  context.filter = 'blur(9px)'; context.lineWidth = 10; context.strokeStyle = 'rgba(82,255,196,.65)'; outline();
  context.filter = 'blur(4px)'; context.lineWidth = 5; context.strokeStyle = 'rgba(131,255,215,.9)'; outline();
  context.filter = 'blur(1px)'; context.lineWidth = 3; context.strokeStyle = '#bcffe5'; outline();
  context.filter = 'none'; context.lineWidth = 1.5; context.strokeStyle = '#efffd5'; outline();
  const shade = document.createElement('canvas'); shade.width = CARD_TEXTURE_WIDTH * 2; shade.height = CARD_TEXTURE_HEIGHT * 2;
  const shadeContext = shade.getContext('2d')!; shadeContext.scale(2, 2);
  shadeContext.beginPath(); shadeContext.roundRect(0, 0, CARD_TEXTURE_WIDTH, CARD_TEXTURE_HEIGHT, CARD_CORNER_RADIUS); shadeContext.clip();
  const gradient = shadeContext.createLinearGradient(0, 0, 0, CARD_TEXTURE_HEIGHT);
  gradient.addColorStop(0, 'rgba(3,13,27,0)'); gradient.addColorStop(.36, 'rgba(3,13,27,0)'); gradient.addColorStop(.64, 'rgba(3,13,27,.55)'); gradient.addColorStop(1, 'rgba(3,13,27,.97)');
  shadeContext.fillStyle = gradient; shadeContext.fillRect(0, 0, CARD_TEXTURE_WIDTH, CARD_TEXTURE_HEIGHT);
  return { glow, shade };
}
