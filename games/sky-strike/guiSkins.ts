import { GuiButton, GuiElement, GuiImage, GuiLabel, type GuiImageSource } from '@haiyue/engine/gui';

export type SkyStrikeGuiImage = (id: string) => GuiImageSource;
/** Compose the game's generated skin with a real engine GUI button and live text. */
export function skyStrikeButton(parent: GuiElement, image: SkyStrikeGuiImage, text: string, onClick: () => void, arrow?: 'left' | 'right'): GuiButton {
  let skin: GuiImage;
  const button = parent.add(new GuiButton({
    text, onClick,
    onPointerEnter: () => skin.setTint('#ffffff'),
    onPointerDown: () => skin.setTint('#8ea9d1'),
    onPointerUp: () => skin.setTint('#ffffff'),
    onPointerLeave: () => skin.setTint('#d8dcf4'),
    style: { backgroundColor: '#00000000', hoverBackgroundColor: '#00000000', borderColor: '#00000000', color: '#effbff', hoverColor: '#ffffff', radius: 0 },
  }));
  const sourceKey = arrow ? 'assets/gui-arrow.png' : 'assets/gui-launch.png';
  skin = button.add(new GuiImage({
    width: '100%', height: '100%', disabled: true,
    source: image(sourceKey), sourceKey,
    uv: arrow === 'right' ? [1, 0.08, -1, 0.82] : arrow ? [0, 0.08, 1, 0.82] : [0, 0.15, 1, 0.69],
    tint: '#d8dcf4',
  }));
  return button;
}

/** Live caption stays outside the generated icon; no language is baked into the art. */
export function skyStrikeIconButton(parent: GuiElement, image: SkyStrikeGuiImage, icon: 'bomb' | 'pause' | 'gear', onClick: () => void) {
  let skin: GuiImage;
  const button = parent.add(new GuiButton({ text: '', onClick,
    onPointerDown: () => skin.setTint('#8199bd'), onPointerUp: () => skin.setTint('#ffffff'), onPointerLeave: () => skin.setTint('#ffffff'),
    style: { backgroundColor: '#00000000', hoverBackgroundColor: '#00000000', borderColor: '#00000000', radius: 0 } }));
  const sourceKey = `assets/gui-${icon}.png`;
  skin = button.add(new GuiImage({ source: image(sourceKey), sourceKey, disabled: true }));
  const caption = button.add(new GuiLabel({ fontSize: 12, textAlign: 'center', disabled: true, style: { color: icon === 'bomb' ? '#ffe1a1' : '#bdf6ff' } }));
  skin.layout = rect => { const size = Math.min(rect.width, rect.height - 18); skin.rect = { x: rect.x + (rect.width-size)/2, y: rect.y, width: size, height: size }; };
  caption.layout = rect => { caption.rect = { x: rect.x, y: rect.y + rect.height - 19, width: rect.width, height: 18 }; };
  return { button, caption, setDisabled(value: boolean) { button.setDisabled(value); skin.setTint(value ? '#505568' : '#ffffff'); } };
}
