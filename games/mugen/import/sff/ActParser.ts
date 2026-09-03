import { MUGEN_LIMITS } from '../contract';
import { failMugen, mugenDiagnostic } from '../diagnostics';
import type { MugenVfsFile } from '../vfs/MugenVfs';
import type { MugenDecodedPalette } from './types';

const ACT_BYTES = 256 * 3;

export function parseMugenAct(file: MugenVfsFile, group: number, item: number): MugenDecodedPalette {
  const bytes = file.read();
  if (bytes.byteLength !== ACT_BYTES && bytes.byteLength !== ACT_BYTES + 4) {
    failMugen(mugenDiagnostic(
      'E_MUGEN_DECODE_INVALID', 'decode', 'error', 'release-resource',
      `ACT palette must contain 768 color bytes, optionally followed by the 4-byte Adobe color-count/transparent-index trailer; got ${bytes.byteLength}.`,
      { canonicalPath: file.canonicalPath, sourceSha256: file.sha256 },
    ));
  }
  if (ACT_BYTES * 4 > MUGEN_LIMITS.sff.maxDecodedPaletteBytesPerPackage) {
    failMugen(mugenDiagnostic('E_MUGEN_LIMIT_EXCEEDED', 'budget', 'fatal', 'release-resource', 'ACT palette exceeds the decoded palette budget.', { canonicalPath: file.canonicalPath }, { budget: 'maxDecodedPaletteBytesPerPackage', observed: ACT_BYTES * 4, limit: MUGEN_LIMITS.sff.maxDecodedPaletteBytesPerPackage }));
  }
  const rgba = new Uint8Array(256 * 4);
  for (let sourceIndex = 0; sourceIndex < 256; sourceIndex++) {
    const destinationIndex = 255 - sourceIndex;
    const sourceOffset = sourceIndex * 3;
    const destinationOffset = destinationIndex * 4;
    rgba[destinationOffset] = bytes[sourceOffset]!;
    rgba[destinationOffset + 1] = bytes[sourceOffset + 1]!;
    rgba[destinationOffset + 2] = bytes[sourceOffset + 2]!;
    rgba[destinationOffset + 3] = destinationIndex === 0 ? 0 : 255;
  }
  return Object.freeze({ sourceIndex: 0, group, item, colorCount: 256, rgba, linkedToSourceIndex: null, source: 'act' });
}
