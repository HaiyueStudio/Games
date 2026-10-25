function surface(width: number, height: number) {
  const canvas = document.createElement('canvas'); canvas.width = width * 3; canvas.height = height * 3;
  const context = canvas.getContext('2d')!; context.scale(3, 3);
  return { canvas, context };
}

export function haiyueBrand() {
  const word = surface(148, 48), w = word.context;
  w.font = 'italic 400 42px "Segoe Script", "Gabriola", "Brush Script MT", cursive'; w.textBaseline = 'alphabetic';
  const metrics = w.measureText('haiyue'), ascent = metrics.actualBoundingBoxAscent, descent = metrics.actualBoundingBoxDescent;
  const scale = Math.min(1, 132 / (metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight), 36 / (ascent + descent));
  w.translate(8, 6 + ascent * scale); w.scale(scale, scale); w.lineJoin = 'round';
  for (let depth = 2; depth > 0; depth--) { w.fillStyle = depth === 2 ? '#126eae' : '#459dd4'; w.fillText('haiyue', depth * .3, depth * .6); }
  const ink = w.createLinearGradient(0, -ascent, 0, descent);
  for (const [stop, color] of [[0, '#effcff'], [.23, '#9be5ff'], [.46, '#38b4f7'], [.5, '#e4faff'], [.65, '#68ccfa'], [.86, '#238ee4'], [1, '#a9efff']] as const) ink.addColorStop(stop, color);
  w.fillStyle = ink; w.shadowColor = '#54bfff'; w.shadowBlur = 3; w.fillText('haiyue', 0, 0); w.shadowBlur = 0;
  w.strokeStyle = 'rgba(220,250,255,.65)'; w.lineWidth = .5; w.strokeText('haiyue', 0, 0);
  return { wordmark: word.canvas };
}

export function navigationIcon(kind: 'library' | 'favorites' | 'devices' | 'search' | 'settings'): HTMLCanvasElement {
  const { canvas, context: c } = surface(24, 24);
  c.strokeStyle = '#e4f5ff'; c.lineWidth = 1.6; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath();
  if (kind === 'library') {
    for (const y of [4, 14]) for (const x of [4, 14]) c.roundRect(x, y, 6, 6, 1.4);
  } else if (kind === 'favorites') {
    c.moveTo(12, 20); c.bezierCurveTo(8, 17, 2.5, 13, 3, 8); c.bezierCurveTo(3.5, 3, 9, 2, 12, 7); c.bezierCurveTo(15, 2, 20.5, 3, 21, 8); c.bezierCurveTo(21.5, 13, 16, 17, 12, 20);
  } else if (kind === 'devices') {
    c.roundRect(3, 3, 18, 14, 2.5); c.moveTo(9, 21); c.lineTo(15, 21); c.moveTo(12, 17); c.lineTo(12, 21);
    c.moveTo(8, 9); c.lineTo(8, 13); c.moveTo(6, 11); c.lineTo(10, 11); c.moveTo(15, 9); c.lineTo(15.1, 9); c.moveTo(18, 12); c.lineTo(18.1, 12);
  } else if (kind === 'search') {
    c.arc(10, 10, 6, 0, Math.PI * 2); c.moveTo(14.5, 14.5); c.lineTo(21, 21);
  } else {
    for (let index = 0; index < 32; index++) {
      const angle = index / 32 * Math.PI * 2, radius = index % 4 < 2 ? 10 : 7.6;
      const x = 12 + Math.cos(angle) * radius, y = 12 + Math.sin(angle) * radius;
      if (!index) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.closePath(); c.moveTo(15.3, 12); c.arc(12, 12, 3.3, 0, Math.PI * 2);
  }
  c.stroke(); return canvas;
}

export function navigationTooltipArt() {
  const panel = surface(112, 48), c = panel.context;
  const fill = c.createLinearGradient(0, 8, 0, 40);
  fill.addColorStop(0, 'rgba(31,58,80,.97)'); fill.addColorStop(1, 'rgba(9,25,43,.98)');
  c.beginPath(); c.roundRect(8, 8, 96, 32, 11);
  c.shadowColor = 'rgba(0,6,18,.55)'; c.shadowBlur = 8; c.shadowOffsetY = 3;
  c.fillStyle = fill; c.fill(); c.shadowBlur = 0; c.shadowOffsetY = 0;
  const rim = c.createLinearGradient(0, 8, 0, 40);
  rim.addColorStop(0, 'rgba(155,225,255,.65)'); rim.addColorStop(1, 'rgba(80,143,189,.22)');
  c.strokeStyle = rim; c.lineWidth = 1; c.stroke();
  const gleam = c.createLinearGradient(24, 0, 88, 0);
  gleam.addColorStop(0, 'rgba(188,237,255,0)'); gleam.addColorStop(.5, 'rgba(188,237,255,.2)'); gleam.addColorStop(1, 'rgba(188,237,255,0)');
  c.strokeStyle = gleam; c.beginPath(); c.moveTo(24, 10); c.lineTo(88, 10); c.stroke();
  const arrow = surface(14, 7), a = arrow.context;
  a.beginPath(); a.moveTo(.5, 7); a.lineTo(6, 1); a.quadraticCurveTo(7, 0, 8, 1); a.lineTo(13.5, 7);
  a.fillStyle = '#213c51'; a.fill(); a.strokeStyle = 'rgba(155,225,255,.65)'; a.lineWidth = 1; a.stroke();
  return { panel: panel.canvas, arrow: arrow.canvas };
}

export function carouselNavigationArt() {
  const icons = [-1, 1].map(direction => {
    const { canvas, context: c } = surface(20, 20);
    c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.lineCap = 'round'; c.lineJoin = 'round';
    const x = (value: number) => direction < 0 ? value : 20 - value;
    c.beginPath(); c.moveTo(x(13), 4); c.lineTo(x(7), 10); c.lineTo(x(13), 16); c.stroke();
    return canvas;
  });
  const halo = surface(60, 60), c = halo.context;
  c.beginPath(); c.arc(30, 30, 20, 0, Math.PI * 2);
  c.strokeStyle = 'rgba(112,219,255,.5)'; c.lineWidth = 2;
  c.shadowColor = '#62cfff'; c.shadowBlur = 18; c.stroke();
  return { previous: icons[0]!, next: icons[1]!, halo: halo.canvas };
}

export function backdropShade(): HTMLCanvasElement {
  const { canvas, context: c } = surface(256, 256);
  const vertical = c.createLinearGradient(0, 0, 0, 256);
  vertical.addColorStop(0, 'rgba(3,9,20,.24)'); vertical.addColorStop(.34, 'rgba(3,9,20,.16)'); vertical.addColorStop(.62, 'rgba(3,9,20,.74)'); vertical.addColorStop(1, 'rgba(3,9,20,.96)');
  c.fillStyle = vertical; c.fillRect(0, 0, 256, 256);
  const side = c.createLinearGradient(0, 0, 256, 0);
  side.addColorStop(0, 'rgba(3,9,20,.62)'); side.addColorStop(.45, 'rgba(3,9,20,.2)'); side.addColorStop(1, 'rgba(3,9,20,.08)');
  c.fillStyle = side; c.fillRect(0, 0, 256, 256); return canvas;
}
