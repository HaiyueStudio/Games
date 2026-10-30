/** All remaining Games suites run in both default and explicit all profiles. */
export function selectTests(files, profile = 'default') {
  if (!['default', 'all'].includes(profile)) throw new Error(`Unknown test profile: ${profile}`);
  return files.filter(file => file.endsWith('.test.mjs')).sort();
}
