import { audioSegmentRepo } from '@/db/repos/audio-segment-repo';
import { chapterRepo } from '@/db/repos/chapter-repo';
import { seriesRepo } from '@/db/repos/series-repo';
import { chapterRow, id, seriesRow } from '@/db/__fixtures__/factories';
import { createTestDb } from '@/db/__fixtures__/test-db';
import { narrationProfiles } from '@/db/schema';

import { playTarget, readSeriesScreen, type ChapterRecord } from './series-data';

const PROFILE = id(900);

function saveFirstPassage(db: ReturnType<typeof createTestDb>['db'], chapterN: number): void {
  audioSegmentRepo.insert(db, {
    id: id(700 + chapterN),
    chapterId: id(chapterN),
    idx: 0,
    sentenceStart: 0,
    sentenceEnd: 1,
    fileUri: `file:///narration/${chapterN}.m4a`,
    durationMs: 6000,
    sentenceOffsetsMs: [0, 3000],
    profileId: PROFILE,
    inputHash: 'h',
  });
}

function setup() {
  const fixture = createTestDb();
  const { db } = fixture;
  seriesRepo.insert(db, seriesRow(1));
  db.insert(narrationProfiles)
    .values({ id: PROFILE, name: 'Voice', provider: 'openrouter', model: 'm', voice: 'v', style: null, speed: 1 })
    .run();
  return db;
}

function record(chapterId: string, playable: boolean): ChapterRecord {
  return {
    chapter: chapterRow(Number(chapterId.slice(-1)) || 1, 1, 1),
    failure: null,
    listening: null,
    playable,
  };
}

describe('readSeriesScreen playability', () => {
  it('marks a chapter playable when its first passage is saved, whatever its status', () => {
    const db = setup();
    // A cancelled chapter keeps its audio: its status is draft, but it can still play.
    chapterRepo.insert(db, chapterRow(1, 1, 1, { status: 'draft' }));
    saveFirstPassage(db, 1);
    // A failed chapter with no audio at all cannot play.
    chapterRepo.insert(db, chapterRow(2, 1, 2, { status: 'failed' }));
    // A ready chapter whose audio was removed cannot play either.
    chapterRepo.insert(db, chapterRow(3, 1, 3, { status: 'ready' }));

    const screen = readSeriesScreen(db, id(1));

    expect(screen.chapters.map((c) => [c.chapter.id, c.playable])).toEqual([
      [id(1), true],
      [id(2), false],
      [id(3), false],
    ]);
  });

  it('keeps a renarrating chapter playable: its saved passages stay until replaced', () => {
    const db = setup();
    chapterRepo.insert(db, chapterRow(1, 1, 1, { status: 'processing' }));
    saveFirstPassage(db, 1);

    expect(readSeriesScreen(db, id(1)).chapters[0]?.playable).toBe(true);
  });
});

describe('playTarget', () => {
  it('resumes the chapter last played when it can play', () => {
    const chapters = [record(id(1), true), record(id(2), true)];
    expect(playTarget(chapters, id(2))).toEqual({ chapterId: id(2), resume: true });
  });

  it('falls back to the first chapter that can play', () => {
    const chapters = [record(id(1), false), record(id(2), true), record(id(3), true)];
    expect(playTarget(chapters, id(1))).toEqual({ chapterId: id(2), resume: false });
  });

  it('is null when no chapter can play', () => {
    expect(playTarget([record(id(1), false)], null)).toBeNull();
  });
});
