#!/usr/bin/env node
// Headless boot of the release Android JS bundle, the way the device starts it.
//
// The bundle is evaluated in a Node vm context that carries only what Hermes and React Native
// provide (no Node globals). Then AppRegistry.runApplication runs the way the native host calls it,
// and virtual time is drained. The first fatal error is printed with its original source location,
// and the run exits 1 when a fatal error occurs or no screen renders.
//
//   node scripts/smoke/boot-bundle.mjs [--dir <expo export dir>] [--window-ms 4000]
//
// Without --dir it runs `npx expo export --platform android --no-bytecode --source-maps` into a
// temporary directory first. Exit status is 1 on a fatal error, or when fewer than --require-views
// host views are created (default 0: a boot that renders nothing and reports nothing still fails,
// because the native host would see no screen). Set BOOT_RAW_STACK=1 to print the unmapped V8 stack of each error,
// BOOT_VERBOSE=1 for the mapped stacks of soft errors, BOOT_LOGS=1 for every console line, and
// BOOT_CALLS=1 to list native calls.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SourceMap } from 'node:module';
import vm from 'node:vm';
import { parseArgs } from 'node:util';

import { createHostTimers } from './host-timers.mjs';
import { createRecorder, installNativeStubs } from './native-stubs.mjs';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** @param {string} dir */
function exportBundle(dir) {
  execFileSync(
    'npx',
    [
      'expo',
      'export',
      '--platform',
      'android',
      '--no-bytecode',
      '--source-maps',
      '--output-dir',
      dir,
    ],
    { cwd: REPO_ROOT, stdio: ['ignore', 'ignore', 'inherit'] },
  );
}

/**
 * The embedded app config, which the device reads from assets/app.config.
 *
 * @returns {string}
 */
function readAppConfigJson() {
  return execFileSync('npx', ['expo', 'config', '--type', 'public', '--json'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

/**
 * @param {string} dir
 * @returns {{ bundlePath: string, mapPath: string }}
 */
function findBundle(dir) {
  const androidDir = join(dir, '_expo', 'static', 'js', 'android');
  const bundle = readdirSync(androidDir).find((f) => f.endsWith('.js'));
  if (bundle === undefined) {
    throw new Error(`no Android bundle in ${androidDir}`);
  }
  return { bundlePath: join(androidDir, bundle), mapPath: join(androidDir, `${bundle}.map`) };
}

/**
 * Maps one bundle position (1-based, as stack traces print it) to its original source position.
 *
 * @param {number} line
 * @param {number} column
 * @param {SourceMap} map
 */
function originalPosition(line, column, map) {
  const entry = map.findEntry(line - 1, column - 1);
  if (!entry.originalSource) {
    return `<bundle>:${line}:${column} (unmapped)`;
  }
  return `${entry.originalSource}:${Number(entry.originalLine) + 1}:${Number(entry.originalColumn) + 1}`;
}

/**
 * Formats a fatal error's stack with every bundle frame mapped to its original source. React Native
 * passes parsed frames ({ methodName, file, lineNumber, column }); Error objects pass a string.
 *
 * @param {unknown} stack
 * @param {string} bundlePath
 * @param {SourceMap} map
 * @returns {string}
 */
function mapStack(stack, bundlePath, map) {
  if (Array.isArray(stack)) {
    return stack
      .map((frame) => {
        const f =
          /** @type {{ methodName?: string, file?: string, lineNumber?: number, column?: number }} */ (
            frame
          );
        const where =
          f.file === bundlePath && f.lineNumber !== undefined && f.column !== undefined
            ? originalPosition(f.lineNumber, f.column, map)
            : `${f.file ?? '<native>'}:${f.lineNumber ?? '?'}:${f.column ?? '?'}`;
        return `    at ${f.methodName ?? '<anonymous>'} (${where})`;
      })
      .join('\n');
  }
  const escaped = bundlePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const frame = new RegExp(`${escaped}:(\\d+):(\\d+)`, 'g');
  return String(stack).replace(frame, (_match, line, col) =>
    originalPosition(Number(line), Number(col), map),
  );
}

/**
 * The globals a Hermes release runtime offers before React Native starts. Node-only globals (Buffer,
 * require, process, fetch, crypto) are absent. Hermes has no Web Crypto, so `crypto` is absent here
 * too, as it is on the device.
 *
 * @param {{
 *   timers: ReturnType<typeof createHostTimers>,
 *   recorder: ReturnType<typeof createRecorder>,
 *   reportError: (error: unknown) => void,
 * }} env
 */
function createHermesGlobals({ timers, recorder, reportError }) {
  // A callback that throws inside a microtask or timer reaches the native error handler on device.
  const guard = (/** @type {() => void} */ fn) => () => {
    try {
      fn();
    } catch (error) {
      reportError(error);
    }
  };
  const log = (/** @type {unknown[]} */ args) => args.map(String).join(' ');
  const sandbox = {
    console: {
      log: (/** @type {unknown[]} */ ...args) => recorder.logs.push(log(args)),
      info: (/** @type {unknown[]} */ ...args) => recorder.logs.push(log(args)),
      warn: (/** @type {unknown[]} */ ...args) => recorder.logs.push(`warn: ${log(args)}`),
      error: (/** @type {unknown[]} */ ...args) => recorder.logs.push(`error: ${log(args)}`),
      debug: () => undefined,
      trace: () => undefined,
    },
    nativeLoggingHook: (/** @type {string} */ message) => recorder.logs.push(message),
    nativePerformanceNow: () => timers.now(),
    performance: { now: () => timers.now() },
    HermesInternal: {
      hasPromise: () => true,
      enablePromiseRejectionTracker: () => undefined,
      getRuntimeProperties: () => ({
        'OSS Release Version': 'release',
        'Hermes JS engine': 'boot-harness',
      }),
    },
    // Hermes ships atob, btoa and TextEncoder natively (verified against libhermesvm.so in the APK).
    // TextDecoder and structuredClone are not in Hermes; expo's winter runtime installs them.
    atob: globalThis.atob,
    btoa: globalThis.btoa,
    TextEncoder: globalThis.TextEncoder,
    queueMicrotask: (/** @type {() => void} */ fn) => queueMicrotask(guard(fn)),
    setTimeout: timers.setTimeout,
    setInterval: timers.setInterval,
    clearTimeout: timers.clearTimeout,
    clearInterval: timers.clearTimeout,
    requestAnimationFrame: timers.requestAnimationFrame,
    __DEV__: false,
  };
  Object.assign(sandbox, { global: sandbox, globalThis: sandbox });
  return sandbox;
}

async function main() {
  const { values } = parseArgs({
    options: {
      dir: { type: 'string' },
      'window-ms': { type: 'string', default: '4000' },
      'require-views': { type: 'string', default: '0' },
    },
  });
  const requiredViews = Number(values['require-views']);
  const dir = values.dir ? resolve(values.dir) : mkdtempSync(join(tmpdir(), 'lectio-boot-'));
  if (values.dir === undefined) {
    exportBundle(dir);
  }
  const { bundlePath, mapPath } = findBundle(dir);
  const source = readFileSync(bundlePath, 'utf8');
  const map = new SourceMap(JSON.parse(readFileSync(mapPath, 'utf8')));

  const timers = createHostTimers();
  const recorder = createRecorder();
  const phases = [];

  // Errors thrown inside the vm context come from another realm, so `instanceof Error` is false.
  const reportError = (/** @type {unknown} */ error) => {
    if (process.env.BOOT_RAW_STACK === '1') {
      console.log(`raw stack:\n${String((error ?? {}).stack ?? error)}`);
    }
    const e = /** @type {{ message?: unknown, stack?: unknown }} */ (error ?? {});
    const message = typeof e.message === 'string' ? e.message : String(error);
    recorder.fatals.push({
      message,
      stack: mapStack(e.stack ?? message, bundlePath, map),
      source: 'fatal',
    });
  };

  // Anything that escapes the vm entirely is still a fatal error on device, not a silent exit.
  process.on('uncaughtException', reportError);
  process.on('unhandledRejection', (reason) => {
    const r = /** @type {{ message?: unknown, stack?: unknown }} */ (reason ?? {});
    recorder.softs.push({
      message: `unhandled promise rejection: ${String(r.message ?? reason)}`,
      stack: mapStack(r.stack ?? '', bundlePath, map),
      source: 'soft',
    });
  });

  const sandbox = createHermesGlobals({ timers, recorder, reportError });
  const appConfigJson = readAppConfigJson();
  installNativeStubs({ sandbox, recorder, appConfigJson, reportError });
  const context = vm.createContext(sandbox);

  try {
    new vm.Script(source, { filename: bundlePath }).runInContext(context);
    phases.push('bundle evaluated');
  } catch (error) {
    reportError(error);
    phases.push('bundle evaluation threw');
  }

  if (recorder.fatals.length === 0) {
    try {
      const registry =
        /** @type {{ runApplication: (key: string, p: object) => void, getAppKeys: () => string[] }} */ (
          sandbox.RN$AppRegistry
        );
      phases.push(`app keys: ${registry.getAppKeys().join(',')}`);
      registry.runApplication('main', { rootTag: 1, initialProps: {}, fabric: true });
      phases.push('runApplication returned');
    } catch (error) {
      reportError(error);
      phases.push('runApplication threw');
    }
  }

  await timers.drain(Number(values['window-ms']), reportError);
  phases.push(`drained ${timers.now()} ms of virtual time, ${timers.pending()} timers pending`);

  const views = [...recorder.views.entries()].map(([name, n]) => `${name}x${n}`).join(' ');
  console.log(`phases: ${phases.join(' | ')}`);
  console.log(`views: ${views || '(none)'}`);
  console.log(`native calls: ${recorder.moduleCalls.length}`);
  if (process.env.BOOT_CALLS === '1') {
    console.log(recorder.moduleCalls.join('\n'));
  }
  for (const soft of recorder.softs) {
    console.log(`soft: ${soft.message.split('\n')[0]}`);
    if (process.env.BOOT_VERBOSE === '1' && soft.stack) {
      console.log(mapStack(soft.stack, bundlePath, map));
    }
  }
  const shownLogs =
    process.env.BOOT_LOGS === '1'
      ? recorder.logs
      : recorder.logs.filter((l) => l.startsWith('error:'));
  for (const line of shownLogs) {
    console.log(line.split('\n')[0]);
  }
  const hostViews = [...recorder.views.values()].reduce((a, b) => a + b, 0);
  const first = recorder.fatals[0];
  if (first) {
    console.log(`FATAL: ${first.message}`);
    console.log(mapStack(first.stack, bundlePath, map));
    process.exitCode = 1;
  } else if (hostViews < requiredViews) {
    console.log(
      `FAIL: ${hostViews} host views created, ${requiredViews} required, and no error was reported`,
    );
    process.exitCode = 1;
  } else {
    console.log(`OK: no uncaught error; ${hostViews} host views created`);
  }
}

main().catch((error) => {
  console.error(`boot harness failed before the app could start: ${String(error)}`);
  process.exitCode = 1;
});
