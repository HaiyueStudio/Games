export function launcherPaths(pageUrl, scriptUrl, gamesDirectory) {
  const gamesRoot = new URL(gamesDirectory, pageUrl).href;
  return { gamesRoot, catalogUrl: new URL('manifest.json', gamesRoot).href, siteRoot: new URL('./', scriptUrl).href };
}
