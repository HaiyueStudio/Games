const KEY = 'haiyue-lobby-library-v1';

/** Local launcher preferences only; gameplay saves remain owned by Engine. */
export class LibraryState {
  constructor(storage) {
    this.storage = storage;
    this.favorites = [];
    this.recent = [];
    try {
      const value = JSON.parse(storage?.getItem(KEY) ?? 'null');
      const ids = list => Array.isArray(list) ? [...new Set(list.filter(id => typeof id === 'string' && id.length < 100))].slice(0, 200) : [];
      this.favorites = ids(value?.favorites);
      this.recent = ids(value?.recent).slice(0, 12);
    } catch { /* A blocked or corrupted preference store must not prevent play. */ }
  }

  reconcile(games) {
    const known = new Set(games.map(game => game.id));
    this.favorites = this.favorites.filter(id => known.has(id));
    this.recent = this.recent.filter(id => known.has(id));
  }

  toggleFavorite(id) {
    this.favorites = this.favorites.includes(id) ? this.favorites.filter(value => value !== id) : [...this.favorites, id];
    this.persist();
  }

  recordLaunch(id) {
    this.recent = [id, ...this.recent.filter(value => value !== id)].slice(0, 12);
    this.persist();
  }

  persist() {
    try { this.storage?.setItem(KEY, JSON.stringify({ favorites: this.favorites, recent: this.recent })); }
    catch { /* Preferences continue to work for the current session. */ }
  }
}
