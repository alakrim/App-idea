/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories load the stub with require() */
import { fireEvent, screen } from '@testing-library/react-native';

import { renderThemed } from '@/__tests__/helpers/render-themed';
import type { AmbienceCue } from '@/core/domain';
import { chapterRow, id, seriesRow } from '@/db/__fixtures__/factories';

import { ChapterView, type ChapterViewProps } from './chapter-view';

import type { ReadingParagraph } from './chapter-data';

jest.mock('react-native-reanimated', () => require('../../__tests__/helpers/reanimated-stub'));
jest.mock('@/ui/icons', () => new Proxy({}, { get: () => () => null }));
// The stub renders a sheet's contents only while it is open, the way the real sheet does.
jest.mock('@gorhom/bottom-sheet', () =>
  require('@/__tests__/helpers/feature-mocks').bottomSheetStub(),
);

const PARAGRAPHS: ReadingParagraph[] = [
  {
    idx: 0,
    kind: 'text',
    sentences: [
      { idx: 0, text: 'The lighthouse was dark.', translated: 'Il faro era spento.' },
      { idx: 1, text: 'Nobody spoke of it.', translated: 'Nessuno ne parlava.' },
    ],
  },
];

const CUE: AmbienceCue = {
  id: id(90),
  chapterId: id(1),
  category: 'tavern_crowd',
  startSentence: 0,
  endSentence: 1,
  intensity: 'medium',
  fadeInMs: 1500,
  fadeOutMs: 2000,
  confidence: 0.9,
  reason: 'A busy room with glasses and talk.',
  enabled: true,
};

function props(overrides: Partial<ChapterViewProps> = {}): ChapterViewProps {
  return {
    chapter: chapterRow(1, 1, 1, {
      title: 'The Lamp',
      status: 'ready',
      durationMs: 600_000,
      sourceLang: 'en',
    }),
    series: seriesRow(1, { title: 'The Night Harbour' }),
    progress: null,
    failure: null,
    jobs: [],
    paragraphs: PARAGRAPHS,
    cues: [CUE],
    onBack: jest.fn(),
    onPlay: jest.fn(),
    onRetry: jest.fn(),
    onRetryNow: jest.fn(),
    onPrepare: jest.fn(),
    onStop: jest.fn(),
    onToggleCue: jest.fn(),
    ...overrides,
  };
}

describe('ChapterView reading modes', () => {
  it('reads the translation first, then shows both languages paired in Both mode', async () => {
    await renderThemed(<ChapterView {...props()} />);

    expect(screen.getByText('Il faro era spento. Nessuno ne parlava.')).toBeOnTheScreen();
    expect(screen.queryByText('The lighthouse was dark.')).toBeNull();

    await fireEvent.press(screen.getByRole('radio', { name: 'Both' }));

    expect(screen.getByText('Il faro era spento.')).toBeOnTheScreen();
    expect(screen.getByText('The lighthouse was dark.')).toBeOnTheScreen();
    expect(screen.getByText('Nessuno ne parlava.')).toBeOnTheScreen();
  });

  it('offers only the original text when nothing is translated yet', async () => {
    const untranslated = PARAGRAPHS.map((paragraph) => ({
      ...paragraph,
      sentences: paragraph.sentences.map((sentence) => ({ ...sentence, translated: null })),
    }));
    await renderThemed(<ChapterView {...props({ paragraphs: untranslated })} />);

    expect(screen.getByText('The lighthouse was dark. Nobody spoke of it.')).toBeOnTheScreen();
    expect(screen.queryByRole('radio', { name: 'Both' })).toBeNull();
  });
});

describe('ChapterView ambience cues', () => {
  it('shows each cue with its label, range and reason, and reports the switch', async () => {
    const onToggleCue = jest.fn();
    await renderThemed(<ChapterView {...props({ onToggleCue })} />);

    expect(screen.getByText('Tavern')).toBeOnTheScreen();
    expect(screen.getByText('Near the start')).toBeOnTheScreen();
    expect(screen.getByText(CUE.reason)).toBeOnTheScreen();

    await fireEvent(
      screen.getByRole('switch', { name: 'Ambience: Tavern, Near the start' }),
      'valueChange',
      false,
    );

    expect(onToggleCue).toHaveBeenCalledWith(id(90), false);
  });

  it('offers Listen now disabled, with the preparing line, until the first segment is saved', async () => {
    await renderThemed(
      <ChapterView {...props({ chapter: chapterRow(1, 1, 1, { status: 'processing' }) })} />,
    );

    expect(screen.getByRole('button', { name: 'Listen now' })).toBeDisabled();
    expect(screen.getByText('Preparing the first minutes…')).toBeOnTheScreen();
  });

  it('enables Listen now with the ready time and the time left once the first segment is saved', async () => {
    const progress = {
      chapterId: id(1),
      state: 'running' as const,
      stages: [
        {
          stage: 'narrate' as const,
          status: 'running' as const,
          progress: 0.2,
          since: null,
          passages: null,
        },
      ],
      overall: 0.5,
      playable: true,
      etaMs: 3 * 60_000,
      readySegments: 4,
      totalSegments: null,
      narratedMs: 12 * 60_000,
      estimatedTotalMs: 40 * 60_000,
      costUsdSoFar: 0,
      error: null,
      reconnecting: false,
    };
    const onPlay = jest.fn();
    await renderThemed(
      <ChapterView
        {...props({ chapter: chapterRow(1, 1, 1, { status: 'processing' }), progress, onPlay })}
      />,
    );

    const button = screen.getByRole('button', { name: 'Listen now' });
    expect(button).toBeEnabled();
    expect(screen.getByText('12 m ready · about 3 m left')).toBeOnTheScreen();
    await fireEvent.press(button);
    expect(onPlay).toHaveBeenCalledWith(id(1));
  });
});

describe('ChapterView preparing, stopping and failures', () => {
  const processing = chapterRow(1, 1, 1, { status: 'processing' });

  it('stops a chapter only after the listener confirms, and keeps the finished audio copy', async () => {
    const onStop = jest.fn();
    await renderThemed(<ChapterView {...props({ chapter: processing, onStop })} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Stop preparing' }));
    const confirm = screen.getByText('Stop preparing this chapter?');
    expect(confirm).toBeOnTheScreen();
    expect(
      screen.getByText('Finished audio is kept, and you can continue later.'),
    ).toBeOnTheScreen();
    expect(onStop).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Stop' }));
    expect(onStop).toHaveBeenCalledWith(processing.id);
  });

  it('does not stop when the listener cancels the confirmation', async () => {
    const onStop = jest.fn();
    await renderThemed(<ChapterView {...props({ chapter: processing, onStop })} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Stop preparing' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));

    expect(onStop).not.toHaveBeenCalled();
  });

  it('offers no Stop while the chapter is not being prepared', async () => {
    await renderThemed(<ChapterView {...props()} />);

    expect(screen.queryByRole('button', { name: 'Stop preparing' })).toBeNull();
  });

  it('prepares a draft chapter from its own action', async () => {
    const onPrepare = jest.fn();
    const draft = chapterRow(1, 1, 1, { status: 'draft' });
    await renderThemed(<ChapterView {...props({ chapter: draft, onPrepare })} />);

    expect(screen.getByText('Prepare the chapter first, then play it.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Prepare this chapter' }));

    expect(onPrepare).toHaveBeenCalledWith(draft.id);
  });

  it('shows Try again for every failure, and says what to change when a retry will not fix it', async () => {
    const onRetry = jest.fn();
    const failedChapter = chapterRow(1, 1, 1, { status: 'failed' });
    await renderThemed(
      <ChapterView
        {...props({
          chapter: failedChapter,
          onRetry,
          failure: {
            code: 'AUTH',
            message: 'OpenRouter rejected the key.',
            retryable: false,
          },
        })}
      />,
    );

    expect(
      screen.getByText(
        'OpenRouter rejected the key. Check your OpenRouter key in Settings, then try again.',
      ),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(onRetry).toHaveBeenCalledWith(failedChapter.id);
  });

  it('shows Try again for an unknown failure that the pipeline marks as not retryable', async () => {
    const failedChapter = chapterRow(1, 1, 1, { status: 'failed' });
    await renderThemed(
      <ChapterView
        {...props({
          chapter: failedChapter,
          failure: {
            code: 'UNKNOWN',
            message: 'Something went wrong. Try again.',
            retryable: false,
          },
        })}
      />,
    );

    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
  });
});
