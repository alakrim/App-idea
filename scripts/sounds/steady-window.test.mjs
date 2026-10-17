// Steady window tests (brief SND1). Run with `npm run sounds:test`.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { blockLevelsDb, steadiestWindowStart } from './steady-window.mjs';

const RATE = 100;
/** A block of constant amplitude `level` (linear), `blockSamples` long. */
const block = (level, blockSamples) => new Float32Array(blockSamples).fill(level);

describe('steadiestWindowStart', () => {
  it('measures each complete block in dB', () => {
    const samples = Float32Array.from([...block(1, RATE), ...block(0.1, RATE)]);
    const levels = blockLevelsDb(samples, RATE);
    assert.equal(levels.length, 2);
    assert.ok(Math.abs(levels[0]) < 1e-6, 'a full-scale block is 0 dB');
    assert.ok(Math.abs(levels[1] + 20) < 1e-6, 'a tenth-amplitude block is -20 dB');
  });

  it('chooses the window with the least level change, not the loudest', () => {
    // Blocks: loud, quiet, quiet, quiet, loud, then a swinging run. The three quiet blocks are steadiest.
    const samples = Float32Array.from([
      ...block(1, RATE),
      ...block(0.1, RATE),
      ...block(0.1, RATE),
      ...block(0.1, RATE),
      ...block(0.5, RATE),
      ...block(1, RATE),
      ...block(0.05, RATE),
      ...block(0.8, RATE),
    ]);
    assert.equal(steadiestWindowStart(samples, 3 * RATE, RATE), RATE);
  });

  it('starts on a block boundary', () => {
    const samples = Float32Array.from([...block(0.3, RATE), ...block(0.31, RATE), ...block(0.3, RATE), ...block(0.3, RATE)]);
    assert.equal(steadiestWindowStart(samples, 2 * RATE, RATE) % RATE, 0);
  });

  it('refuses a source shorter than the window', () => {
    assert.throws(() => steadiestWindowStart(block(0.2, RATE), 2 * RATE, RATE), /shorter than/);
  });
});
