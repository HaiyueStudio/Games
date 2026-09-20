/** Native uploads copy pixels synchronously, so subsequent labels can share one
 * CPU surface. Web materials retain their canvas source and need a fresh one. */
export class CalendarRasterSurface {
  private scratch: HTMLCanvasElement | undefined;
  private readonly create: (width: number, height: number) => HTMLCanvasElement;
  private readonly copiedOnUpload: boolean;
  constructor(
    create: (width: number, height: number) => HTMLCanvasElement,
    copiedOnUpload: boolean,
  ) { this.create = create; this.copiedOnUpload = copiedOnUpload; }
  acquire(width: number, height: number): HTMLCanvasElement {
    const canvas = this.scratch ?? this.create(width, height);
    if (this.copiedOnUpload) this.scratch = canvas;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Calendar puzzle requires Canvas 2D rasterization.');
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, width, height);
    return canvas;
  }
  dispose(): void { this.scratch = undefined; }
}
