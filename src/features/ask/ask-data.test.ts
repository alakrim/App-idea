import { chapterRow, id, seriesRow, T0 } from '@/db/__fixtures__/factories';
import { createTestDb } from '@/db/__fixtures__/test-db';
import { chapterRepo } from '@/db/repos/chapter-repo';
import { positionRepo } from '@/db/repos/position-repo';
import { seriesRepo } from '@/db/repos/series-repo';

import { readAskSeriesData } from './ask-data';

describe('readAskSeriesData cutoff', () => {
  it('stays at the furthest chapter when the listener goes back to an earlier one', () => {
    const { db } = createTestDb();
    seriesRepo.insert(db, seriesRow(1));
    for (let n = 1; n <= 5; n++) chapterRepo.insert(db, chapterRow(n, 1, n));
    positionRepo.record(db, id(1), { chapterId: id(5), sentenceIdx: 3, positionMs: 0 }, T0);

    positionRepo.record(db, id(1), { chapterId: id(2), sentenceIdx: 0, positionMs: 0 }, T0 + 1);

    const data = readAskSeriesData(db, id(1));
    expect(data?.cutoff).toMatchObject({ chapterId: id(5), chapterNumber: 5, chapterCount: 5 });
  });
});
