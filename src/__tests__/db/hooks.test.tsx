import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import type { ReactElement } from 'react';

import { DbContext, useChapters, useJobs, useSeriesList } from '@/db/hooks';
import { chapterRow, id, seriesRow, T0 } from '@/db/__fixtures__/factories';
import { createTestDb } from '@/db/__fixtures__/test-db';
import { chapterRepo } from '@/db/repos/chapter-repo';
import { seriesRepo } from '@/db/repos/series-repo';
import { jobs } from '@/db/schema';

import type { Db } from '@/db/types';

// The change event is what drizzle's useLiveQuery listens to. The fake lets a test fire it.
jest.mock('expo-sqlite', () => require('../helpers/fake-expo-sqlite'));

const sqlite = jest.requireMock<typeof import('../helpers/fake-expo-sqlite')>('expo-sqlite');

let db: Db;

beforeEach(() => {
  db = createTestDb().db;
});

function SeriesTitles() {
  const list = useSeriesList();
  return (
    <>
      {list.map((item) => (
        <Text key={item.id}>{item.title}</Text>
      ))}
    </>
  );
}

function ChapterTitles({ seriesId }: { seriesId: string }) {
  const chapters = useChapters(seriesId);
  return (
    <>
      {chapters.map((chapter) => (
        <Text key={chapter.id}>{chapter.title}</Text>
      ))}
    </>
  );
}

function JobCount({ chapterId }: { chapterId: string }) {
  return <Text>jobs: {useJobs(chapterId).length}</Text>;
}

async function renderWithDb(ui: ReactElement) {
  return render(<DbContext.Provider value={db}>{ui}</DbContext.Provider>);
}

describe('live hooks', () => {
  it('reads the initial rows synchronously on the first render', async () => {
    seriesRepo.insert(db, seriesRow(1, { title: 'Dune' }));

    await renderWithDb(<SeriesTitles />);

    expect(screen.getByText('Dune')).toBeTruthy();
  });

  it('re-reads when a watched table changes', async () => {
    seriesRepo.insert(db, seriesRow(1, { title: 'Dune' }));
    await renderWithDb(<SeriesTitles />);

    seriesRepo.insert(db, seriesRow(2, { title: 'Emma' }));
    await act(async () => {
      sqlite.__emitChange('series');
    });

    expect(screen.getByText('Emma')).toBeTruthy();
  });

  it('ignores changes to tables it does not read', async () => {
    seriesRepo.insert(db, seriesRow(1, { title: 'Dune' }));
    const listSpy = jest.spyOn(seriesRepo, 'list');
    await renderWithDb(<SeriesTitles />);
    const readsBefore = listSpy.mock.calls.length;

    await act(async () => {
      sqlite.__emitChange('vocab');
    });

    expect(listSpy.mock.calls.length).toBe(readsBefore);
    listSpy.mockRestore();
  });

  it('re-reads chapters of the new series when the id changes', async () => {
    seriesRepo.insert(db, seriesRow(1, { title: 'Series one' }));
    seriesRepo.insert(db, seriesRow(2, { title: 'Series two' }));
    chapterRepo.insert(db, chapterRow(1, 1, 1, { title: 'Alpha' }));
    chapterRepo.insert(db, chapterRow(2, 2, 1, { title: 'Beta' }));

    const view = await renderWithDb(<ChapterTitles seriesId={id(1)} />);
    expect(screen.getByText('Alpha')).toBeTruthy();

    await view.rerender(
      <DbContext.Provider value={db}>
        <ChapterTitles seriesId={id(2)} />
      </DbContext.Provider>,
    );

    expect(screen.getByText('Beta')).toBeTruthy();
    expect(screen.queryByText('Alpha')).toBeNull();
  });

  it('reports jobs of a chapter and updates when they change', async () => {
    seriesRepo.insert(db, seriesRow(1));
    chapterRepo.insert(db, chapterRow(1, 1, 1));
    await renderWithDb(<JobCount chapterId={id(1)} />);
    expect(screen.getByText('jobs: 0')).toBeTruthy();

    db.insert(jobs)
      .values({
        id: id(10),
        chapterId: id(1),
        stage: 'extract',
        status: 'done',
        attempt: 1,
        inputHash: 'h',
        progress: 1,
        costUsd: 0,
        model: null,
        promptVersion: null,
        error: null,
        startedAt: T0,
        finishedAt: T0,
      })
      .run();
    await act(async () => {
      sqlite.__emitChange('jobs');
    });

    expect(screen.getByText('jobs: 1')).toBeTruthy();
  });

  it('throws a clear error outside DbProvider', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await expect(render(<SeriesTitles />)).rejects.toThrow(/inside <DbProvider>/);
    } finally {
      consoleError.mockRestore();
    }
  });
});
