/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories load the stub with require() */
import { fireEvent, screen } from '@testing-library/react-native';

import { renderThemed } from '@/__tests__/helpers/render-themed';
import type { Chapter } from '@/core/domain';
import type { ListeningProgress } from '@/core/playback/listening-progress';

import { ChapterRow, type ChapterRowProps } from './chapter-row';

jest.mock('react-native-reanimated', () => require('../../__tests__/helpers/reanimated-stub'));
jest.mock('@/ui/icons', () => new Proxy({}, { get: () => () => null }));

const CHAPTER: Chapter = {
  id: '01HZX00000000000000000000A',
  seriesId: '01HZX00000000000000000000S',
  order: 3,
  title: 'The Bell Buoy',
  source: { kind: 'text', label: 'pasted' },
  sourceLang: 'en',
  status: 'ready',
  wordCount: null,
  durationMs: 60 * 60_000,
  createdAt: 0,
  updatedAt: 0,
};

function props(overrides: Partial<ChapterRowProps> = {}): ChapterRowProps {
  return {
    number: 3,
    chapter: CHAPTER,
    progress: null,
    failure: null,
    ocrUsd: null,
    listening: { kind: 'unstarted' },
    current: false,
    divided: false,
    availability: { canMoveUp: true, canMoveDown: true, canRegenerate: true, canStop: false },
    onOpen: jest.fn(),
    onPlay: jest.fn(),
    onMenu: jest.fn(),
    onAction: jest.fn(),
    onRetry: jest.fn(),
    onOcr: jest.fn(),
    ...overrides,
  };
}

async function renderRow(overrides: Partial<ChapterRowProps>) {
  return await renderThemed(<ChapterRow {...props(overrides)} />);
}

describe('ChapterRow listening state', () => {
  it('shows the minutes left and says them to screen readers in the row label', async () => {
    const listening: ListeningProgress = {
      kind: 'in-progress',
      fraction: 0.5,
      remainingMs: 12 * 60_000,
    };
    await renderRow({ listening });

    expect(screen.getByText('12 min left')).toBeTruthy();
    expect(
      screen.getByLabelText('Chapter 3, The Bell Buoy, Ready · 1 h 0 m, 12 minutes left'),
    ).toBeTruthy();
  });

  it('marks a finished chapter with a check and "Finished"', async () => {
    await renderRow({ listening: { kind: 'finished' } });

    expect(screen.getByText('Finished')).toBeTruthy();
    expect(screen.getByLabelText(/, finished$/)).toBeTruthy();
  });

  it('marks the chapter the listener is on with a Now marker', async () => {
    await renderRow({ current: true });

    expect(screen.getByText('Now')).toBeTruthy();
    expect(screen.getByLabelText(/, now playing$/)).toBeTruthy();
  });

  it('shows no listening line for a chapter that was never started and is not current', async () => {
    await renderRow({});

    expect(screen.queryByText('Now')).toBeNull();
    expect(screen.queryByText(/min left/)).toBeNull();
    expect(screen.queryByText('Finished')).toBeNull();
  });

  it('opens the chapter from its title area', async () => {
    const onOpen = jest.fn();
    await renderRow({ onOpen });

    fireEvent.press(screen.getByLabelText(/Chapter 3, The Bell Buoy/));

    expect(onOpen).toHaveBeenCalledWith(CHAPTER.id);
  });
});

describe('ChapterRow actions', () => {
  it('opens the chapter menu from a visible More actions button', async () => {
    const onMenu = jest.fn();
    await renderRow({ onMenu });

    await fireEvent.press(screen.getByRole('button', { name: 'More actions for chapter 3' }));

    expect(onMenu).toHaveBeenCalledWith(CHAPTER.id);
  });

  it('offers the same actions to screen readers and runs the one they pick', async () => {
    const onAction = jest.fn();
    await renderRow({ onAction });

    fireEvent(
      screen.getByRole('button', { name: /^Chapter 3, The Bell Buoy/ }),
      'accessibilityAction',
      {
        nativeEvent: { actionName: 'move-up' },
      },
    );

    expect(onAction).toHaveBeenCalledWith(CHAPTER.id, 'move-up');
  });

  it('ignores an accessibility action it does not know', async () => {
    const onAction = jest.fn();
    await renderRow({ onAction });

    fireEvent(
      screen.getByRole('button', { name: /^Chapter 3, The Bell Buoy/ }),
      'accessibilityAction',
      {
        nativeEvent: { actionName: 'rename' },
      },
    );

    expect(onAction).not.toHaveBeenCalled();
  });

  it('shows Try again on a failed chapter even when the pipeline marks the error not retryable', async () => {
    const onRetry = jest.fn();
    const failed: Chapter = { ...CHAPTER, status: 'failed' };
    await renderRow({
      chapter: failed,
      failure: { code: 'UNKNOWN', message: 'Something went wrong. Try again.', retryable: false },
      onRetry,
    });

    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(onRetry).toHaveBeenCalledWith(CHAPTER.id);
  });
});
