interface DecorationImage { image: HTMLImageElement; signature: string; ready: boolean; url: string | null }

export class GameDecorations {
  readonly canvas = document.createElement('canvas');
  private readonly context = this.canvas.getContext('2d')!;
  private readonly images = new Map<string | Element, DecorationImage>();
  private disposed = false;
  constructor(private readonly body: HTMLElement, private readonly source: HTMLCanvasElement, private readonly bounds: () => DOMRect) {}
  async ready(): Promise<void> {
    this.update();
    await Promise.all([...this.images.values()].map(item => item.image.decode()));
    this.update();
  }
  private image(key: string | Element, signature: string, svg = false): HTMLImageElement | null {
    let item = this.images.get(key);
    if (item?.signature === signature) return item.ready ? item.image : null;
    if (item) { item.image.onload = null; item.image.onerror = null; if (item.url) URL.revokeObjectURL(item.url); }
    const image = new Image(), url = svg ? URL.createObjectURL(new Blob([signature], { type: 'image/svg+xml' })) : null;
    item = { image, signature, ready: false, url }; this.images.set(key, item);
    image.onload = () => { if (!this.disposed) item.ready = true; if (url) URL.revokeObjectURL(url); item.url = null; };
    image.onerror = () => { if (url) URL.revokeObjectURL(url); item.url = null; };
    image.src = url ?? signature;
    return null;
  }
  update(): void {
    if (this.disposed || !this.source.width || !this.source.height) return;
    if (this.canvas.width !== this.source.width) this.canvas.width = this.source.width;
    if (this.canvas.height !== this.source.height) this.canvas.height = this.source.height;
    const context = this.context, bounds = this.bounds();
    context.resetTransform(); context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    context.scale(this.canvas.width / Math.max(1, bounds.width), this.canvas.height / Math.max(1, bounds.height));
    const ancestors: HTMLElement[] = [];
    for (let parent = this.source.parentElement; parent && parent !== this.body; parent = parent.parentElement) ancestors.unshift(parent);
    for (const element of ancestors) {
      const style = getComputedStyle(element), rectangle = element.getBoundingClientRect(), left = rectangle.x - bounds.x, top = rectangle.y - bounds.y;
      if (style.backgroundColor !== 'rgba(0, 0, 0, 0)') { context.fillStyle = style.backgroundColor; context.fillRect(left, top, rectangle.width, rectangle.height); }
      const url = /^url\(["']?(.*?)["']?\)$/.exec(style.backgroundImage)?.[1];
      if (url) { const image = this.image(url, url); if (image) context.drawImage(image, left, top, rectangle.width, rectangle.height); }
    }
    for (const element of this.body.querySelectorAll<HTMLImageElement | SVGSVGElement>('img,svg')) {
      if (element.parentElement?.closest('svg')) continue;
      const style = getComputedStyle(element), rectangle = element.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || rectangle.width < 1 || rectangle.height < 1) continue;
      let image: HTMLImageElement | null;
      if (element instanceof HTMLImageElement) image = element.complete && element.naturalWidth ? element : null;
      else {
        const clone = element.cloneNode(true) as SVGSVGElement; clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        clone.removeAttribute('class'); clone.removeAttribute('style'); image = this.image(element, new XMLSerializer().serializeToString(clone), true);
      }
      if (!image) continue;
      context.save(); context.globalAlpha = Number(style.opacity);
      context.translate(rectangle.x + rectangle.width / 2 - bounds.x, rectangle.y + rectangle.height / 2 - bounds.y);
      const matrix = new DOMMatrix(style.transform === 'none' ? undefined : style.transform);
      matrix.e = 0; matrix.f = 0; context.transform(matrix.a, matrix.b, matrix.c, matrix.d, 0, 0);
      const width = parseFloat(style.width) || rectangle.width, height = parseFloat(style.height) || rectangle.height;
      context.drawImage(image, -width / 2, -height / 2, width, height); context.restore();
    }
  }
  dispose(): void {
    this.disposed = true;
    for (const item of this.images.values()) { item.image.onload = null; item.image.onerror = null; if (item.url) URL.revokeObjectURL(item.url); }
    this.images.clear(); this.canvas.width = this.canvas.height = 1;
  }
}
