// Candidate screen tests (brief SND1). Run with `npm run sounds:test`.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MIN_SOURCE_SECONDS, scoreCandidate, screenCandidate } from './curation-score.mjs';

const TARGET = { id: 'ocean_waves', keywords: ['waves', 'surf', 'sea'] };
const PDM = 'http://creativecommons.org/publicdomain/mark/1.0/';
const candidate = (overrides) => ({
  source: 'archive.org',
  title: 'Brighton Beach - Strong sea waves',
  author: 'RorySmith',
  pageUrl: 'https://archive.org/details/x',
  licenseName: null,
  licenseUrl: PDM,
  ...overrides,
});

describe('screenCandidate', () => {
  it('accepts a clean, licensed recording whose title names a target keyword', () => {
    const screen = screenCandidate(candidate({}), TARGET);
    assert.equal(screen.allowed, true);
    assert.deepEqual(screen.hits, ['waves', 'sea']);
  });

  it('rejects speech, music and broadcasts', () => {
    for (const title of ['Sea waves with voices', 'Waves radio show', 'Waves - remix', 'Surf interview']) {
      assert.equal(screenCandidate(candidate({ title }), TARGET).allowed, false, title);
    }
  });

  it('rejects a title with no target keyword', () => {
    const screen = screenCandidate(candidate({ title: 'Harbour at noon' }), TARGET);
    assert.equal(screen.allowed, false);
    assert.match(screen.reason, /no target keyword/);
  });

  it('rejects a candidate whose licence is not allowed', () => {
    const screen = screenCandidate(
      candidate({ licenseUrl: 'https://creativecommons.org/licenses/by-nc/4.0/' }),
      TARGET,
    );
    assert.equal(screen.allowed, false);
  });
});

describe('scoreCandidate', () => {
  it('rejects a recording too short to hold the loop and crossfade', () => {
    const score = scoreCandidate(candidate({}), TARGET, MIN_SOURCE_SECONDS - 1);
    assert.equal(score.allowed, false);
    assert.match(score.reason, /shorter than/);
  });

  it('scores a longer recording with a keyword and an ambience word above one without', () => {
    const plain = scoreCandidate(candidate({ title: 'Sea waves' }), TARGET, 240);
    const described = scoreCandidate(
      candidate({ title: 'Sea waves', description: 'A field recording of the shore' }),
      TARGET,
      240,
    );
    assert.equal(plain.allowed, true);
    assert.ok(described.score > plain.score);
  });
});
