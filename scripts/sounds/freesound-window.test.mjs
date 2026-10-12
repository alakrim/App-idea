import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  frameLevelsDb,
  MAX_EDGE_TRIM_SECONDS,
  steadiestWindow,
  usableFrameRange,
} from './freesound-window.mjs';

/** Builds frame levels (dBFS) from a function of the frame index. */
const levelsOf = (count, levelAt) => Float64Array.from({ length: count }, (_, i) => levelAt(i));

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

describe('usableFrameRange', () => {
  it('keeps the whole clip when every frame is near the median', () => {
    assert.deepEqual(usableFrameRange(levelsOf(50, () => -30)), { start: 0, end: 50 });
  });

  it('trims silent leading and trailing frames', () => {
    const levels = levelsOf(60, (i) => (i < 5 || i >= 55 ? -90 : -30));
    assert.deepEqual(usableFrameRange(levels), { start: 5, end: 55 });
  });

  it('trims loud clicks at the edges, but not loud frames inside the body', () => {
    const levels = levelsOf(60, (i) => {
      if (i === 0 || i === 59) return -10;
      if (i === 30) return -10;
      return -30;
    });
    assert.deepEqual(usableFrameRange(levels), { start: 1, end: 59 });
  });

  it('never trims more than the maximum from one end', () => {
    // 150 quiet frames then 150 body frames: the median is the body level, and 150 quiet frames
    // are more than the 10 s cap, so trimming stops at the cap.
    const maxTrim = MAX_EDGE_TRIM_SECONDS * 10;
    const levels = levelsOf(300, (i) => (i < 150 ? -90 : -30));
    assert.deepEqual(usableFrameRange(levels), { start: maxTrim, end: 300 });
  });

  it('returns an empty range for an empty clip', () => {
    assert.deepEqual(usableFrameRange(new Float64Array(0)), { start: 0, end: 0 });
  });
});

describe('steadiestWindow', () => {
  it('picks the window whose level varies least', () => {
    // Frames 0 to 39 swing between -20 and -40 dB; frames 40 to 99 hold -30 dB.
    const levels = levelsOf(100, (i) => (i < 40 ? (i % 2 === 0 ? -20 : -40) : -30));
    const best = steadiestWindow(levels, { start: 0, end: 100 }, 20);
    assert.equal(best.startFrame >= 40, true);
    assert.ok(best.stdDb < 1e-9);
  });

  it('breaks ties toward the earlier window', () => {
    const best = steadiestWindow(
      levelsOf(50, () => -25),
      { start: 0, end: 50 },
      10,
    );
    assert.equal(best.startFrame, 0);
    assert.equal(best.stdDb, 0);
  });

  it('searches only inside the usable range', () => {
    const levels = levelsOf(100, () => -25);
    const best = steadiestWindow(levels, { start: 30, end: 60 }, 10);
    assert.ok(best.startFrame >= 30 && best.startFrame + 10 <= 60);
  });

  it('returns null when the usable range is shorter than the window', () => {
    assert.equal(
      steadiestWindow(
        levelsOf(100, () => -25),
        { start: 0, end: 9 },
        10,
      ),
      null,
    );
  });

  it('reports the standard deviation of a known pattern', () => {
    // Two levels, -20 and -30, alternate: population stdDev is 5 dB.
    const levels = levelsOf(40, (i) => (i % 2 === 0 ? -20 : -30));
    const best = steadiestWindow(levels, { start: 0, end: 40 }, 4);
    assert.ok(Math.abs(best.stdDb - 5) < 1e-9);
  });
});
