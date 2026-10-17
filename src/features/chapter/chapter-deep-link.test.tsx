import { act, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { renderThemed } from '@/__tests__/helpers/render-themed';
import { chapterRow, seriesRow } from '@/db/__fixtures__/factories';

import { ChapterView, type ChapterViewProps } from './chapter-view';
import { HIGHLIGHT_MS } from './sentence-focus';

import type { ReadingParagraph } from './chapter-data';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('../../__tests__/helpers/reanimated-stub'));
jest.mock('@/ui/icons', () => new Proxy({}, { get: () => () => null }));

const PARAGRAPHS: ReadingParagraph[] = [
  {
    idx: 0,
    kind: 'text',
    sentences: [{ idx: 0, text: 'The lighthouse was dark.', translated: null }],
  },
  {
    idx: 1,
    kind: 'text',
    sentences: [
      { idx: 1, text: 'Nobody spoke of it.', translated: null },
      { idx: 2, text: 'The keeper had gone.', translated: null },
    ],
  },
];

function props(overrides: Partial<ChapterViewProps> = {}): ChapterViewProps {
  return {
    chapter: chapterRow(1, 1, 1, { title: 'The Lamp', status: 'ready', sourceLang: 'en' }),
    series: seriesRow(1, { title: 'The Night Harbour' }),
    progress: null,
    failure: null,
    jobs: [],
    paragraphs: PARAGRAPHS,
    cues: [],
    onBack: jest.fn(),
    onPlay: jest.fn(),
    onRetry: jest.fn(),
    onRetryNow: jest.fn(),
    onToggleCue: jest.fn(),
    ...overrides,
  };
}

describe('ChapterView deep link to a sentence', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('highlights the linked sentence, then lets the highlight go', async () => {
    await renderThemed(<ChapterView {...props({ focusSentence: 2 })} />);
    const background = () =>
      StyleSheet.flatten(screen.getByText('The keeper had gone.').props.style)?.backgroundColor;

    expect(background()).toBeDefined();
    await act(async () => {
      jest.advanceTimersByTime(HIGHLIGHT_MS + 100);
    });
    expect(background()).toBeUndefined();
  });
});
