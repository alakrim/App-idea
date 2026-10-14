/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories load helpers with require */
import { act, fireEvent, screen } from '@testing-library/react-native';

import { renderWithApp } from '@/__tests__/helpers/feature-harness';
import { id, seriesRow } from '@/db/__fixtures__/factories';
import { createTestDb } from '@/db/__fixtures__/test-db';
import { seriesRepo } from '@/db/repos/series-repo';
import type { Db } from '@/db/types';
import type { PipelineFacade } from '@/features/pipeline/facade';
import { createFakePipeline } from '@/features/pipeline/fake-facade';

import { AddChapterScreen } from './add-chapter-screen';

jest.mock('react-native-reanimated', () => require('../../__tests__/helpers/reanimated-stub'));
jest.mock('@/ui/icons', () => new Proxy({}, { get: () => () => null }));
jest.mock('@gorhom/bottom-sheet', () =>
  require('../../__tests__/helpers/feature-mocks').bottomSheetStub(),
);
jest.mock('expo-sqlite', () => require('../../__tests__/helpers/fake-expo-sqlite'));
jest.mock('expo-clipboard', () => ({
  hasStringAsync: jest.fn(() => Promise.resolve(false)),
  getStringAsync: jest.fn(() => Promise.resolve('')),
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));

const DEBOUNCE = 300;

function setup(): { db: Db; pipeline: PipelineFacade } {
  const { db } = createTestDb();
  seriesRepo.insert(db, seriesRow(1, { sourceLang: 'en', targetLang: 'it' }));
  const pipeline = createFakePipeline({ db, previewMs: 50, newId: () => id(900) });
  return { db, pipeline };
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

/** Lets the rejected or resolved estimate promise run its handlers under fake timers. */
async function settle(): Promise<void> {
  await act(async () => {
    for (let turn = 0; turn < 5; turn++) await Promise.resolve();
  });
}

async function typeText(value: string): Promise<void> {
  await fireEvent.changeText(screen.getByLabelText('Chapter text'), value);
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('Add chapter: cost estimate timing', () => {
  it('estimates once, 300 ms after the last keystroke, for the final character count', async () => {
    const { db, pipeline } = setup();
    const estimateSpy = jest.spyOn(pipeline, 'estimate');
    await renderWithApp(<AddChapterScreen seriesId={id(1)} />, { db, pipeline });
    await fireEvent.press(screen.getByLabelText('Text'));

    await typeText('a');
    await advance(100);
    await typeText('ab');
    await advance(100);
    await typeText('abc');
    expect(estimateSpy).not.toHaveBeenCalled();

    await advance(DEBOUNCE - 1);
    expect(estimateSpy).not.toHaveBeenCalled();
    await advance(1);

    expect(estimateSpy).toHaveBeenCalledTimes(1);
    expect(estimateSpy).toHaveBeenCalledWith(expect.objectContaining({ chars: 3 }));
  });

  it('counts characters, not UTF-16 code units, for pasted CJK text', async () => {
    const { db, pipeline } = setup();
    const estimateSpy = jest.spyOn(pipeline, 'estimate');
    await renderWithApp(<AddChapterScreen seriesId={id(1)} />, { db, pipeline });
    await fireEvent.press(screen.getByLabelText('Text'));

    await typeText('夜明け𠀀');
    await advance(DEBOUNCE);

    expect(estimateSpy).toHaveBeenCalledWith(expect.objectContaining({ chars: 4 }));
  });

  it('does not estimate when there is no text', async () => {
    const { db, pipeline } = setup();
    const estimateSpy = jest.spyOn(pipeline, 'estimate');
    await renderWithApp(<AddChapterScreen seriesId={id(1)} />, { db, pipeline });
    await fireEvent.press(screen.getByLabelText('Text'));

    await advance(DEBOUNCE * 3);

    expect(estimateSpy).not.toHaveBeenCalled();
  });

  it('keeps the last estimate on screen while the next one is worked out', async () => {
    const { db, pipeline } = setup();
    await renderWithApp(<AddChapterScreen seriesId={id(1)} />, { db, pipeline });
    await fireEvent.press(screen.getByLabelText('Text'));

    await typeText('The lamp burned.');
    await advance(DEBOUNCE);
    await act(async () => undefined);
    expect(screen.getByLabelText(/^Estimated cost/)).toBeOnTheScreen();

    await typeText('The lamp burned low over the harbour.');
    expect(screen.queryByLabelText('Estimating cost')).toBeNull();
    expect(screen.getByLabelText(/^Estimated cost/)).toBeOnTheScreen();
  });

  it('shows an error with a Retry when the estimate fails, not a skeleton', async () => {
    const { db, pipeline } = setup();
    jest.spyOn(pipeline, 'estimate').mockRejectedValueOnce(new Error('price list offline'));
    await renderWithApp(<AddChapterScreen seriesId={id(1)} />, { db, pipeline });
    await fireEvent.press(screen.getByLabelText('Text'));

    await typeText('The lamp burned.');
    await advance(DEBOUNCE);
    await settle();

    expect(screen.queryByLabelText('Estimating cost')).toBeNull();
    expect(screen.getByText("Couldn't work out the cost")).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeOnTheScreen();
  });

  it('recomputes the estimate when Retry is pressed, and then shows the figure', async () => {
    const { db, pipeline } = setup();
    const estimateSpy = jest
      .spyOn(pipeline, 'estimate')
      .mockRejectedValueOnce(new Error('price list offline'));
    await renderWithApp(<AddChapterScreen seriesId={id(1)} />, { db, pipeline });
    await fireEvent.press(screen.getByLabelText('Text'));
    await typeText('The lamp burned.');
    await advance(DEBOUNCE);
    await settle();

    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.getAllByLabelText('Estimating cost').length).toBeGreaterThan(0);
    await advance(DEBOUNCE);
    await settle();

    expect(estimateSpy).toHaveBeenCalledTimes(2);
    expect(estimateSpy).toHaveBeenLastCalledWith(expect.objectContaining({ chars: 16 }));
    expect(screen.queryByText("Couldn't work out the cost")).toBeNull();
    expect(screen.getByLabelText(/^Estimated cost/)).toBeOnTheScreen();
  });
});
