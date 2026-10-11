import { chapterRow, chapterText, id, seriesRow, T0 } from '@/db/__fixtures__/factories';
import { createTestDb } from '@/db/__fixtures__/test-db';
import { chapterRepo } from '@/db/repos/chapter-repo';
import { seriesRepo } from '@/db/repos/series-repo';
import { textRepo } from '@/db/repos/text-repo';
import { vocabRepo } from '@/db/repos/vocab-repo';
import type { Db } from '@/db/types';

import { languageLabel, readReviewCards, readVocabGroups, readVocabTotal } from './vocab-data';

function seed(): Db {
  const { db } = createTestDb();
  seriesRepo.insert(db, seriesRow(1, { title: 'The Jade Lantern', targetLang: 'it' }));
  seriesRepo.insert(db, seriesRow(2, { title: 'Harbour Lights', targetLang: 'fr' }));
  chapterRepo.insert(db, chapterRow(1, 1, 1));
  chapterRepo.insert(db, chapterRow(2, 2, 1));
  textRepo.replaceChapterText(db, id(1), chapterText(1, ['Il tramonto era bellissimo.']));
  textRepo.replaceChapterText(db, id(2), chapterText(2, ['Le port était calme.']));
  return db;
}

function add(
  db: Db,
  n: number,
  item: { seriesN: number; chapterN: number; lang: string; term: string; createdAt?: number },
): void {
  vocabRepo.insert(db, {
    id: id(600 + n),
    seriesId: id(item.seriesN),
    chapterId: id(item.chapterN),
    sentenceIdx: 0,
    term: item.term,
    lang: item.lang,
    createdAt: item.createdAt ?? T0 + n,
  });
}

describe('languageLabel', () => {
  it('uses the native name for a known tag, in any case', () => {
    expect(languageLabel('it')).toBe('Italiano');
    expect(languageLabel('PT-BR')).toBe('Português (Brasil)');
  });

  it('shows an unknown tag in capitals', () => {
    expect(languageLabel('tlh')).toBe('TLH');
  });
});

describe('readVocabGroups', () => {
  it('groups by language, then by series, with the source sentence attached', () => {
    const db = seed();
    add(db, 1, { seriesN: 1, chapterN: 1, lang: 'it', term: 'bellissimo' });
    add(db, 2, { seriesN: 2, chapterN: 2, lang: 'fr', term: 'calme' });
    add(db, 3, { seriesN: 1, chapterN: 1, lang: 'it', term: 'tramonto' });

    const groups = readVocabGroups(db, '');

    expect(groups.map((g) => [g.lang, g.label])).toEqual([
      ['it', 'Italiano'],
      ['fr', 'Français'],
    ]);
    expect(groups[0]?.series).toHaveLength(1);
    expect(groups[0]?.series[0]).toMatchObject({ title: 'The Jade Lantern' });
    expect(groups[0]?.series[0]?.cards.map((c) => c.item.term)).toEqual(['tramonto', 'bellissimo']);
    expect(groups[0]?.series[0]?.cards[0]?.sentence).toBe('Il tramonto era bellissimo.');
    expect(groups[1]?.series[0]?.cards[0]?.sentence).toBe('Le port était calme.');
  });

  it('filters by the search text across term and explanation', () => {
    const db = seed();
    add(db, 1, { seriesN: 1, chapterN: 1, lang: 'it', term: 'bellissimo' });
    add(db, 2, { seriesN: 2, chapterN: 2, lang: 'fr', term: 'calme' });
    vocabRepo.setExplanation(db, id(602), { translation: 'calm', explanation: 'Quiet, peaceful.' });

    expect(readVocabGroups(db, 'PEACE').map((g) => g.lang)).toEqual(['fr']);
    expect(readVocabGroups(db, 'zzz')).toEqual([]);
  });

  it('counts every item regardless of the search', () => {
    const db = seed();
    add(db, 1, { seriesN: 1, chapterN: 1, lang: 'it', term: 'bellissimo' });

    expect(readVocabTotal(db)).toBe(1);
  });
});

describe('readReviewCards', () => {
  it('lists cards not yet known first, then the least recently reviewed', () => {
    const db = seed();
    add(db, 1, { seriesN: 1, chapterN: 1, lang: 'it', term: 'one' });
    add(db, 2, { seriesN: 1, chapterN: 1, lang: 'it', term: 'two' });
    add(db, 3, { seriesN: 1, chapterN: 1, lang: 'it', term: 'three' });
    vocabRepo.setReviewed(db, id(601), true, T0 + 100);
    vocabRepo.setReviewed(db, id(602), false, T0 + 50);

    expect(readReviewCards(db).map((c) => c.term)).toEqual(['three', 'two', 'one']);
  });
});
