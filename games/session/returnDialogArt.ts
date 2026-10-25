/** Static artwork for the session modal; rendered by native GUI images and nine-slice skinning. */
export function returnDialogArt() {
    const surface = (width: number, height: number) => {
        const canvas = document.createElement('canvas'); canvas.width = width * 2; canvas.height = height * 2;
        const context = canvas.getContext('2d')!; context.scale(2, 2); return { canvas, context };
    };
    const panel = surface(256, 192), c = panel.context;
    const fill = c.createLinearGradient(0, 12, 0, 180);
    fill.addColorStop(0, 'rgba(29,52,74,.98)'); fill.addColorStop(.5, 'rgba(16,34,53,.98)'); fill.addColorStop(1, 'rgba(9,23,40,.99)');
    c.beginPath(); c.roundRect(12, 12, 232, 168, 24);
    c.shadowColor = 'rgba(0,5,15,.65)'; c.shadowBlur = 24; c.shadowOffsetY = 5;
    c.fillStyle = fill; c.fill(); c.shadowBlur = 0; c.shadowOffsetY = 0;
    const rim = c.createLinearGradient(0, 12, 0, 180);
    rim.addColorStop(0, 'rgba(155,224,255,.65)'); rim.addColorStop(.4, 'rgba(102,166,205,.32)'); rim.addColorStop(1, 'rgba(75,123,157,.22)');
    c.strokeStyle = rim; c.lineWidth = 1; c.stroke();
    const shine = c.createLinearGradient(48, 0, 208, 0);
    shine.addColorStop(0, 'rgba(193,238,255,0)'); shine.addColorStop(.5, 'rgba(193,238,255,.34)'); shine.addColorStop(1, 'rgba(193,238,255,0)');
    c.strokeStyle = shine; c.beginPath(); c.moveTo(48, 14); c.lineTo(208, 14); c.stroke();
    const icon = surface(64, 64), i = icon.context, blue = i.createLinearGradient(0, 6, 0, 58);
    blue.addColorStop(0, '#4d9dcc'); blue.addColorStop(1, '#173e63');
    i.beginPath(); i.arc(32, 32, 25, 0, Math.PI * 2); i.shadowColor = 'rgba(66,174,235,.5)'; i.shadowBlur = 16;
    i.fillStyle = blue; i.fill(); i.shadowBlur = 0; i.strokeStyle = 'rgba(167,230,255,.65)'; i.lineWidth = 1; i.stroke();
    i.beginPath(); i.moveTo(18, 31); i.lineTo(32, 19); i.lineTo(46, 31); i.moveTo(22, 29); i.lineTo(22, 44);
    i.lineTo(29, 44); i.lineTo(29, 35); i.lineTo(35, 35); i.lineTo(35, 44); i.lineTo(42, 44); i.lineTo(42, 29);
    i.strokeStyle = '#ecfaff'; i.lineWidth = 2.3; i.lineJoin = 'round'; i.lineCap = 'round'; i.stroke();
    const ambient = surface(128, 128), a = ambient.context, glow = a.createRadialGradient(64, 42, 0, 64, 42, 86);
    glow.addColorStop(0, '#20435c'); glow.addColorStop(.55, '#0b1c2c'); glow.addColorStop(1, '#030914');
    a.fillStyle = glow; a.fillRect(0, 0, 128, 128);
    return { panel: panel.canvas, icon: icon.canvas, ambient: ambient.canvas };
}
