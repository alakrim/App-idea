import { audioSegmentRepo } from './audio-segment-repo';
import { chapterRepo } from './chapter-repo';
import { seriesRepo } from './series-repo';
import { chapterRow, id, seriesRow } from '../__fixtures__/factories';
import { createTestDb } from '../__fixtures__/test-db';
import { DbValidationError } from '../json-column';
import { audioSegments, narrationProfiles } from '../schema';

import type { AudioSegment } from '../../core/domain';
import type { Db } from '../types';

const PROFILE_ID = id(900);

function segment(idx: number, overrides: Partial<AudioSegment> = {}): AudioSegment {
  return {
    id: id(500 + idx),
    chapterId: id(1),
    idx,
    sentenceStart: idx * 2,
    sentenceEnd: idx * 2 + 1,
    fileUri: `file:///narration/${idx}.m4a`,
    durationMs: 6000,
    sentenceOffsetsMs: [0, 2500],
    profileId: PROFILE_ID,
    inputHash: `hash-${idx}`,
    ...overrides,
  };
}

function setup(): Db {
  const { db } = createTestDb();
  seriesRepo.insert(db, seriesRow(1));
  chapterRepo.insert(db, chapterRow(1, 1, 1));
  chapterRepo.insert(db, chapterRow(2, 1, 2));
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

describe('audioSegmentRepo', () => {
  it('round-trips a segment with its sentence offsets', () => {
    const db = setup();
    audioSegmentRepo.insert(db, segment(0));

    expect(audioSegmentRepo.listByChapter(db, id(1))).toEqual([segment(0)]);
  });

  it('lists a chapter segments in playback order and only that chapter', () => {
    const db = setup();
    audioSegmentRepo.insert(db, segment(2));
    audioSegmentRepo.insert(db, segment(0));
    audioSegmentRepo.insert(db, segment(0, { chapterId: id(2), id: id(700) }));

    expect(audioSegmentRepo.listByChapter(db, id(1)).map((s) => s.idx)).toEqual([0, 2]);
  });

  it('lists from an index onwards when asked, for progressive playback', () => {
    const db = setup();
    audioSegmentRepo.insert(db, segment(0));
    audioSegmentRepo.insert(db, segment(1));
    audioSegmentRepo.insert(db, segment(2));

    expect(audioSegmentRepo.listByChapter(db, id(1), 1).map((s) => s.idx)).toEqual([1, 2]);
  });

  it('rejects a segment whose sentence range is inverted', () => {
    const db = setup();

    expect(() => audioSegmentRepo.insert(db, segment(0, { sentenceStart: 3, sentenceEnd: 1 }))).toThrow();
    expect(audioSegmentRepo.listByChapter(db, id(1))).toEqual([]);
  });

  it('deletes a segment and every later one, leaving earlier segments and other chapters alone', () => {
    const db = setup();
    audioSegmentRepo.insert(db, segment(0));
    audioSegmentRepo.insert(db, segment(1));
    audioSegmentRepo.insert(db, segment(2));
    audioSegmentRepo.insert(db, segment(1, { chapterId: id(2), id: id(701) }));

    audioSegmentRepo.deleteFrom(db, id(1), 1);

    expect(audioSegmentRepo.listByChapter(db, id(1)).map((s) => s.idx)).toEqual([0]);
    expect(audioSegmentRepo.listByChapter(db, id(2)).map((s) => s.idx)).toEqual([1]);
  });

  it('throws a typed validation error for a stored row with corrupt offsets', () => {
    const db = setup();
    db.insert(audioSegments)
      .values({ ...segment(0), sentenceOffsetsMs: '{not json' })
      .run();

    expect(() => audioSegmentRepo.listByChapter(db, id(1))).toThrow(DbValidationError);
  });
});
