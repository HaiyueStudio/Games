import { GuiButton, GuiElement, GuiLabel, GuiImage, type GuiImageSource, type GuiRoot } from '@haiyue/engine/gui';
import { CalendarRasterSurface } from './raster-surface';
import type { CalendarRaster } from './hint-ui';
import type { CalendarLanguage } from './locale';
import type { CalendarPurchases } from './purchases';
import type { calendarLayout } from './viewport';

export const PURCHASE_COPY = {
  zh: { title: '解锁完整版', owned: '完整版已解锁', features: '一次购买 · 永久解锁提示和任意日期', free: '每天的当日拼图免费，通关记录始终保留', buy: '购买', restore: '恢复购买', retry: '重新连接', today: '玩今天', close: '返回',
    loading: '正在连接商店…', ready: '价格由商店提供，不是订阅', purchasing: '请在商店中确认购买…', restoring: '正在恢复购买…', pending: '等待付款确认，请勿重复购买', cancelled: '已取消，当前拼图已保留', offline: '网络不可用，请连接网络后重试', unavailable: '商品暂不可用，请稍后重试', error: '暂时无法验证购买，请重试', revoked: '购买已撤销，付费功能已关闭', restored: '购买已恢复', empty: '当前商店账户没有可恢复的购买' },
  en: { title: 'Unlock full game', owned: 'Full game unlocked', features: 'One purchase · Hints and any date, forever', free: "Today's puzzle is free. Your history stays saved", buy: 'Buy', restore: 'Restore purchases', retry: 'Reconnect', today: 'Play today', close: 'Back',
    loading: 'Connecting to the store…', ready: 'Store price · No subscription', purchasing: 'Confirm your purchase in the store…', restoring: 'Restoring purchases…', pending: 'Payment pending. Please do not buy again', cancelled: 'Cancelled. Your puzzle is preserved', offline: 'Offline. Please reconnect and retry', unavailable: 'Product unavailable. Please try again later', error: 'Cannot verify purchase. Please retry', revoked: 'Purchase revoked. Paid features are locked', restored: 'Purchase restored', empty: 'No purchase found for this store account' },
  ja: { title: '完全版を購入', owned: '完全版は購入済みです', features: '一度の購入でヒントと全日付を永久解放', free: '当日のパズルは無料。クリア記録は保持されます', buy: '購入', restore: '購入を復元', retry: '再接続', today: '今日をプレイ', close: '戻る',
    loading: 'ストアに接続中…', ready: 'ストアの価格です。定期購入ではありません', purchasing: 'ストアで購入を確認してください…', restoring: '購入を復元中…', pending: '支払い確認待ちです。再購入は不要です', cancelled: 'キャンセルしました。パズルは保持されます', offline: 'オフラインです。接続後に再試行してください', unavailable: '商品を取得できません。後でお試しください', error: '購入を確認できません。再試行してください', revoked: '購入が取り消され、有料機能がロックされました', restored: '購入を復元しました', empty: 'このストアアカウントには購入がありません' },
} as const;
export const PURCHASE_GLYPHS = JSON.stringify(PURCHASE_COPY) + '0123456789., $€£¥₩₹₽₫฿₱₺₪₴₦₡₲₵₸₼₾₿ R CHF CAD AUD HKD TWD CNY JPY USD';

export class CalendarPurchaseView {
  visible = false;
  private readonly controls: GuiElement[] = [];
  private readonly labels: Array<() => void> = [];
  private readonly buy: GuiButton;
  private readonly priceImage: GuiImage;
  private readonly priceSurface: CalendarRasterSurface;
  private priceCaption = '';
  private readonly restore: GuiButton;
  private readonly retry: GuiButton;
  constructor(private readonly options: {
    root: GuiRoot; layout: () => ReturnType<typeof calendarLayout>; language: () => CalendarLanguage;
    raster: CalendarRaster; purchases: CalendarPurchases; close: () => void; today: () => void;
    register: (id: string, element: GuiElement) => void;
  }) {
    this.priceSurface = new CalendarRasterSurface(options.raster.canvas, !!options.raster.texture);
    const box = () => ({ x: (options.layout().width - 820) / 2, y: (options.layout().height - 470) / 2 });
    const place = <T extends GuiElement>(id: string, element: T, x: number, y: number, width: number, height: number): T => {
      element.layout = () => { element.rect = { x: box().x + x, y: box().y + y, width, height }; };
      this.controls.push(element); options.root.add(element); options.register(id, element); return element;
    };
    const backdrop = place('purchaseBackdrop', new GuiElement({ style: { backgroundColor: 'rgba(22,51,47,0.4)', radius: 0 }, onClick: () => {} }), 0, 0, 0, 0);
    backdrop.layout = () => { backdrop.rect = { x: 0, y: 0, width: options.layout().width, height: options.layout().height }; };
    place('purchasePanel', new GuiElement({ style: { backgroundColor: '#f8fcf9', radius: 20 } }), 0, 0, 820, 470);
    const label = (id: string, value: () => string, y: number, size = 23) => {
      const element = place(id, new GuiLabel({ text: value(), textAlign: 'center', style: { color: '#183c3b' } }), 30, y, 760, 48);
      element.layout = () => { element.rect = { x: box().x + 30, y: box().y + y, width: 760, height: 48 }; element.setFontSize(size * options.layout().scale); };
      this.labels.push(() => element.setText(value()));
    };
    const button = (id: string, value: () => string, x: number, y: number, width: number, action: () => void) => {
      const element = place(id, new GuiButton({ text: value(), onClick: action }), x, y, width, 60);
      this.labels.push(() => { element.text = value(); element.markDirty(); }); return element;
    };
    label('purchaseTitle', () => this.state.entitled ? this.copy.owned : this.copy.title, 25, 32);
    label('purchaseFeatures', () => this.copy.features, 85);
    label('purchaseFree', () => this.copy.free, 125, 20);
    label('purchaseStatus', () => this.copy[this.state.phase], 180, 21);
    this.buy = button('purchaseBuy', () => this.state.price ? '' : this.copy.buy, 40, 250, 360, () => { void options.purchases.purchase(); });
    this.priceImage = place('purchasePrice', new GuiImage({ disabled: true }), 50, 256, 340, 48);
    this.restore = button('purchaseRestore', () => this.copy.restore, 420, 250, 360, () => { void options.purchases.restore(); });
    this.retry = button('purchaseRetry', () => this.copy.retry, 40, 335, 230, () => { void options.purchases.refresh(); });
    button('purchaseToday', () => this.copy.today, 295, 335, 230, options.today);
    button('purchaseClose', () => this.copy.close, 550, 335, 230, options.close);
    this.setVisible(false);
  }
  private get copy() { return PURCHASE_COPY[this.options.language()]; }
  private get state() { return this.options.purchases.snapshot(); }
  setVisible(visible: boolean): void { this.visible = visible; for (const element of this.controls) element.setVisible(visible); this.refresh(); }
  dispose(): void { this.priceSurface.dispose(); }
  refresh(): void {
    for (const label of this.labels) label();
    const state = this.state;
    this.buy.disabled = state.busy || state.entitled || !state.canPurchase || !state.price || state.phase === 'pending';
    this.restore.disabled = state.busy;
    this.retry.disabled = state.busy;
    // Rasterize the exact store string using the platform font. A fixed glyph
    // atlas cannot anticipate every currency, script or non-breaking separator.
    const caption = state.price ? `${this.copy.buy} · ${state.price}` : '';
    const key = `${caption}:${this.buy.disabled}`;
    if (caption && key !== this.priceCaption) {
      const canvas = this.priceSurface.acquire(680, 96), c = canvas.getContext('2d')!;
      c.font = '500 46px sans-serif';
      const width = c.measureText(caption).width;
      if (width > 660) c.font = `500 ${46 * 660 / width}px sans-serif`;
      c.fillStyle = this.buy.disabled ? '#52716a' : '#183c3b'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(caption, 340, 48);
      this.priceImage.setSource((this.options.raster.texture?.(canvas, 'calendar-store-price') ?? canvas) as GuiImageSource);
    }
    this.priceCaption = key; this.priceImage.setVisible(this.visible && !!caption);
    this.buy.markDirty(); this.restore.markDirty(); this.retry.markDirty();
  }
}
