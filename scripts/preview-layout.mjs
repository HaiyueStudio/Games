export function publishGameModule(source) {
  return source.replace(/((?:\.\.\/){2,3})site\/game-host\.js/g, '$1game-host.js');
}
