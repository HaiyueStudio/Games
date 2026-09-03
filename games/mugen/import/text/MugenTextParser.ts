import { MUGEN_LIMITS, type MugenSourceEncoding } from '../contract';
import { failMugen, mugenDiagnostic, type MugenSourceLocation } from '../diagnostics';
import type { MugenVfsFile } from '../vfs/MugenVfs';
import { asciiCaseFold } from '../vfs/path';
import { decodeMugenText } from './encoding';

export interface MugenTextSpan {
  readonly canonicalPath: string;
  readonly startByte: number;
  readonly endByte: number;
  readonly line: number;
  readonly column: number;
}

export interface MugenCommentToken {
  readonly kind: 'comment';
  readonly value: string;
  readonly span: MugenTextSpan;
}

export interface MugenBlankToken {
  readonly kind: 'blank';
  readonly span: MugenTextSpan;
}

export interface MugenSectionToken {
  readonly kind: 'section';
  readonly name: string;
  readonly foldedName: string;
  readonly span: MugenTextSpan;
}

export interface MugenAssignmentToken {
  readonly kind: 'assignment';
  readonly key: string;
  readonly foldedKey: string;
  readonly value: string;
  readonly sectionIndex: number | null;
  readonly span: MugenTextSpan;
  readonly keySpan: MugenTextSpan;
  readonly valueSpan: MugenTextSpan;
  readonly trailingComment?: MugenCommentToken;
}

export interface MugenDirectiveToken {
  readonly kind: 'directive';
  readonly value: string;
  readonly sectionIndex: number | null;
  readonly span: MugenTextSpan;
  readonly trailingComment?: MugenCommentToken;
}

export type MugenTextToken = MugenCommentToken | MugenBlankToken | MugenSectionToken | MugenAssignmentToken | MugenDirectiveToken;

export interface MugenTextSection {
  readonly name: string;
  readonly foldedName: string;
  readonly header: MugenSectionToken;
  readonly tokenStart: number;
  readonly tokenEnd: number;
}

export interface MugenTextDocument {
  readonly canonicalPath: string;
  readonly sourceSha256: string;
  readonly encoding: MugenSourceEncoding;
  readonly hadUtf8Bom: boolean;
  readonly normalizedText: string;
  readonly tokens: readonly MugenTextToken[];
  readonly sections: readonly MugenTextSection[];
}

export function parseMugenTextFile(file: MugenVfsFile, explicitEncoding?: MugenSourceEncoding): MugenTextDocument {
  const decoded = decodeMugenText(file.read(), file.canonicalPath, explicitEncoding);
  const tokens: MugenTextToken[] = [];
  const mutableSections: Array<Omit<MugenTextSection, 'tokenEnd'> & { tokenEnd: number }> = [];
  let currentSectionIndex: number | null = null;
  let lineStart = 0;
  let lineNumber = 1;
  while (lineStart <= decoded.text.length) {
    const newline = decoded.text.indexOf('\n', lineStart);
    const lineEnd = newline < 0 ? decoded.text.length : newline;
    const sourceStart = decoded.byteBoundaries[lineStart]!;
    const sourceEnd = decoded.byteBoundaries[lineEnd]!;
    if (sourceEnd - sourceStart > MUGEN_LIMITS.text.maxLineBytes) {
      failMugen(mugenDiagnostic(
        'E_MUGEN_LIMIT_EXCEEDED',
        'budget',
        'fatal',
        'release-resource',
        `MUGEN text line exceeds the byte budget in ${file.canonicalPath}:${lineNumber}.`,
        sourceLocation(file, sourceStart, lineNumber, 1),
        { budget: 'lineBytes', observed: sourceEnd - sourceStart, limit: MUGEN_LIMITS.text.maxLineBytes },
      ));
    }
    const line = decoded.text.slice(lineStart, lineEnd);
    const parsed = parseLine(line, lineStart, lineNumber, file, decoded.byteBoundaries, currentSectionIndex);
    if (parsed.token.kind === 'section') {
      if (mutableSections.length > 0) mutableSections[mutableSections.length - 1]!.tokenEnd = tokens.length;
      currentSectionIndex = mutableSections.length;
      mutableSections.push({
        name: parsed.token.name,
        foldedName: parsed.token.foldedName,
        header: parsed.token,
        tokenStart: tokens.length,
        tokenEnd: tokens.length,
      });
      if (mutableSections.length > MUGEN_LIMITS.text.maxSectionsPerFile) failCountBudget(file, 'sectionsPerFile', mutableSections.length, MUGEN_LIMITS.text.maxSectionsPerFile, parsed.token.span);
    }
    tokens.push(parsed.token);
    if (parsed.comment && parsed.token.kind !== 'comment') tokens.push(parsed.comment);
    if (tokens.length > MUGEN_LIMITS.text.maxTokensPerFile) failCountBudget(file, 'tokensPerFile', tokens.length, MUGEN_LIMITS.text.maxTokensPerFile, parsed.token.span);
    if (newline < 0) break;
    lineStart = newline + 1;
    lineNumber++;
  }
  if (mutableSections.length > 0) mutableSections[mutableSections.length - 1]!.tokenEnd = tokens.length;
  const keyCount = tokens.reduce((count, token) => count + (token.kind === 'assignment' ? 1 : 0), 0);
  if (keyCount > MUGEN_LIMITS.text.maxKeysPerFile) {
    failCountBudget(file, 'keysPerFile', keyCount, MUGEN_LIMITS.text.maxKeysPerFile, tokens[tokens.length - 1]?.span);
  }
  return Object.freeze({
    canonicalPath: file.canonicalPath,
    sourceSha256: file.sha256,
    encoding: decoded.encoding,
    hadUtf8Bom: decoded.hadUtf8Bom,
    normalizedText: decoded.text,
    tokens: Object.freeze(tokens),
    sections: Object.freeze(mutableSections.map(section => Object.freeze({ ...section }))),
  });
}

export function assignmentsInSection(document: MugenTextDocument, sectionName: string): readonly MugenAssignmentToken[] {
  const foldedName = asciiCaseFold(sectionName);
  return document.tokens.filter((token): token is MugenAssignmentToken => token.kind === 'assignment'
    && token.sectionIndex !== null
    && document.sections[token.sectionIndex]?.foldedName === foldedName);
}

function parseLine(
  line: string,
  absoluteStart: number,
  lineNumber: number,
  file: MugenVfsFile,
  byteBoundaries: Uint32Array,
  sectionIndex: number | null,
): { token: MugenTextToken; comment?: MugenCommentToken } {
  const commentOffset = findCommentOffset(line, file, absoluteStart, lineNumber, byteBoundaries);
  const contentEnd = commentOffset < 0 ? line.length : commentOffset;
  const content = line.slice(0, contentEnd);
  const [trimStart, trimEnd] = trimRange(content);
  const fullSpan = span(file.canonicalPath, byteBoundaries, absoluteStart + trimStart, absoluteStart + trimEnd, lineNumber, trimStart + 1);
  const comment = commentOffset < 0 ? undefined : Object.freeze({
    kind: 'comment' as const,
    value: line.slice(commentOffset + 1),
    span: span(file.canonicalPath, byteBoundaries, absoluteStart + commentOffset, absoluteStart + line.length, lineNumber, commentOffset + 1),
  });
  if (trimStart === trimEnd) {
    if (comment) return { token: comment };
    return { token: Object.freeze({ kind: 'blank', span: span(file.canonicalPath, byteBoundaries, absoluteStart, absoluteStart + line.length, lineNumber, 1) }) };
  }
  const value = content.slice(trimStart, trimEnd);
  if (value === '[' && comment) return { token: comment };
  if (/^[=_*-]{3,}$/u.test(value)) {
    return { token: Object.freeze({ kind: 'directive', value, sectionIndex, span: fullSpan }), ...(comment ? { comment } : {}) };
  }
  if (value.startsWith('[')) {
    const firstClosingBracket = value.indexOf(']');
    const headerEnd = firstClosingBracket === value.length - 1
      ? firstClosingBracket
      : legacyStateHeaderEnd(value, firstClosingBracket);
    if (headerEnd < 0) {
      if (isDecorativeBracketDirective(value, firstClosingBracket)) {
        return { token: Object.freeze({ kind: 'directive', value, sectionIndex, span: fullSpan }), ...(comment ? { comment } : {}) };
      }
      failSyntax(file, byteBoundaries, absoluteStart + trimStart, lineNumber, trimStart + 1, 'Malformed MUGEN section header.');
    }
    const name = value.slice(1, headerEnd).trim();
    if (name === '') failSyntax(file, byteBoundaries, absoluteStart + trimStart, lineNumber, trimStart + 1, 'MUGEN section name cannot be empty.');
    return { token: Object.freeze({ kind: 'section', name, foldedName: asciiCaseFold(name), span: fullSpan }), ...(comment ? { comment } : {}) };
  }

  // Some legacy WinMUGEN CNS files use a leading apostrophe as an informal
  // comment marker. Preserve that line as a directive instead of interpreting
  // the apostrophe as the start of a single-quoted assignment.
  const assignmentOffset = value.startsWith("'")
    ? -1
    : findOutsideQuotes(value, '=', file, absoluteStart + trimStart, lineNumber, byteBoundaries);
  if (assignmentOffset >= 0) {
    const rawKey = value.slice(0, assignmentOffset);
    const rawValue = value.slice(assignmentOffset + 1);
    const [keyStart, keyEnd] = trimRange(rawKey);
    const [valueStart, valueEnd] = trimRange(rawValue);
    const key = rawKey.slice(keyStart, keyEnd);
    if (key === '') failSyntax(file, byteBoundaries, absoluteStart + trimStart, lineNumber, trimStart + 1, 'MUGEN assignment key cannot be empty.');
    const assignment: MugenAssignmentToken = Object.freeze({
      kind: 'assignment',
      key,
      foldedKey: asciiCaseFold(key),
      value: rawValue.slice(valueStart, valueEnd),
      sectionIndex,
      span: fullSpan,
      keySpan: span(file.canonicalPath, byteBoundaries, absoluteStart + trimStart + keyStart, absoluteStart + trimStart + keyEnd, lineNumber, trimStart + keyStart + 1),
      valueSpan: span(file.canonicalPath, byteBoundaries, absoluteStart + trimStart + assignmentOffset + 1 + valueStart, absoluteStart + trimStart + assignmentOffset + 1 + valueEnd, lineNumber, trimStart + assignmentOffset + valueStart + 2),
      ...(comment ? { trailingComment: comment } : {}),
    });
    return { token: assignment, ...(comment ? { comment } : {}) };
  }
  const directive: MugenDirectiveToken = Object.freeze({
    kind: 'directive',
    value,
    sectionIndex,
    span: fullSpan,
    ...(comment ? { trailingComment: comment } : {}),
  });
  return { token: directive, ...(comment ? { comment } : {}) };
}

function legacyStateHeaderEnd(value: string, firstClosingBracket: number): number {
  const candidateEnd = firstClosingBracket < 0 ? value.length : firstClosingBracket;
  if (candidateEnd <= 1) return -1;
  const name = value.slice(1, candidateEnd).trim();
  const numericState = /^state(?:def)?\s+-?\d+(?:\s*,.*)?$/iu.test(name);
  const labeledController = !name.includes('[') && !name.includes(']') && /^state\s+[^,=;]+(?:\s*,.*)?$/iu.test(name);
  if (!numericState && !labeledController) return -1;
  if (firstClosingBracket < 0) return candidateEnd;
  const rawSuffix = value.slice(firstClosingBracket + 1).trim();
  if (rawSuffix === ']') return firstClosingBracket;
  const suffix = rawSuffix.endsWith(']') ? rawSuffix.slice(0, -1).trim() : rawSuffix;
  const hasStructuralCharacter = suffix.includes('[') || suffix.includes(']') || suffix.includes('=') || suffix.includes(';');
  return suffix !== '' && !hasStructuralCharacter ? firstClosingBracket : -1;
}

function isDecorativeBracketDirective(value: string, firstClosingBracket: number): boolean {
  if (firstClosingBracket <= 1) return false;
  const suffix = value.slice(firstClosingBracket + 1).trim();
  return /^-{3,}$/u.test(suffix);
}

function findCommentOffset(
  line: string,
  file: MugenVfsFile,
  absoluteStart: number,
  lineNumber: number,
  byteBoundaries: Uint32Array,
): number {
  const firstContent = line.search(/\S/u);
  if (firstContent >= 0 && line[firstContent] === "'") {
    return line.indexOf(';', firstContent + 1);
  }
  if (firstContent >= 0 && line[firstContent] === '[') {
    const closingOffset = line.indexOf(']', firstContent + 1);
    if (closingOffset >= 0) {
      // Some WinMUGEN characters use semicolons as descriptive separators in
      // section names, for example `[State -2,Null; VelSet]`.  A semicolon is
      // only a comment delimiter after the closing bracket on a header line.
      const suffixStart = closingOffset + 1;
      const suffixOffset = findOutsideQuotes(line.slice(suffixStart), ';', file, absoluteStart + suffixStart, lineNumber, byteBoundaries);
      return suffixOffset < 0 ? -1 : suffixStart + suffixOffset;
    }
  }
  if (!line.includes(';')) return -1;
  return findOutsideQuotes(line, ';', file, absoluteStart, lineNumber, byteBoundaries);
}

function findOutsideQuotes(
  value: string,
  needle: string,
  file: MugenVfsFile,
  absoluteStart: number,
  lineNumber: number,
  byteBoundaries: Uint32Array,
): number {
  let quote = '';
  let quoteStart = -1;
  for (let index = 0; index < value.length; index++) {
    const character = value[index]!;
    if (quote !== '') {
      if (character === quote && value[index - 1] !== '\\') {
        const startByte = byteBoundaries[absoluteStart + quoteStart]!;
        const endByte = byteBoundaries[absoluteStart + index + 1]!;
        if (endByte - startByte > MUGEN_LIMITS.text.maxQuotedStringBytes) {
          failCountBudget(file, 'quotedStringBytes', endByte - startByte, MUGEN_LIMITS.text.maxQuotedStringBytes, span(file.canonicalPath, byteBoundaries, absoluteStart + quoteStart, absoluteStart + index + 1, lineNumber, quoteStart + 1));
        }
        quote = '';
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      quoteStart = index;
      continue;
    }
    if (character === needle) return index;
  }
  if (quote !== '') failSyntax(file, byteBoundaries, absoluteStart + quoteStart, lineNumber, quoteStart + 1, 'Unterminated quoted MUGEN value.');
  return -1;
}

function trimRange(value: string): readonly [number, number] {
  let start = 0;
  let end = value.length;
  while (start < end && /\s/.test(value[start]!)) start++;
  while (end > start && /\s/.test(value[end - 1]!)) end--;
  return [start, end];
}

function span(path: string, boundaries: Uint32Array, start: number, end: number, line: number, column: number): MugenTextSpan {
  return Object.freeze({ canonicalPath: path, startByte: boundaries[start]!, endByte: boundaries[end]!, line, column });
}

function sourceLocation(file: MugenVfsFile, byteOffset: number, line: number, column: number): MugenSourceLocation {
  return { canonicalPath: file.canonicalPath, sourceSha256: file.sha256, byteOffset, line, column };
}

function failSyntax(file: MugenVfsFile, boundaries: Uint32Array, offset: number, line: number, column: number, message: string): never {
  failMugen(mugenDiagnostic('E_MUGEN_TEXT_SYNTAX', 'text-parse', 'error', 'release-resource', message, sourceLocation(file, boundaries[offset]!, line, column)));
}

function failCountBudget(file: MugenVfsFile, budget: string, observed: number, limit: number, tokenSpan?: MugenTextSpan): never {
  failMugen(mugenDiagnostic(
    'E_MUGEN_LIMIT_EXCEEDED',
    'budget',
    'fatal',
    'release-resource',
    `MUGEN text exceeds ${budget} budget in ${file.canonicalPath}.`,
    tokenSpan === undefined
      ? { canonicalPath: file.canonicalPath, sourceSha256: file.sha256 }
      : { canonicalPath: file.canonicalPath, sourceSha256: file.sha256, byteOffset: tokenSpan.startByte, line: tokenSpan.line, column: tokenSpan.column },
    { budget, observed, limit },
  ));
}
