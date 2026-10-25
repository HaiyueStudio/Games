import { GuiDirtyFlags, type GuiImage } from '@haiyue/engine/gui';
import { CARD_TEXTURE_HEIGHT, CARD_TEXTURE_WIDTH, cardPreview } from './cardTextures';

interface Card { id: string; url: string; node: GuiImage; visible: boolean }
interface Source { image: HTMLImageElement; state: 'queued' | 'loading' | 'ready' | 'error' }
interface Slot { texture: GPUTexture; card: Card | null; uploaded: string }
const CONCURRENCY = 2;

/** The lobby's visible artwork window owns borrowed GUI textures, never one texture per game. */
export class CarouselArtwork {
  private device: GPUDevice | null = null;
  private readonly sources = new Map<string, Source>();
  private readonly slots: Slot[] = [];
  private readonly scratch = document.createElement('canvas');
  private priority: string[] = [];
  private disposed = false;
  private capacity = 0;
  private requests = 0;
  private cancelled = 0;
  private uploads = 0;
  private allocations = 0;
  private retired = 0;
  private plan = '';
  private dirty = true;
  constructor(private readonly ready: (url: string, image: HTMLImageElement) => void) {}
  initialize(device: GPUDevice): void { this.device = device; }
  get(url: string): HTMLImageElement | null { const source = this.sources.get(url); return source?.state === 'ready' ? source.image : null; }
  sync(cards: Card[], capacity: number, wallpaper: readonly string[], requested: string): void {
    if (this.disposed) return;
    const plan = JSON.stringify([capacity, cards.map(card => [card.id, card.url, card.visible]), wallpaper, requested]);
    if (plan === this.plan && !this.dirty) return;
    this.plan = plan; this.dirty = false;
    this.capacity = capacity;
    const wanted = new Map(cards.map(card => [card.id, card]));
    for (const slot of this.slots) {
      if (slot.card && (!wanted.has(slot.card.id) || wanted.get(slot.card.id)!.url !== slot.card.url)) {
        slot.card.node.setSource(null); slot.card = null; slot.uploaded = '';
      }
    }
    while (this.slots.length > capacity) {
      const index = this.slots.findIndex(slot => !slot.card);
      const slot = this.slots.splice(index < 0 ? this.slots.length - 1 : index, 1)[0]!;
      slot.card?.node.setSource(null); this.retire(slot.texture);
    }
    if (this.device) for (const card of cards) {
      let slot = this.slots.find(slot => slot.card?.id === card.id);
      if (!slot) {
        slot = this.slots.find(slot => !slot.card);
        if (!slot && this.slots.length < capacity) {
          slot = { texture: this.device.createTexture({ label: 'Game OS card preview slot', size: [CARD_TEXTURE_WIDTH * 2, CARD_TEXTURE_HEIGHT * 2], format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT }), card: null, uploaded: '' };
          this.slots.push(slot); this.allocations++;
        }
        if (!slot) continue;
      }
      slot.card = card;
      const image = this.get(card.url);
      if (image && slot.uploaded !== card.url) {
        cardPreview(image, this.scratch);
        this.device.queue.copyExternalImageToTexture({ source: this.scratch }, { texture: slot.texture }, [this.scratch.width, this.scratch.height]);
        slot.uploaded = card.url; this.uploads++;
        card.node.setSource(slot.texture); card.node.markDirty(GuiDirtyFlags.Visual);
      }
    }
    // Wallpaper and on-screen cards precede the single-card overscan. No catalogue-wide decoded cache.
    this.priority = [...new Set([requested, ...cards.filter(card => card.visible).map(card => card.url), ...cards.map(card => card.url), ...wallpaper].filter(Boolean))];
    const needed = new Set(this.priority);
    for (const [url, source] of this.sources) if (!needed.has(url)) {
      this.release(source); this.sources.delete(url);
    }
    for (const url of this.priority) if (!this.sources.has(url)) {
      const image = new Image(); image.decoding = 'async';
      this.sources.set(url, { image, state: 'queued' });
    }
    this.pump();
  }
  private pump(): void {
    let active = [...this.sources.values()].filter(source => source.state === 'loading').length;
    for (const url of this.priority) {
      if (active >= CONCURRENCY) break;
      const source = this.sources.get(url);
      if (source?.state !== 'queued') continue;
      source.state = 'loading'; active++; this.requests++;
      const finish = (success: boolean) => {
        if (this.disposed || this.sources.get(url) !== source) return;
        source.image.onload = null; source.image.onerror = null;
        source.state = success && source.image.naturalWidth > 0 ? 'ready' : 'error';
        this.dirty = true;
        if (source.state === 'ready') this.ready(url, source.image);
        this.pump();
      };
      source.image.onload = () => finish(true); source.image.onerror = () => finish(false); source.image.src = url;
    }
  }
  private release(source: Source): void {
    if (source.state === 'loading') this.cancelled++;
    source.image.onload = null; source.image.onerror = null; source.image.removeAttribute('src');
  }
  private retire(texture: GPUTexture): void {
    this.retired++;
    const release = () => { texture.destroy(); this.retired--; };
    void this.device!.queue.onSubmittedWorkDone().then(release, release);
  }
  snapshot() {
    return { capacity: this.capacity, slots: this.slots.length, allocations: this.allocations, retired: this.retired, uploads: this.uploads, requests: this.requests, cancelled: this.cancelled,
      sourceCount: this.sources.size, pending: [...this.sources.values()].filter(source => source.state === 'queued' || source.state === 'loading').length,
      inFlight: [...this.sources.values()].filter(source => source.state === 'loading').length,
      failed: [...this.sources].filter(([, source]) => source.state === 'error').map(([url]) => url),
      cards: this.slots.filter(slot => slot.card).map(slot => ({ id: slot.card!.id, url: slot.card!.url, ready: !!slot.uploaded, visible: slot.card!.visible })) };
  }
  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const slot of this.slots) { slot.card?.node.setSource(null); this.retire(slot.texture); }
    this.slots.length = 0;
    for (const source of this.sources.values()) this.release(source);
    this.sources.clear(); this.priority = []; this.scratch.width = this.scratch.height = 0;
  }
}
