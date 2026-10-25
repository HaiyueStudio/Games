export function hudFrame(width: number, height: number) {
  const compact = width < 600, size = compact ? 44 : 48, margin = compact ? 16 : 24;
  const cardHeight = Math.min(584, Math.max(220, height - 112)), cardWidth = Math.min(460, width - 32);
  const timerWidth = width < 360 ? 86 : compact ? 118 : 154;
  const card = { x: (width - cardWidth) / 2, y: Math.max(76, (height - cardHeight) / 2 + 18), width: cardWidth, height: cardHeight };
  const actionHeight = Math.min(58,Math.max(44,cardHeight*.105));
  return {
    compact,
    music: { x: width - margin - size * 2 - 10, y: 16, width: size, height: size },
    pause: { x: width - margin - size, y: 16, width: size, height: size },
    card,
    action: {x:card.x+32,y:card.y+card.height-actionHeight-Math.max(24,card.height*.055),width:card.width-64,height:actionHeight},
    timer: { x: width / 2 - timerWidth / 2, y: 10, width: timerWidth, height: compact ? 64 : 72 },
  };
}
