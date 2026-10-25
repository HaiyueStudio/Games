export function paintIcon(context: CanvasRenderingContext2D, image: HTMLImageElement, size: number): void {
  context.clearRect(0, 0, size, size); context.save(); context.beginPath(); context.roundRect(0, 0, size, size, size * .22); context.clip();
  const crop = Math.min(image.naturalWidth, image.naturalHeight);
  context.drawImage(image, (image.naturalWidth - crop) / 2, (image.naturalHeight - crop) / 2, crop, crop, 0, 0, size, size);
  context.restore();
}
