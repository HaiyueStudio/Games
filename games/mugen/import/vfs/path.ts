import { MUGEN_LIMITS } from '../contract';
import { failMugen, mugenDiagnostic } from '../diagnostics';

const UTF8 = new TextEncoder();

export function asciiCaseFold(value: string): string {
  let result = '';
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    result += code >= 0x41 && code <= 0x5a ? String.fromCharCode(code + 0x20) : value[index];
  }
  return result;
}

export function compareMugenStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function canonicalizeMugenPath(sourcePath: string): string {
  if (sourcePath.includes('\0')) {
    failMugen(mugenDiagnostic('E_MUGEN_PATH_TRAVERSAL', 'vfs', 'fatal', 'release-resource', 'A MUGEN path contains a NUL character.'));
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(sourcePath)) {
    failMugen(mugenDiagnostic('E_MUGEN_PATH_REMOTE_REFERENCE', 'vfs', 'fatal', 'release-resource', `Remote MUGEN path is forbidden: ${sourcePath}`));
  }
  if (/^[a-z]:([\\/]|$)/i.test(sourcePath) || /^[\\/]{2}/.test(sourcePath)) {
    failMugen(mugenDiagnostic('E_MUGEN_PATH_UNC_OR_DRIVE', 'vfs', 'fatal', 'release-resource', `Drive or UNC MUGEN path is forbidden: ${sourcePath}`));
  }
  if (/^[\\/]/.test(sourcePath)) {
    failMugen(mugenDiagnostic('E_MUGEN_PATH_ABSOLUTE', 'vfs', 'fatal', 'release-resource', `Absolute MUGEN path is forbidden: ${sourcePath}`));
  }

  const sourceSegments = sourcePath.replace(/\\/g, '/').split('/');
  if (sourceSegments.some(segment => segment === '..')) {
    failMugen(mugenDiagnostic('E_MUGEN_PATH_TRAVERSAL', 'vfs', 'fatal', 'release-resource', `Parent traversal is forbidden in MUGEN path: ${sourcePath}`));
  }
  const segments = sourceSegments.filter(segment => segment.length > 0 && segment !== '.');
  if (segments.length === 0) {
    failMugen(mugenDiagnostic('E_MUGEN_PATH_TRAVERSAL', 'vfs', 'fatal', 'release-resource', 'A MUGEN path must name a file.'));
  }
  if (segments.length > MUGEN_LIMITS.directoryAndArchive.maxPathSegments) {
    failPathBudget(sourcePath, 'pathSegments', segments.length, MUGEN_LIMITS.directoryAndArchive.maxPathSegments);
  }
  const canonicalPath = segments.join('/');
  const utf8Bytes = UTF8.encode(canonicalPath).byteLength;
  if (utf8Bytes > MUGEN_LIMITS.directoryAndArchive.maxPathUtf8Bytes) {
    failPathBudget(sourcePath, 'pathUtf8Bytes', utf8Bytes, MUGEN_LIMITS.directoryAndArchive.maxPathUtf8Bytes);
  }
  return canonicalPath;
}

export function resolveMugenReference(fromCanonicalPath: string, reference: string): string {
  const normalizedReference = unquoteMugenValue(reference.trim()).replace(/\\/g, '/');
  canonicalizeMugenPath(normalizedReference);
  const separator = fromCanonicalPath.lastIndexOf('/');
  const directory = separator < 0 ? '' : fromCanonicalPath.slice(0, separator + 1);
  return canonicalizeMugenPath(`${directory}${normalizedReference}`);
}

export function unquoteMugenValue(value: string): string {
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
    return value.slice(1, -1);
  }
  return value;
}

function failPathBudget(path: string, budget: string, observed: number, limit: number): never {
  failMugen(mugenDiagnostic(
    'E_MUGEN_LIMIT_EXCEEDED',
    'budget',
    'fatal',
    'release-resource',
    `MUGEN path exceeds ${budget}: ${path}`,
    {},
    { budget, observed, limit },
  ));
}
