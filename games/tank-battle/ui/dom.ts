export function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id); if (!el) throw new Error(`Missing game element: ${id}`); return el as T;
}
