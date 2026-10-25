export function deviceMediaMatches(query: string, width: number, height: number, fallback: (query: string) => boolean): boolean {
  return query.split(',').some(clause => {
    let matched = true, handled = false;
    const rest = clause.replace(/\(\s*(min|max)-(width|height)\s*:\s*([\d.]+)px\s*\)|\(\s*(pointer|any-pointer|hover|any-hover|orientation)\s*:\s*([a-z-]+)\s*\)/g, (_match, bound: string, axis: string, limit: string, feature: string, value: string) => {
      handled = true;
      if (bound) { const size = axis === 'width' ? width : height; matched &&= bound === 'min' ? size >= Number(limit) : size <= Number(limit); }
      else matched &&= feature === 'orientation' ? value === (width > height ? 'landscape' : 'portrait') : feature.includes('pointer') ? value === 'coarse' : value === 'none';
      return '';
    }).replace(/\b(?:screen|all|and)\b/g, '').trim();
    return handled ? matched && (!rest || fallback(rest)) : fallback(clause);
  });
}

export function gameStyles(css: string, base: string, touch = false): string {
  return css.replace(/@media\s*([^{}]+)\{/g, (match, condition: string) => {
    if (/prefers-/.test(condition)) return match;
    let query = condition;
    if (touch) query = query.replace(/\(\s*(?:any-)?(?:pointer|hover)\s*:\s*[a-z-]+\s*\)/g, clause => `(${deviceMediaMatches(clause, 1, 1, () => false) ? 'min-width:0px' : 'width:0px'})`);
    if (query !== condition || /(?:min|max)-(?:width|height)|orientation/.test(query)) return `@container game-viewport ${query.replace(/\b(?:screen|all)\s*(?:and)?/g, '')} {`;
    return match;
  }).replace(/url\(\s*(['"]?)([^'"\s)]+)\1\s*\)/g, (_match, _quote: string, path: string) => `url("${new URL(path, base).href}")`)
    .replace(/(?<![\w.#/-])(?:html|body)\b|:root/g, '#game-document')
    .replace(/([\d.]+)(?:dvh|vh)\b/g, (_match, value: string) => `calc(var(--game-height) * ${Number(value) / 100})`)
    .replace(/([\d.]+)vw\b/g, (_match, value: string) => `calc(var(--game-width) * ${Number(value) / 100})`)
    .replace(/position:\s*fixed/g, 'position:absolute');
}
