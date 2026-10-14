import { chapterRow, id, seriesRow, T0 } from '@/db/__fixtures__/factories';
import { createTestDb } from '@/db/__fixtures__/test-db';
import { chapterRepo } from '@/db/repos/chapter-repo';
import { seriesRepo } from '@/db/repos/series-repo';
import type { Db } from '@/db/types';

import {
  createSeries,
  deleteChapter,
  deleteSeries,
  moveChapter,
  updateSeries,
  validateSeriesName,
  type SeriesFiles,
  type SeriesFormValues,
  type SeriesServiceDeps,
} from './series-service';

function setup() {
  const { db } = createTestDb();
  const deleted: { files: string[]; chapters: string[] } = { files: [], chapters: [] };
  const files: SeriesFiles = {
    deleteFile: (uri) => deleted.files.push(uri),
    deleteChapterFiles: (chapterId) => deleted.chapters.push(chapterId),
  };
  let next = 0;
  const deps: SeriesServiceDeps = {
    db,
    files,
    newId: () => id(500 + next++),
    now: () => T0 + 1000,
  };
  return { db, deps, deleted };
}

const values = (overrides: Partial<SeriesFormValues> = {}): SeriesFormValues => ({
  title: '  The Night Harbour  ',
  coverUri: null,
  coverTint: null,
  sourceLang: 'en',
  targetLang: null,
  ...overrides,
});

function titles(db: Db, seriesId: string): string[] {
  return chapterRepo.listBySeries(db, seriesId).map((chapter) => chapter.title);
}

describe('validateSeriesName', () => {
  it('asks for a name when it is blank', () => {
    expect(validateSeriesName('   ')).toBe('Give your series a name.');
  });

  it('refuses names over 80 characters, counting characters rather than bytes', () => {
    expect(validateSeriesName('夜'.repeat(80))).toBeNull();
    expect(validateSeriesName('x'.repeat(81))).toBe('Keep the name under 80 characters.');
  });
});

describe('createSeries', () => {
  it('refuses an invalid name and writes nothing', () => {
    const { db, deps } = setup();

    expect(() => createSeries(deps, values({ title: '  ' }))).toThrow('Give your series a name.');
    expect(seriesRepo.list(db)).toHaveLength(0);
  });

  it('stores the trimmed name, languages and cover, with both timestamps set', () => {
    const { db, deps } = setup();

    const seriesId = createSeries(
      deps,
      values({ coverUri: 'file:///covers/a.jpg', coverTint: '#112233', targetLang: 'it' }),
    );

    expect(seriesRepo.get(db, seriesId)).toMatchObject({
      title: 'The Night Harbour',
      coverUri: 'file:///covers/a.jpg',
      coverTint: '#112233',
      sourceLang: 'en',
      targetLang: 'it',
      createdAt: T0 + 1000,
      updatedAt: T0 + 1000,
    });
  });
});

describe('updateSeries', () => {
  it('removes the replaced cover file and keeps the chapters', () => {
    const { db, deps, deleted } = setup();
    seriesRepo.insert(db, seriesRow(1, { coverUri: 'file:///covers/old.jpg' }));
    chapterRepo.insert(db, chapterRow(1, 1, 1));

    updateSeries(deps, id(1), values({ coverUri: 'file:///covers/new.jpg' }));

    expect(deleted.files).toEqual(['file:///covers/old.jpg']);
    expect(seriesRepo.get(db, id(1))?.coverUri).toBe('file:///covers/new.jpg');
    expect(chapterRepo.listBySeries(db, id(1))).toHaveLength(1);
  });
});

/** Records each stop, and what the database still held when it was asked to stop. */
function withStops(deps: SeriesServiceDeps, db: Db) {
  const stops: { ids: string[]; chapterRowsAtStop: number }[] = [];
  return {
    stops,
    removal: {
      ...deps,
      stopRuns: async (chapterIds: readonly string[]) => {
        stops.push({
          ids: [...chapterIds],
          chapterRowsAtStop: chapterRepo.listBySeries(db, id(1)).length,
        });
      },
    },
  };
}

describe('deleteSeries', () => {
  it('stops every run of the series before removing its rows and files', async () => {
    const { db, deps, deleted } = setup();
    seriesRepo.insert(db, seriesRow(1, { coverUri: 'file:///covers/a.jpg' }));
    chapterRepo.insert(db, chapterRow(1, 1, 1));
    chapterRepo.insert(db, chapterRow(2, 1, 2));
    const { stops, removal } = withStops(deps, db);

    await deleteSeries(removal, id(1));

    expect(stops).toEqual([{ ids: [id(1), id(2)], chapterRowsAtStop: 2 }]);
    expect(seriesRepo.get(db, id(1))).toBeNull();
    expect(chapterRepo.listBySeries(db, id(1))).toEqual([]);
    expect(deleted.chapters).toEqual([id(1), id(2)]);
    expect(deleted.files).toEqual(['file:///covers/a.jpg']);
  });
});

describe('deleteChapter', () => {
  it('stops the chapter run, then removes the chapter row and its files', async () => {
    const { db, deps, deleted } = setup();
    seriesRepo.insert(db, seriesRow(1));
    chapterRepo.insert(db, chapterRow(1, 1, 1));
    const { stops, removal } = withStops(deps, db);

    await deleteChapter(removal, id(1));

    expect(stops).toEqual([{ ids: [id(1)], chapterRowsAtStop: 1 }]);
    expect(chapterRepo.get(db, id(1))).toBeNull();
    expect(deleted.chapters).toEqual([id(1)]);
  });

  it('does not remove the rows while a run is still stopping', async () => {
    const { db, deps } = setup();
    seriesRepo.insert(db, seriesRow(1));
    chapterRepo.insert(db, chapterRow(1, 1, 1));
    let release: () => void = () => undefined;
    const removal = {
      ...deps,
      stopRuns: () => new Promise<void>((resolve) => (release = resolve)),
    };

    const pending = deleteChapter(removal, id(1));
    expect(chapterRepo.get(db, id(1))).not.toBeNull();

    release();
    await pending;
    expect(chapterRepo.get(db, id(1))).toBeNull();
  });
});

describe('moveChapter', () => {
  function threeChapters() {
    const setupResult = setup();
    seriesRepo.insert(setupResult.db, seriesRow(1));
    ['One', 'Two', 'Three'].forEach((title, index) => {
      chapterRepo.insert(setupResult.db, chapterRow(index + 1, 1, index + 1, { title }));
    });
    return setupResult;
  }

  it('moves a chapter down past its neighbour and back up', () => {
    const { db, deps } = threeChapters();

    moveChapter(deps, id(1), 'down');
    expect(titles(db, id(1))).toEqual(['Two', 'One', 'Three']);

    moveChapter(deps, id(1), 'up');
    expect(titles(db, id(1))).toEqual(['One', 'Two', 'Three']);
  });

  it('does nothing past either end of the series', () => {
    const { db, deps } = threeChapters();

    moveChapter(deps, id(1), 'up');
    moveChapter(deps, id(3), 'down');

    expect(titles(db, id(1))).toEqual(['One', 'Two', 'Three']);
  });

  it('moves a middle chapter in both directions', () => {
    const { db, deps } = threeChapters();

    moveChapter(deps, id(2), 'up');
    expect(titles(db, id(1))).toEqual(['Two', 'One', 'Three']);

    moveChapter(deps, id(2), 'down');
    expect(titles(db, id(1))).toEqual(['One', 'Two', 'Three']);
  });
});
