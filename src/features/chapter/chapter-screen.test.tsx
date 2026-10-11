/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories load helpers with require */
import { fireEvent, screen } from '@testing-library/react-native';

import { renderWithApp } from '@/__tests__/helpers/feature-harness';
import { chapterRow, id, seriesRow } from '@/db/__fixtures__/factories';
import { createTestDb } from '@/db/__fixtures__/test-db';
import { chapterRepo } from '@/db/repos/chapter-repo';
import { cueRepo } from '@/db/repos/cue-repo';
import { seriesRepo } from '@/db/repos/series-repo';
import { textRepo } from '@/db/repos/text-repo';
import type { Db } from '@/db/types';
import { createFakePipeline } from '@/features/pipeline/fake-facade';

import { ChapterScreen } from './chapter-screen';

jest.mock('react-native-reanimated', () => require('../../__tests__/helpers/reanimated-stub'));
jest.mock('@/ui/icons', () => new Proxy({}, { get: () => () => null }));
jest.mock('expo-sqlite', () => require('../../__tests__/helpers/fake-expo-sqlite'));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));

function seed(): Db {
  const { db } = createTestDb();
  seriesRepo.insert(db, seriesRow(1, { title: 'The Night Harbour' }));
  chapterRepo.insert(
    db,
    chapterRow(1, 1, 1, { title: 'The Lamp', status: 'ready', durationMs: 60_000 }),
  );
  textRepo.replaceChapterText(db, id(1), {
    paragraphs: [{ idx: 0, sentenceStart: 0, sentenceEnd: 1, kind: 'text' }],
    sentences: [
      {
        chapterId: id(1),
        idx: 0,
        paragraphIdx: 0,
        text: 'Dark water.',
        translated: null,
        charCount: 11,
      },
    ],
  });
  cueRepo.insert(db, {
    id: id(91),
    chapterId: id(1),
    category: 'harbor_port',
    startSentence: 0,
    endSentence: 0,
    intensity: 'low',
    fadeInMs: 1000,
    fadeOutMs: 1000,
    confidence: 0.7,
    reason: 'Water against a quay.',
    enabled: true,
  });
  return db;
}

describe('ChapterScreen ambience switches', () => {
  it('writes a cue switch to the database so it survives a reload', async () => {
    const db = seed();
    await renderWithApp(<ChapterScreen chapterId={id(1)} />, {
      db,
      pipeline: createFakePipeline({ db }),
    });

    await fireEvent(screen.getByRole('switch', { name: /Ambience: Harbor/ }), 'valueChange', false);

    expect(cueRepo.listForChapter(db, id(1))[0]?.enabled).toBe(false);
  });

  it('says so when the chapter no longer exists', async () => {
    const db = seed();
    await renderWithApp(<ChapterScreen chapterId={id(404)} />, {
      db,
      pipeline: createFakePipeline({ db }),
    });

    expect(screen.getByText('Chapter not found')).toBeOnTheScreen();
  });
});
