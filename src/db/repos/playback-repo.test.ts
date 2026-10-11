import { audioSegmentRepo } from './audio-segment-repo';
import { chapterRepo } from './chapter-repo';
import { cueRepo } from './cue-repo';
import { playbackRepo } from './playback-repo';
import { seriesRepo } from './series-repo';
import { textRepo } from './text-repo';
import { chapterRow, chapterText, id, seriesRow } from '../__fixtures__/factories';
import { createTestDb } from '../__fixtures__/test-db';
import { narrationProfiles } from '../schema';

import type { AmbienceCue, AudioSegment } from '../../core/domain';
import type { Db } from '../types';

const PROFILE_ID = id(900);

function cue(n: number, enabled: boolean): AmbienceCue {
  return {
    id: id(300 + n),
    chapterId: id(1),
    category: 'tavern_crowd',
    startSentence: n * 2,
    endSentence: n * 2 + 1,
    intensity: 'low',
    fadeInMs: 1000,
    fadeOutMs: 1000,
    confidence: 0.7,
    reason: 'Quiet room.',
    enabled,
  };
}

function segment(idx: number): AudioSegment {
  return {
    id: id(500 + idx),
    chapterId: id(1),
    idx,
    sentenceStart: 0,
    sentenceEnd: 1,
    fileUri: `file:///narration/${idx}.m4a`,
    durationMs: 5000,
    sentenceOffsetsMs: [0, 2000],
    profileId: PROFILE_ID,
    inputHash: `hash-${idx}`,
  };
}

function setup(): Db {
  const { db } = createTestDb();
  seriesRepo.insert(db, seriesRow(1, { title: 'The Harbour', coverTint: '#2B3A55' }));
  chapterRepo.insert(db, chapterRow(1, 1, 1, { title: 'Arrival' }));
  textRepo.replaceChapterText(db, id(1), chapterText(1, ['Rain fell.', 'The door opened.']));
  textRepo.setTranslations(db, id(1), [{ idx: 0, translated: 'Il pleuvait.' }]);
  db.insert(narrationProfiles)
    .values({
      id: PROFILE_ID,
      name: 'Test voice',
      provider: 'openrouter',
      model: 'test/model',
      voice: 'alloy',
      style: null,
      speed: 1,
    })
    .run();
  return db;
}

describe('playbackRepo.getChapterForPlayback', () => {
  it('returns null for a chapter that does not exist', () => {
    expect(playbackRepo.getChapterForPlayback(setup(), id(99))).toBeNull();
  });

  it('returns the chapter, its series, sentences with translations and paragraphs', () => {
    const db = setup();

    const data = playbackRepo.getChapterForPlayback(db, id(1));

    expect(data?.chapter.title).toBe('Arrival');
    expect(data?.series).toMatchObject({ title: 'The Harbour', coverTint: '#2B3A55' });
    expect(data?.sentences.map((s) => [s.idx, s.text, s.translated])).toEqual([
      [0, 'Rain fell.', 'Il pleuvait.'],
      [1, 'The door opened.', null],
    ]);
    expect(data?.paragraphs).toHaveLength(1);
  });

  it('returns only enabled cues, in start order', () => {
    const db = setup();
    cueRepo.insert(db, cue(2, true));
    cueRepo.insert(db, cue(0, false));
    cueRepo.insert(db, cue(1, true));

    expect(playbackRepo.getChapterForPlayback(db, id(1))?.cues.map((c) => c.id)).toEqual([
      id(301),
      id(302),
    ]);
  });

  it('returns the audio segments in playback order, with their offsets', () => {
    const db = setup();
    audioSegmentRepo.insert(db, segment(1));
    audioSegmentRepo.insert(db, segment(0));

    const segments = playbackRepo.getChapterForPlayback(db, id(1))?.segments;

    expect(segments?.map((s) => [s.idx, s.sentenceOffsetsMs])).toEqual([
      [0, [0, 2000]],
      [1, [0, 2000]],
    ]);
  });
});
