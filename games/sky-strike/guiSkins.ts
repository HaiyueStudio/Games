import { GuiButton, GuiElement, GuiImage, type GuiImageSource } from '@haiyue/engine/gui';

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
