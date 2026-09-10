import { readFileSync } from 'node:fs';

export function readMugenTestArtifact(path) {
  return JSON.parse(readFileSync(new URL(`../mugen/fixtures/test-artifacts/${path}`, import.meta.url), 'utf8'));
}
