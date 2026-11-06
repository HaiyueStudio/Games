import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Same-version --no-save candidate installs must invalidate cached work too. */
export function dependencyFingerprint(root, names) {
  const hash = createHash('sha256');
  const walk = (directory, prefix) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const path = resolve(directory, entry.name), key = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(path, key);
      else if (entry.isFile()) { const bytes = readFileSync(path); hash.update(key); hash.update(String(bytes.byteLength)); hash.update(bytes); }
    }
  };
  for (const name of [...names].sort()) walk(resolve(root, 'node_modules', name), name);
  return hash.digest('hex');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  console.log(dependencyFingerprint(root, Object.keys(pkg.dependencies)));
}
