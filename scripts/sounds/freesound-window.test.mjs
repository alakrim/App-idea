import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { frameLevelsDb } from './freesound-window.mjs';

describe('frameLevelsDb', () => {
  it('reports the RMS level of each complete frame in dBFS', () => {
    const samples = new Float32Array(20).fill(0.5);
    const levels = frameLevelsDb(samples, 10);
    assert.equal(levels.length, 2);
    assert.ok(Math.abs(levels[0] - 20 * Math.log10(0.5)) < 1e-9);
  });

  it('drops an incomplete trailing frame and floors silence', () => {
    const levels = frameLevelsDb(new Float32Array(25), 10);
    assert.equal(levels.length, 2);
    assert.ok(levels[0] <= -180);
  });
});
