import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute } from 'node:path';

export function devDependencies() {
  const output = process.env.GAME_DEV_DEPENDENCIES_FILE;
  return {
    name: 'haiyue-dev-dependencies',
    generateBundle() {
      if (!output) return;
      const modules = [...this.getModuleIds()].filter(path => isAbsolute(path));
      const extra = this.getWatchFiles().filter(path => isAbsolute(path) && !/\.[cm]?tsx?$/.test(path));
      mkdirSync(dirname(output), { recursive: true });
      writeFileSync(output, JSON.stringify([...new Set([...modules, ...extra])].sort()));
    },
  };
}
