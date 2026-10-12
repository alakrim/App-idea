import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { rankCandidates, scoreSound, tokens } from './freesound-score.mjs';
import { CC0_LICENSE_URL } from './pack-spec.mjs';

const RAIN_TARGET = {
  id: 'light_rain',
  tags: ['rain', 'light', 'drizzle'],
  names: ['rain', 'drizzle'],
  allowsVoices: false,
};
const CROWD_TARGET = {
  id: 'tavern_crowd',
  tags: ['tavern', 'pub', 'bar', 'crowd'],
  names: ['tavern', 'pub', 'bar'],
  allowsVoices: true,
};

/** A CC0 sound that scores well unless a test changes a field. */
function sound(overrides = {}) {
  return {
    id: 1,
    name: 'Light rain on leaves',
    tags: ['rain', 'ambience'],
    duration: 120,
    license: CC0_LICENSE_URL,
    avg_rating: 4.5,
    num_ratings: 40,
    num_downloads: 2000,
    username: 'someone',
    url: 'https://freesound.org/people/someone/sounds/1/',
    previews: { 'preview-hq-mp3': 'https://cdn.freesound.org/previews/1_hq.mp3' },
    samplerate: 44100,
    channels: 2,
    ...overrides,
  };
}

const scored = (overrides, target = RAIN_TARGET) => {
  const result = scoreSound(sound(overrides), target);
  assert.equal(result.excluded, undefined, `unexpectedly excluded: ${result.excluded}`);
  return result;
};

describe('tokens', () => {
  it('splits on punctuation and lower-cases', () => {
    assert.deepEqual(tokens('Field-Recording, Rain_01.wav'), [
      'field',
      'recording',
      'rain',
      '01',
      'wav',
    ]);
  });
});

describe('scoreSound licence and duration gates', () => {
  it('accepts exactly the Freesound CC0 licence URL', () => {
    assert.equal(scoreSound(sound(), RAIN_TARGET).excluded, undefined);
  });

  it('rejects any other licence, including CC-BY and a CC0 URL without the trailing slash', () => {
    for (const license of [
      'https://creativecommons.org/licenses/by/4.0/',
      'http://creativecommons.org/publicdomain/zero/1.0',
      'https://creativecommons.org/publicdomain/zero/1.0/',
      'Creative Commons 0',
      '',
    ]) {
      const result = scoreSound(sound({ license }), RAIN_TARGET);
      assert.match(
        result.excluded ?? '',
        /not exactly CC0/,
        `licence "${license}" must be rejected`,
      );
    }
  });

  it('rejects durations outside 30 to 600 seconds', () => {
    assert.match(scoreSound(sound({ duration: 29.9 }), RAIN_TARGET).excluded, /outside 30 to 600/);
    assert.match(scoreSound(sound({ duration: 600.5 }), RAIN_TARGET).excluded, /outside 30 to 600/);
    assert.equal(scoreSound(sound({ duration: 30 }), RAIN_TARGET).excluded, undefined);
    assert.equal(scoreSound(sound({ duration: 600 }), RAIN_TARGET).excluded, undefined);
  });
});

describe('scoreSound ranking terms', () => {
  it('rewards well-rated and downloaded sounds, and ignores ratings with too few votes', () => {
    const strong = scored({ avg_rating: 4.9, num_ratings: 200, num_downloads: 50000 });
    const weak = scored({ avg_rating: 2, num_ratings: 200, num_downloads: 10 });
    assert.ok(strong.score > weak.score);

    // One 5-star vote is pulled toward the neutral prior, so it scores below 200 strong votes.
    const oneVote = scored({ avg_rating: 5, num_ratings: 1, num_downloads: 2000 });
    const manyVotes = scored({ avg_rating: 5, num_ratings: 200, num_downloads: 2000 });
    assert.ok(oneVote.score < manyVotes.score);
  });

  it('gives longer clips more points, with the 60, 63 and 90 second steps', () => {
    const at = (duration) => scored({ duration }).score;
    assert.ok(at(59) < at(60));
    assert.ok(at(60) < at(63));
    assert.ok(at(63) < at(90));
  });

  it('adds points for matching tags and name words, up to three tags', () => {
    const plain = scored({ tags: [], name: 'Untitled' });
    const tagged = scored({ tags: ['rain', 'light', 'drizzle', 'soft'], name: 'Untitled' });
    assert.ok(Math.abs(tagged.score - plain.score - 3) < 0.01);
    assert.ok(tagged.reasons.some((reason) => reason.includes('tags rain, light, drizzle')));
  });

  it('matches multi-word tags such as field-recording by their words', () => {
    const result = scored({ tags: ['field-recording', 'rain'], name: 'Untitled' });
    assert.ok(result.reasons.some((reason) => reason.includes('tags rain')));
  });
});

describe('scoreSound penalties', () => {
  it('penalises music, synths and beeps', () => {
    const clean = scored({ name: 'Rain on roof', tags: ['rain'] });
    for (const dirty of [
      { name: 'Rain on roof with piano music', tags: ['rain'] },
      { name: 'Rain synth pad', tags: ['rain', 'synth'] },
      { name: 'Rain beep warning', tags: ['rain', 'beep'] },
    ]) {
      assert.ok(
        scored(dirty).score < clean.score,
        `${dirty.name} should score below the clean sound`,
      );
    }
  });

  it('penalises a loop that is music, on top of the music penalty', () => {
    const music = scored({ name: 'Rain music loop', tags: ['rain', 'music'] });
    const reasons = music.reasons.join(' | ');
    assert.match(reasons, /music \(music\)/);
    assert.match(reasons, /loop with music/);
  });

  it('penalises speech and talking for non-crowd targets', () => {
    const clean = scored({ name: 'Rain on roof', tags: ['rain'] });
    const talking = scored({ name: 'Rain with talking voices', tags: ['rain', 'talking'] });
    assert.ok(talking.score < clean.score);
    assert.match(talking.reasons.join(' | '), /voice or speech \(voices, talking\)/);
  });

  it('does not penalise voices for crowd targets, where people talking is the scene', () => {
    const crowd = scored(
      { name: 'Busy tavern chatter', tags: ['tavern', 'talking', 'voices'] },
      CROWD_TARGET,
    );
    assert.doesNotMatch(crowd.reasons.join(' | '), /voice or speech/);
  });

  it('penalises one-shot clips and sound effect hits', () => {
    const clean = scored({ name: 'Rain on roof', tags: ['rain'] });
    assert.ok(scored({ name: 'Rain one-shot', tags: ['rain'] }).score < clean.score);
    assert.ok(scored({ name: 'Rain hit', tags: ['rain', 'hit'] }).score < clean.score);
  });

  it('penalises clips shorter than 45 seconds and telephone-band sample rates', () => {
    const clean = scored({ duration: 120 });
    assert.ok(scored({ duration: 40 }).score < clean.score);
    assert.ok(scored({ samplerate: 8000 }).score < clean.score);
  });

  it('penalises BPM-tagged loops, which are music', () => {
    const plain = scored({ name: 'Rain loop' });
    assert.ok(scored({ name: 'Rain loop 100 BPM' }).score < plain.score);
  });
});

describe('rankCandidates', () => {
  it('drops excluded sounds, keeps the best limit, and breaks ties by id', () => {
    const pool = [
      sound({ id: 30, name: 'Rain A' }),
      sound({ id: 10, name: 'Rain B' }),
      sound({ id: 20, name: 'Rain C' }),
      sound({ id: 40, license: 'https://creativecommons.org/licenses/by/4.0/' }),
      sound({ id: 50, duration: 900 }),
    ];
    const ranked = rankCandidates(pool, RAIN_TARGET, 2);
    assert.equal(ranked.length, 2);
    assert.deepEqual(
      ranked.map((entry) => entry.sound.id),
      [10, 20],
    );
    assert.ok(ranked.every((entry) => entry.reasons.length > 0));
  });

  it('returns an empty list when every candidate is excluded', () => {
    assert.deepEqual(rankCandidates([sound({ license: 'x' })], RAIN_TARGET, 5), []);
  });
});
