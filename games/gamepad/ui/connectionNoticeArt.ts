const COLORS = { connected: '#9ff3d5', disconnected: '#ffc58b' };
let cached: ReturnType<typeof drawArt> | undefined;

function drawArt() {
  const surface = (width: number, height: number) => {
    const canvas = document.createElement('canvas'); canvas.width = width * 2; canvas.height = height * 2;
    const context = canvas.getContext('2d')!; context.scale(2, 2); return { canvas, context };
  };
  const variant = (accent: string, connected: boolean) => {
    const panel = surface(180, 96), c = panel.context;
    const fill = c.createLinearGradient(0, 6, 0, 90);
    fill.addColorStop(0, 'rgba(29,55,76,.98)'); fill.addColorStop(1, 'rgba(8,23,40,.98)');
    c.beginPath(); c.roundRect(6, 6, 168, 84, 18); c.fillStyle = fill;
    c.shadowColor = 'rgba(1,7,17,.65)'; c.shadowBlur = 10; c.shadowOffsetY = 3; c.fill(); c.shadowBlur = 0; c.shadowOffsetY = 0;
    const rim = c.createLinearGradient(0, 6, 0, 90);
    rim.addColorStop(0, 'rgba(164,225,255,.6)'); rim.addColorStop(.5, 'rgba(103,163,199,.2)'); rim.addColorStop(1, 'rgba(73,125,163,.22)');
    c.strokeStyle = rim; c.lineWidth = 1; c.stroke();
    c.strokeStyle = accent; c.globalAlpha = .7; c.shadowColor = accent; c.shadowBlur = 8;
    c.beginPath(); c.moveTo(7, 33); c.lineTo(7, 63); c.stroke(); c.shadowBlur = 0; c.globalAlpha = 1;
    const icon = surface(48, 48), i = icon.context;
    const glow = i.createRadialGradient(24, 24, 1, 24, 24, 24);
    glow.addColorStop(0, connected ? 'rgba(115,240,210,.2)' : 'rgba(255,186,120,.18)'); glow.addColorStop(1, 'rgba(10,31,49,0)');
    i.fillStyle = glow; i.fillRect(0, 0, 48, 48);
    i.beginPath(); i.roundRect(5, 5, 38, 38, 13); i.fillStyle = 'rgba(105,190,220,.08)'; i.fill(); i.strokeStyle = 'rgba(164,223,247,.18)'; i.lineWidth = 1; i.stroke();
    i.beginPath(); i.moveTo(16, 16); i.bezierCurveTo(10, 16, 8, 28, 10, 31); i.bezierCurveTo(12, 35, 16, 29, 18, 28);
    i.lineTo(30, 28); i.bezierCurveTo(32, 29, 36, 35, 38, 31); i.bezierCurveTo(40, 28, 38, 16, 32, 16); i.closePath();
    i.strokeStyle = '#e1f5ff'; i.lineWidth = 1.6; i.lineJoin = 'round'; i.lineCap = 'round'; i.stroke();
    i.beginPath(); i.moveTo(16, 20); i.lineTo(16, 25); i.moveTo(13.5, 22.5); i.lineTo(18.5, 22.5); i.stroke();
    i.fillStyle = accent; for (const [x, y] of [[30, 20], [33, 24]]) { i.beginPath(); i.arc(x!, y!, 1.4, 0, Math.PI * 2); i.fill(); }
    i.beginPath(); i.arc(37, 10, 6, 0, Math.PI * 2); i.fillStyle = '#122a3c'; i.fill(); i.strokeStyle = accent; i.stroke();
    i.beginPath(); if (connected) { i.moveTo(34, 10); i.lineTo(36, 12); i.lineTo(40, 8); } else { i.moveTo(34.5, 7.5); i.lineTo(39.5, 12.5); i.moveTo(39.5, 7.5); i.lineTo(34.5, 12.5); } i.stroke();
    return { panel: panel.canvas, icon: icon.canvas, accent };
  };
  return { connected: variant(COLORS.connected, true), disconnected: variant(COLORS.disconnected, false) };
}

/** Shared immutable skins; no per-notice image downloads or canvas redraws. */
export function connectionNoticeArt() { return cached ??= drawArt(); }
