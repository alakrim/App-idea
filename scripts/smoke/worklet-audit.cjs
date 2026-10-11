#!/usr/bin/env node
/* global __dirname */
/**
 * Worklet safety check (`npm run worklet:check`).
 *
 * Code inside useAnimatedStyle, useDerivedValue, gesture callbacks and other worklets runs on the UI
 * thread. Calling a plain JS function from there crashes the app on a device ("Tried to synchronously
 * call a Remote Function"), while Jest, which stubs Reanimated, never notices. That crashed the
 * player's scrubber on a Samsung S24 (2026-10-11).
 *
 * The script compiles every source file with the project's Babel config (which includes the
 * worklets plugin), reads each worklet's captured closure, and fails when a captured name is a
 * function that is not itself a worklet. It resolves functions imported from our own modules.
 * Reanimated/Worklets exports are safe. Gesture callbacks that opt into the JS thread with
 * `.runOnJS(true)` are compiled as worklets too, so those few are allowed explicitly below.
 */
const babel = require('@babel/core');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SAFE_MODULES = new Set(['react-native-reanimated', 'react-native-worklets']);
/** file → names called only from `.runOnJS(true)` gesture callbacks (they run on the JS thread). */
const JS_THREAD_ALLOWED = {
  'src/features/player/mini-player.tsx': ['open'],
};

function listSources(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return ['__tests__', '__fixtures__', 'node_modules'].includes(entry.name)
        ? []
        : listSources(full);
    }
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

function isWorkletFunction(source, name) {
  const decl = new RegExp(
    `(function\\s+${name}\\s*\\([^)]*\\)[^{]*\\{\\s*['"]worklet['"])|(const\\s+${name}\\s*=\\s*(?:\\([^)]*\\)|[A-Za-z_$][\\w$]*)\\s*(?::[^=]+)?=>\\s*\\{\\s*['"]worklet['"])`,
  );
  return decl.test(source);
}

function isFunctionIn(source, name) {
  return new RegExp(
    `(function\\s+${name}\\b)|(const\\s+${name}\\s*=\\s*(?:async\\s*)?(?:\\([^)]*\\)|[A-Za-z_$][\\w$]*)\\s*(?::[^=]+)?=>)`,
  ).test(source);
}

function importOf(source, name) {
  for (const match of source.matchAll(/import\s+(?:type\s+)?([^;]+?)\s+from\s+['"]([^'"]+)['"]/g)) {
    const [, clause, from] = match;
    if (new RegExp(`\\b${name}\\b`).test(clause)) return from;
  }
  return null;
}

function resolveLocal(fromFile, spec) {
  const base = spec.startsWith('@/')
    ? path.join(ROOT, 'src', spec.slice(2))
    : path.resolve(path.dirname(fromFile), spec);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const problems = [];
const files = [...listSources(path.join(ROOT, 'src')), ...listSources(path.join(ROOT, 'app'))];
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  if (!/worklet|useAnimated|useDerivedValue|Gesture\./.test(source)) continue;
  const code = babel.transformSync(source, {
    filename: file,
    cwd: ROOT,
    caller: { name: 'metro', platform: 'android', bundler: 'metro' },
  }).code;
  const captured = new Set(
    [...code.matchAll(/__closure\s*[=:]\s*\{([^}]*)\}/g)].flatMap((m) =>
      m[1]
        .split(',')
        .map((part) => part.trim().split(':')[0].trim())
        .filter(Boolean),
    ),
  );
  const rel = path.relative(ROOT, file);
  for (const name of captured) {
    if ((JS_THREAD_ALLOWED[rel] ?? []).includes(name)) continue;
    const from = importOf(source, name);
    if (from) {
      if (SAFE_MODULES.has(from)) continue;
      const target =
        from.startsWith('.') || from.startsWith('@/') ? resolveLocal(file, from) : null;
      if (!target) continue; // a third-party value (not ours to check)
      const targetSource = fs.readFileSync(target, 'utf8');
      if (isFunctionIn(targetSource, name) && !isWorkletFunction(targetSource, name)) {
        problems.push(
          `${rel}: worklet calls '${name}' from ${path.relative(ROOT, target)}, which is not a worklet`,
        );
      }
    } else if (isFunctionIn(source, name) && !isWorkletFunction(source, name)) {
      problems.push(`${rel}: worklet calls local function '${name}', which is not a worklet`);
    }
  }
}

if (problems.length > 0) {
  console.error(`Worklet check failed (${problems.length}):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log('Worklet check OK: every function captured by a worklet is itself a worklet.');
