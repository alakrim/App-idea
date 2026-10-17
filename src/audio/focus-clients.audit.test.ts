/*
 * QA-E guard for incident 3 (choppy narration, docs/STATE.md). It passes on the unified code and
 * keeps the app at one audio-focus client, expo-audio. A new call that asks for focus, or a second
 * AudioContext, fails here. Excluded from `npm test` by testPathIgnorePatterns in jest.config.js.
 * Run it with: npx jest --testPathIgnorePatterns=/node_modules/ focus-clients.audit
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const REPO_ROOT = join(__dirname, '..', '..');
const SCANNED_DIRS = ['src', 'app', 'modules'];
const FOCUS_CALLS = /observeAudioInterruptions\(|requestAudioFocus\(|setAudioSessionActivity\(true/;
const SECOND_CONTEXT = /new AudioContext\(/;
const SOURCE_FILE = /\.(ts|tsx|kt|java)$/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === 'node_modules' || name === 'build') return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!SOURCE_FILE.test(name) || /\.(audit\.)?test\./.test(name)) return [];
    return [path];
  });
}

/** `file: line` for every source line that matches, relative to the repo root. */
function linesMatching(pattern: RegExp): string[] {
  return SCANNED_DIRS.flatMap((dir) => sourceFiles(join(REPO_ROOT, dir))).flatMap((file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => pattern.test(line))
      .map((line) => `${relative(REPO_ROOT, file)}: ${line.trim()}`),
  );
}

describe('incident 3 guard: one audio-focus client', () => {
  it('nothing in the app asks react-native-audio-api for audio focus', () => {
    expect(linesMatching(FOCUS_CALLS)).toEqual([]);
  });

  it('the ambience beds are the only AudioContext, created in the native engine', () => {
    const files = linesMatching(SECOND_CONTEXT).map((line) => line.split(':')[0]);
    expect(files).toEqual(['src/audio/native-engine.ts']);
  });
});
