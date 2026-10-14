/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories load helpers with require */
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { renderWithApp } from '@/__tests__/helpers/feature-harness';
import { id, seriesRow } from '@/db/__fixtures__/factories';
import { createTestDb } from '@/db/__fixtures__/test-db';
import { seriesRepo } from '@/db/repos/series-repo';
import type { Db } from '@/db/types';
import type { PipelineFacade } from '@/features/pipeline/facade';
import { createFakePipeline } from '@/features/pipeline/fake-facade';

import { SeriesScreen } from './series-screen';

jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () =>
  require('../../__tests__/helpers/swipeable-stub'),
);
jest.mock('react-native-reanimated', () => require('../../__tests__/helpers/reanimated-stub'));
jest.mock('@/ui/icons', () => new Proxy({}, { get: () => () => null }));
jest.mock('expo-image', () => require('../../__tests__/helpers/feature-mocks').expoImageStub());
jest.mock('@gorhom/bottom-sheet', () =>
  require('../../__tests__/helpers/feature-mocks').bottomSheetStub(),
);
jest.mock('expo-sqlite', () => require('../../__tests__/helpers/fake-expo-sqlite'));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
  Stack: { Screen: () => null },
}));

const WAIT = { timeout: 4000 };

/** A fake pipeline whose stages finish within a tick or two, so tests can wait for real outcomes. */
function setup(): { db: Db; pipeline: PipelineFacade } {
  const { db } = createTestDb();
  seriesRepo.insert(db, seriesRow(1, { title: 'The Night Harbour', sourceLang: 'en' }));
  let counter = 0;
  const pipeline = createFakePipeline({
    db,
    speed: 1000,
    previewMs: 1,
    newId: () => id(900 + counter++),
  });
  return { db, pipeline };
}

describe('Series screen: failed chapters', () => {
  it('confirms the OCR cost before a scanned PDF is read again', async () => {
    const { db, pipeline } = setup();
    await pipeline.createChapter({
      seriesId: id(1),
      title: 'Scanned chapter',
      source: { kind: 'pdf', fileUri: 'file:///cache/scan.pdf', fileName: 'Scan.pdf' },
    });
    pipeline.enqueue(id(900));
    const retryWithOcr = jest.spyOn(pipeline, 'retryWithOcr');
    await renderWithApp(<SeriesScreen seriesId={id(1)} />, { db, pipeline });

    await waitFor(
      () => expect(screen.getByText(/This PDF has no selectable text/)).toBeOnTheScreen(),
      WAIT,
    );
    await waitFor(
      () => expect(screen.getByRole('button', { name: /Use OCR \(≈/ })).toBeOnTheScreen(),
      WAIT,
    );

    await fireEvent.press(screen.getByRole('button', { name: /Use OCR \(≈/ }));
    expect(screen.getByText('Read this PDF with OCR?')).toBeOnTheScreen();
    expect(retryWithOcr).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Use OCR' }));
    expect(retryWithOcr).toHaveBeenCalledWith(id(900));
  });

  it('retries a stopped chapter from its failed stage without asking first', async () => {
    const { db, pipeline } = setup();
    await pipeline.createChapter({
      seriesId: id(1),
      title: 'Offline page',
      source: { kind: 'url', url: 'https://example.com/fail/page' },
    });
    pipeline.enqueue(id(900));
    const retry = jest.spyOn(pipeline, 'retry');
    await renderWithApp(<SeriesScreen seriesId={id(1)} />, { db, pipeline });

    await waitFor(
      () => expect(screen.getByRole('button', { name: 'Retry' })).toBeOnTheScreen(),
      WAIT,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));

    expect(retry).toHaveBeenCalledWith(id(900));
    expect(screen.queryByText('Read this PDF with OCR?')).toBeNull();
  });
});

describe('Series screen: chapters and series', () => {
  it('shows the empty state invitation when the series has no chapters', async () => {
    const { db, pipeline } = setup();
    await renderWithApp(<SeriesScreen seriesId={id(1)} />, { db, pipeline });

    await fireEvent.press(screen.getByRole('button', { name: 'Add your first chapter' }));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/chapter/new',
      params: { seriesId: id(1) },
    });
  });

  it('deletes the series after confirmation and leaves the screen', async () => {
    const { db, pipeline } = setup();
    await renderWithApp(<SeriesScreen seriesId={id(1)} />, { db, pipeline });

    await fireEvent.press(screen.getByRole('button', { name: 'Series actions' }));
    await fireEvent.press(screen.getByRole('button', { name: /Delete series/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Delete series' }));

    expect(seriesRepo.get(db, id(1))).toBeNull();
    await act(async () => {
      await Promise.resolve();
    });
    expect(router.back).toHaveBeenCalled();
  });
});
