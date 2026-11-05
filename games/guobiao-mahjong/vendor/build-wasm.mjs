import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const vendor = dirname(fileURLToPath(import.meta.url));
const sdk = process.argv[2] ?? process.env.WASI_SDK_PATH;
if (!sdk) throw new Error('Pass the WASI SDK 25 directory, or set WASI_SDK_PATH. The checked-in WASM needs no SDK at runtime.');
const result = spawnSync(resolve(sdk, 'bin/clang++'), [
  resolve(vendor, 'bridge.cpp'), resolve(vendor, 'mahjong-algorithm/fan_calculator.cpp'), resolve(vendor, 'mahjong-algorithm/shanten.cpp'),
  '-std=c++11', '-O3', '-DNDEBUG', '-fno-exceptions', '-fno-rtti', '-nostartfiles',
  '-Wl,--no-entry', '-Wl,--export-memory', '-Wl,--strip-all', '-Wl,-z,stack-size=2097152', '-Wl,--initial-memory=4194304',
  '-o', resolve(vendor, '../assets/mcr.wasm'),
], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
