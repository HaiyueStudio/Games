import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SUCCESS_STATE = 888888;
const FAILURE_STATES = Object.freeze(Array.from({ length: 13 }, (_value, index) => 999901 + index));
const OUTPUT_FILES = ['mugen.log', 'stdout.txt', 'stderr.txt'];

function parseArguments(argv) {
  const result = { mugenRoot: undefined, output: undefined, timeoutMs: 30_000, oracleDirectory: undefined, oracleName: 'haiyue_g04_oracle', oracleId: 'g04-combat-hit-throw-custom-state', oracleSpriteSource: undefined, matchKey: undefined, matchKeyDelayMs: 250 };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (argument === '--mugen-root' && value) {
      result.mugenRoot = resolve(value);
      index += 1;
    } else if (argument === '--output' && value) {
      result.output = resolve(value);
      index += 1;
    } else if (argument === '--timeout-ms' && value) {
      result.timeoutMs = Number(value);
      index += 1;
    } else if (argument === '--oracle-directory' && value) {
      result.oracleDirectory = resolve(value);
      index += 1;
    } else if (argument === '--oracle-name' && value) {
      result.oracleName = value;
      index += 1;
    } else if (argument === '--oracle-id' && value) {
      result.oracleId = value;
      index += 1;
    } else if (argument === '--oracle-sprite-source' && value) {
      result.oracleSpriteSource = resolve(value);
      index += 1;
    } else if (argument === '--match-key' && value) {
      result.matchKey = value;
      index += 1;
    } else if (argument === '--match-key-delay-ms' && value) {
      result.matchKeyDelayMs = Number(value);
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${argument}`);
    }
  }
  if (!result.mugenRoot) {
    throw new Error('Usage: node run-official-oracle.mjs --mugen-root <MUGEN 1.1 root> [--output <json>] [--timeout-ms <ms>]');
  }
  if (!Number.isInteger(result.timeoutMs) || result.timeoutMs < 1_000) {
    throw new Error('--timeout-ms must be an integer of at least 1000');
  }
  if (!/^[a-z][a-z0-9_]{0,63}$/u.test(result.oracleName) || !/^[a-z0-9][a-z0-9-]{0,127}$/u.test(result.oracleId)) throw new Error('Oracle name or id is invalid');
  if (result.matchKey !== undefined && ![',', '.', '^1'].includes(result.matchKey)) throw new Error('--match-key must be one of comma, period or ^1');
  if (!Number.isInteger(result.matchKeyDelayMs) || result.matchKeyDelayMs < 0 || result.matchKeyDelayMs > 10_000) throw new Error('--match-key-delay-ms must be an integer from 0 to 10000');
  return result;
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function copyDirectory(source, target) {
  await mkdir(target, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const sourcePath = join(source, entry.name);
    const targetPath = join(target, entry.name);
    if (entry.isDirectory()) await copyDirectory(sourcePath, targetPath);
    else if (entry.isFile() && !/\.(?:mjs|json|bmp)$/i.test(entry.name)) await copyFile(sourcePath, targetPath);
  }
}

export function createFastMotif(source) {
  const sectionMatch = source.match(/\[VS Screen\][\s\S]*?(?=\r?\n\s*\[|$)/i);
  if (!sectionMatch) throw new Error('Official motif has no [VS Screen] section');
  let section = sectionMatch[0];
  for (const field of ['time', 'fadein.time', 'fadeout.time']) {
    const pattern = new RegExp(`^(\\s*${field.replace('.', '\\.') }\\s*=).*$`, 'mi');
    if (!pattern.test(section)) throw new Error(`Official motif [VS Screen] has no ${field}`);
    section = section.replace(pattern, '$1 1');
  }
  return source.replace(sectionMatch[0], section);
}

function selectMotif(configuration, motifPath) {
  const pattern = /^(\s*motif\s*=).*$/mi;
  if (!pattern.test(configuration)) throw new Error('Official configuration has no active motif setting');
  return configuration.replace(pattern, `$1 ${motifPath}`);
}

function selectOracleRenderer(configuration) {
  const pattern = /^(\s*RenderMode\s*=).*$/mi;
  if (!pattern.test(configuration)) throw new Error('Official configuration has no active RenderMode setting');
  return configuration.replace(pattern, '$1 System');
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function readBmpPixel(content, xRatio, yRatio) {
  if (content.length < 54 || content.toString('ascii', 0, 2) !== 'BM') throw new Error('Screenshot is not a BMP file');
  const pixelOffset = content.readUInt32LE(10);
  const width = content.readInt32LE(18);
  const rawHeight = content.readInt32LE(22);
  const bitsPerPixel = content.readUInt16LE(28);
  const compression = content.readUInt32LE(30);
  if (width < 1 || rawHeight === 0 || ![24, 32].includes(bitsPerPixel) || compression !== 0) {
    throw new Error('Screenshot BMP format is unsupported');
  }
  const height = Math.abs(rawHeight);
  const stride = Math.floor((bitsPerPixel * width + 31) / 32) * 4;
  const x = Math.min(width - 1, Math.max(0, Math.floor(width * xRatio)));
  const y = Math.min(height - 1, Math.max(0, Math.floor(height * yRatio)));
  const row = rawHeight > 0 ? height - 1 - y : y;
  const index = pixelOffset + row * stride + x * (bitsPerPixel / 8);
  if (index + 2 >= content.length) throw new Error('Screenshot BMP pixel data is truncated');
  return Object.freeze({ r: content[index + 2], g: content[index + 1], b: content[index] });
}

export function classifyOracleScreenshot(content) {
  const samples = [
    [0.5, 0.5],
    [0.35, 0.35],
    [0.65, 0.35],
    [0.35, 0.65],
    [0.65, 0.65],
  ].map(([x, y]) => readBmpPixel(content, x, y));
  const colors = new Map();
  for (const sample of samples) {
    const key = `${sample.r},${sample.g},${sample.b}`;
    colors.set(key, (colors.get(key) ?? 0) + 1);
  }
  const [dominantKey, count] = [...colors].sort((left, right) => right[1] - left[1])[0];
  const [r, g, b] = dominantKey.split(',').map(Number);
  const observedColor = Object.freeze({ r, g, b });
  if (count >= 3 && r <= 1 && g >= 254 && b <= 1) {
    return Object.freeze({ result: 'pass', observedColor, samples: Object.freeze(samples), failureCode: undefined });
  }
  const roundedGreen = Math.round(g / 20) * 20;
  const failureCode = r >= 254 && b <= 1
    ? (Math.abs(g - 250) <= 1 ? 13
      : roundedGreen >= 20 && roundedGreen <= 240 && Math.abs(g - roundedGreen) <= 1
        ? roundedGreen / 20
        : undefined)
    : undefined;
  if (count >= 3 && failureCode !== undefined) {
    return Object.freeze({ result: 'fail', observedColor, samples: Object.freeze(samples), failureCode });
  }
  return Object.freeze({ result: 'unrecognized-screenshot', observedColor, samples: Object.freeze(samples), failureCode: undefined });
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function sendKeyToProcess(processId, key) {
  if (!['{ENTER}', '{F12}', ',', '.', '^1'].includes(key)) throw new Error(`Unsupported automation key: ${key}`);
  const command = [
    '$shell = New-Object -ComObject WScript.Shell',
    `if ($shell.AppActivate(${processId})) {`,
    '  Start-Sleep -Milliseconds 100',
    `  $shell.SendKeys('${key}')`,
    '  exit 0',
    '}',
    'exit 1',
  ].join('; ');
  return new Promise((resolveActivation) => {
    const sender = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
      stdio: 'ignore',
      windowsHide: true,
    });
    sender.once('error', () => resolveActivation(false));
    sender.once('exit', (code) => resolveActivation(code === 0));
  });
}

function convertImageToBmp(sourcePath, outputPath) {
  const source = sourcePath.replaceAll("'", "''");
  const output = outputPath.replaceAll("'", "''");
  const command = [
    'Add-Type -AssemblyName System.Drawing',
    `$image = [System.Drawing.Image]::FromFile('${source}')`,
    `$image.Save('${output}', [System.Drawing.Imaging.ImageFormat]::Bmp)`,
    '$image.Dispose()',
  ].join('; ');
  return new Promise((resolveConversion) => {
    const conversion = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { stdio: 'ignore', windowsHide: true });
    conversion.once('error', () => resolveConversion(false));
    conversion.once('exit', (code) => resolveConversion(code === 0));
  });
}

function captureProcessWindow(processId, outputPath) {
  const escapedOutputPath = outputPath.replaceAll("'", "''");
  const typeDefinition = [
    'using System;',
    'using System.Runtime.InteropServices;',
    'public static class HaiyueCaptureNative {',
    '  [StructLayout(LayoutKind.Sequential)]',
    '  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }',
    '  [DllImport("user32.dll")]',
    '  public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);',
    '  [DllImport("user32.dll")]',
    '  public static extern bool ShowWindow(IntPtr hWnd, int command);',
    '  [DllImport("user32.dll")]',
    '  public static extern bool SetForegroundWindow(IntPtr hWnd);',
    '  [DllImport("user32.dll")]',
    '  public static extern bool SetWindowPos(IntPtr hWnd, IntPtr insertAfter, int x, int y, int width, int height, uint flags);',
    '  [DllImport("user32.dll")]',
    '  public static extern bool PrintWindow(IntPtr hWnd, IntPtr deviceContext, uint flags);',
    '}',
  ].join('\n');
  const command = [
    'Add-Type -AssemblyName System.Drawing',
    `Add-Type -TypeDefinition @'\n${typeDefinition}\n'@`,
    '$shell = New-Object -ComObject WScript.Shell',
    `if (-not $shell.AppActivate(${processId})) { exit 5 }`,
    'Start-Sleep -Milliseconds 300',
    `$process = Get-Process -Id ${processId}`,
    '$handle = $process.MainWindowHandle',
    'if ($handle -eq [IntPtr]::Zero) { exit 2 }',
    '[void][HaiyueCaptureNative]::ShowWindow($handle, 9)',
    '[void][HaiyueCaptureNative]::SetWindowPos($handle, [IntPtr](-1), 0, 0, 0, 0, 0x0043)',
    '[void][HaiyueCaptureNative]::SetWindowPos($handle, [IntPtr](-2), 0, 0, 0, 0, 0x0043)',
    '[void][HaiyueCaptureNative]::SetForegroundWindow($handle)',
    'Start-Sleep -Milliseconds 300',
    '$rect = New-Object HaiyueCaptureNative+RECT',
    'if (-not [HaiyueCaptureNative]::GetWindowRect($handle, [ref]$rect)) { exit 3 }',
    '$width = $rect.Right - $rect.Left',
    '$height = $rect.Bottom - $rect.Top',
    'if ($width -lt 1 -or $height -lt 1) { exit 4 }',
    '$bitmap = New-Object System.Drawing.Bitmap($width, $height)',
    '$graphics = [System.Drawing.Graphics]::FromImage($bitmap)',
    '$deviceContext = $graphics.GetHdc()',
    '$printed = [HaiyueCaptureNative]::PrintWindow($handle, $deviceContext, 2)',
    '$graphics.ReleaseHdc($deviceContext)',
    // PrintWindow may report success while returning a white frame for the
    // hardware-accelerated MUGEN surface. The visible foreground pixels are
    // the authoritative oracle observation.
    '$graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bitmap.Size)',
    `$bitmap.Save('${escapedOutputPath}', [System.Drawing.Imaging.ImageFormat]::Bmp)`,
    '$graphics.Dispose()',
    '$bitmap.Dispose()',
  ].join('\n');
  return new Promise((resolveCapture) => {
    const capture = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
      stdio: 'ignore',
      windowsHide: true,
    });
    capture.once('error', () => resolveCapture(false));
    capture.once('exit', (code) => resolveCapture(code === 0));
  });
}

async function readLog(logPath) {
  try {
    return await readFile(logPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return '';
    throw error;
  }
}

async function terminate(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill();
  await Promise.race([
    new Promise((resolveExit) => child.once('exit', resolveExit)),
    delay(2_000),
  ]);
}

async function main() {
  const { mugenRoot, output, timeoutMs, oracleDirectory: selectedOracleDirectory, oracleName, oracleId, oracleSpriteSource, matchKey, matchKeyDelayMs } = parseArguments(process.argv.slice(2));
  const oracleDirectory = selectedOracleDirectory ?? dirname(fileURLToPath(import.meta.url));
  const motifName = `${oracleName.replaceAll('_', '-')}-system.def`;
  const executable = join(mugenRoot, 'mugen.exe');
  const officialConfiguration = join(mugenRoot, 'data', 'mugen.cfg');
  const officialMotif = join(mugenRoot, 'data', 'mugen1', 'system.def');
  const temporaryMotif = join(mugenRoot, 'data', 'mugen1', motifName);
  const temporaryCharacter = join(mugenRoot, 'chars', oracleName);
  const logPath = join(mugenRoot, 'mugen.log');

  for (const requiredPath of [executable, officialConfiguration, officialMotif, join(oracleDirectory, 'oracle.def'), ...(oracleSpriteSource === undefined ? [] : [oracleSpriteSource])]) {
    if (!(await pathExists(requiredPath))) throw new Error(`Required path does not exist: ${requiredPath}`);
  }
  if (await pathExists(temporaryCharacter)) {
    throw new Error(`Refusing to overwrite existing character directory: ${temporaryCharacter}`);
  }
  if (await pathExists(temporaryMotif)) {
    throw new Error(`Refusing to overwrite existing motif: ${temporaryMotif}`);
  }

  const preservedOutputs = new Map();
  for (const name of OUTPUT_FILES) {
    const path = join(mugenRoot, name);
    preservedOutputs.set(path, (await pathExists(path)) ? await readFile(path) : undefined);
  }
  const preservedConfiguration = await readFile(officialConfiguration);

  let child;
  let log = '';
  let screenshotContent;
  let screenshotSourceName;
  let continueKeyAttempted = false;
  let continueKeyActivated = false;
  let errorDialogKeyAttempted = false;
  let errorDialogKeyActivated = false;
  let screenshotCaptureAttempted = false;
  let matchKeyAttempted = false;
  let matchKeyActivated = false;
  let screenshotCaptured = false;
  let rendererScreenshotKeyAttempted = false;
  let rendererScreenshotKeyActivated = false;
  let rendererScreenshotName;
  let convertedScreenshotName;
  let screenshotObservation;
  const startedAt = new Date();
  let result = 'blocked-timeout';
  try {
    const screenshotsBefore = new Set((await readdir(mugenRoot)).filter(name => /^mugen\d+\.(?:png|pcx|bmp)$/iu.test(name)));
    await copyDirectory(oracleDirectory, temporaryCharacter);
    if (oracleSpriteSource !== undefined) await copyFile(oracleSpriteSource, join(temporaryCharacter, 'oracle.sff'));
    const motif = createFastMotif(await readFile(officialMotif, 'utf8'));
    await writeFile(temporaryMotif, motif, 'utf8');
    const configuration = selectOracleRenderer(selectMotif(
      preservedConfiguration.toString('utf8'),
      `data/mugen1/${motifName}`,
    ));
    await writeFile(officialConfiguration, configuration, 'utf8');
    for (const path of preservedOutputs.keys()) await rm(path, { force: true });

    child = spawn(executable, [
      `${oracleName}/oracle.def`,
      'kfm/kfm.def',
      '-s',
      'stage0',
    ], {
      cwd: mugenRoot,
      stdio: 'ignore',
      windowsHide: false,
    });

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await delay(100);
      log = await readLog(logPath);
      if (!continueKeyAttempted && log.includes('Gameflow 8')) {
        continueKeyAttempted = true;
        continueKeyActivated = await sendKeyToProcess(child.pid, '{ENTER}');
      }
      if (!errorDialogKeyAttempted && log.includes('failed to load')) {
        errorDialogKeyAttempted = true;
        errorDialogKeyActivated = await sendKeyToProcess(child.pid, '{ENTER}');
      }
      if (!screenshotCaptureAttempted && log.includes('Match loop init')) {
        screenshotCaptureAttempted = true;
        if (matchKey !== undefined) {
          await delay(matchKeyDelayMs);
          matchKeyAttempted = true;
          matchKeyActivated = await sendKeyToProcess(child.pid, matchKey);
        }
        await delay(5_000);
        rendererScreenshotKeyAttempted = true;
        rendererScreenshotKeyActivated = await sendKeyToProcess(child.pid, '{F12}');
        await delay(1_000);
        const createdScreenshots = (await readdir(mugenRoot)).filter(name => /^mugen\d+\.(?:png|pcx|bmp)$/iu.test(name) && !screenshotsBefore.has(name));
        if (createdScreenshots.length > 0) {
          const ranked = await Promise.all(createdScreenshots.map(async name => ({ name, modified: (await stat(join(mugenRoot, name))).mtimeMs })));
          rendererScreenshotName = ranked.sort((left, right) => right.modified - left.modified)[0].name;
          const rendererPath = join(mugenRoot, rendererScreenshotName);
          if (/\.bmp$/iu.test(rendererScreenshotName)) {
            screenshotContent = await readFile(rendererPath);
            screenshotCaptured = true;
          } else {
            convertedScreenshotName = `${oracleName.replaceAll('_', '-')}-${child.pid}-renderer.bmp`;
            const convertedPath = join(mugenRoot, convertedScreenshotName);
            if (await convertImageToBmp(rendererPath, convertedPath)) { screenshotContent = await readFile(convertedPath); screenshotCaptured = true; }
          }
        }
        if (!screenshotCaptured) {
          screenshotSourceName = `${oracleName.replaceAll('_', '-')}-${child.pid}.bmp`;
          const screenshotPath = join(mugenRoot, screenshotSourceName);
          screenshotCaptured = await captureProcessWindow(child.pid, screenshotPath);
          if (screenshotCaptured) screenshotContent = await readFile(screenshotPath);
        }
        if (screenshotCaptured) {
          screenshotObservation = classifyOracleScreenshot(screenshotContent);
          result = screenshotObservation.result;
          break;
        }
      }
      if (child.exitCode !== null || child.signalCode !== null) {
        result = 'runtime-exited-without-sentinel';
        break;
      }
    }
  } finally {
    if (child) await terminate(child);
    log = await readLog(logPath) || log;
    await rm(temporaryCharacter, { recursive: true, force: true });
    await rm(temporaryMotif, { force: true });
    if (screenshotSourceName) await rm(join(mugenRoot, screenshotSourceName), { force: true });
    if (rendererScreenshotName) await rm(join(mugenRoot, rendererScreenshotName), { force: true });
    if (convertedScreenshotName) await rm(join(mugenRoot, convertedScreenshotName), { force: true });
    await writeFile(officialConfiguration, preservedConfiguration);
    for (const [path, content] of preservedOutputs) {
      if (content === undefined) await rm(path, { force: true });
      else await writeFile(path, content);
    }
  }

  const completedAt = new Date();
  const evidence = {
    schemaVersion: 1,
    oracle: oracleId,
    officialRuntime: executable.replaceAll('\\', '/'),
    oracleRenderMode: 'System',
    oracleSpriteSourceSha256: oracleSpriteSource === undefined ? undefined : sha256(await readFile(oracleSpriteSource)),
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    elapsedMs: completedAt.getTime() - startedAt.getTime(),
    result,
    successState: SUCCESS_STATE,
    failureStates: FAILURE_STATES,
    continueKeyAttempted,
    continueKeyActivated,
    errorDialogKeyAttempted,
    errorDialogKeyActivated,
    screenshotCaptureAttempted,
    matchKey,
    matchKeyDelayMs,
    matchKeyAttempted,
    matchKeyActivated,
    screenshotCaptured,
    screenshotSourceName,
    rendererScreenshotKeyAttempted,
    rendererScreenshotKeyActivated,
    rendererScreenshotName,
    screenshotSha256: screenshotContent ? sha256(screenshotContent) : undefined,
    screenshotObservation,
    logSha256: sha256(log),
    logTail: log.split(/\r?\n/).filter(Boolean).slice(-80),
    cleanup: {
      temporaryCharacterRemoved: !(await pathExists(temporaryCharacter)),
      temporaryMotifRemoved: !(await pathExists(temporaryMotif)),
      originalConfigurationRestored: sha256(await readFile(officialConfiguration)) === sha256(preservedConfiguration),
      originalOutputsRestored: true,
    },
  };

  const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
  if (output) {
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, serialized, 'utf8');
    if (screenshotContent) {
      const screenshotOutput = output.replace(/\.json$/i, '') + '.bmp';
      await writeFile(screenshotOutput, screenshotContent);
    }
  }
  process.stdout.write(serialized);
  process.exitCode = result === 'pass' ? 0 : result === 'fail' ? 1 : 2;
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  await main();
}
