const paths = {
  back: 'M19 12H5 M12 5l-7 7 7 7',
  select: 'M5 3l14 10-7 1.2-3.4 6.3L5 3Z',
  erase: 'M7 17l-3-3a1.6 1.6 0 0 1 0-2.3l7.4-7.5a1.6 1.6 0 0 1 2.3 0l5.5 5.5a1.6 1.6 0 0 1 0 2.3L12.1 19H9l-2-2Z M8 8l8 8 M11.5 19H21',
  undo: 'M9 5l-5 5 5 5 M4 10h10a4.5 4.5 0 0 1 0 9h-4',
  import: 'M12 3v11 M8 10l4 4 4-4 M4.5 15v4a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-4',
  export: 'M12 15V4 M8 8l4-4 4 4 M4.5 15v4a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-4',
  play: 'M8 4.5l12 7.5-12 7.5V4.5Z',
  minus: 'M6 12h12',
  plus: 'M6 12h12 M12 6v12',
};

export type EditorIcon = keyof typeof paths;

export function editorIcon(kind: EditorIcon, dark: boolean): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 72;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(3, 3);
  ctx.lineWidth = 1.9;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = dark ? '#0e4050' : '#e8f8ff';
  ctx.stroke(new Path2D(paths[kind]));
  return canvas;
}
