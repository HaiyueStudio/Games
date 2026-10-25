import { basename } from 'node:path';

/** MUGEN is unfinished; explicit all/mugen profiles retain its full coverage. */
export function selectTests(files, profile = 'default') {
  if (!['default', 'all', 'mugen'].includes(profile)) throw new Error(`Unknown test profile: ${profile}`);
  return files.filter(file => file.endsWith('.test.mjs')).filter(file => {
    const mugen = /^mugen(?:[.-]|$)/.test(basename(file)) || /(?:^|[/\\])mugen[/\\]/.test(file);
    return profile === 'all' || (profile === 'mugen' ? mugen : !mugen);
  }).sort();
}
