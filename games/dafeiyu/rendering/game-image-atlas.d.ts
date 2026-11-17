declare module 'virtual:game-image-atlas' {
  interface ImageFrame {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }

  const atlas: { readonly url: string; readonly frames: Readonly<Record<string, ImageFrame | undefined>>;
    readonly backgrounds: Readonly<Record<string, string | undefined>> } | null;
  export default atlas;
}
