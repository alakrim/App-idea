import { act, fireEvent, screen } from '@testing-library/react-native';
import { ScrollView, StyleSheet } from 'react-native';

import { renderThemed } from '@/__tests__/helpers/render-themed';
import { chapterRow, seriesRow } from '@/db/__fixtures__/factories';

import { ChapterView, type ChapterViewProps } from './chapter-view';
import { HIGHLIGHT_MS } from './sentence-focus';

import type { ReadingParagraph } from './chapter-data';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('../../__tests__/helpers/reanimated-stub'));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));

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
    onToggleCue: jest.fn(),
    ...overrides,
  };
}

/** Lays out the scroll content the way the device does: the text section, then paragraph 1 inside it. */
async function layOutText() {
  await fireEvent(screen.getByTestId('chapter-text-section'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 400, width: 350, height: 900 } },
  });
  await fireEvent(screen.getByTestId('chapter-reading-text'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 60, width: 350, height: 800 } },
  });
  await fireEvent(screen.getByTestId('paragraph-1'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 120, width: 350, height: 90 } },
  });
}

describe('ChapterView deep link to a sentence', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('scrolls to the paragraph that holds the linked sentence, once the layout is known', async () => {
    await renderThemed(<ChapterView {...props({ focusSentence: 2 })} />);
    const scrollTo = screen.UNSAFE_getByType(ScrollView).instance.scrollTo as jest.Mock;

    expect(scrollTo).not.toHaveBeenCalled();
    await layOutText();

    // 400 (section) + 60 (text) + 120 (paragraph) - 24 (space.xl) = 556.
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ y: 556, animated: true });
  });

  it('does not scroll again when the chapter is re-read with a new array', async () => {
    const view = await renderThemed(<ChapterView {...props({ focusSentence: 2 })} />);
    const scrollTo = screen.UNSAFE_getByType(ScrollView).instance.scrollTo as jest.Mock;
    await layOutText();

    await view.rerender(<ChapterView {...props({ focusSentence: 2, paragraphs: [...PARAGRAPHS] })} />);
    await layOutText();

    expect(scrollTo).toHaveBeenCalledTimes(1);
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
