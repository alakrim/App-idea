import { fireEvent, screen } from '@testing-library/react-native';

import { renderThemed } from '@/__tests__/helpers/render-themed';
import type { AmbienceCue } from '@/core/domain';
import { chapterRow, id, seriesRow } from '@/db/__fixtures__/factories';

import { ChapterView, type ChapterViewProps } from './chapter-view';

import type { ReadingParagraph } from './chapter-data';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('../../__tests__/helpers/reanimated-stub'));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));

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

    expect(screen.getByText('Tavern crowd')).toBeOnTheScreen();
    expect(screen.getByText('Sentences 1–2')).toBeOnTheScreen();

    await fireEvent(
      screen.getByRole('switch', { name: 'Ambience: Tavern crowd' }),
      'valueChange',
      false,
    );

    expect(onToggleCue).toHaveBeenCalledWith(id(90), false);
  });

  it('enables Play only once the chapter is ready', async () => {
    await renderThemed(
      <ChapterView {...props({ chapter: chapterRow(1, 1, 1, { status: 'processing' }) })} />,
    );

    expect(screen.getByRole('button', { name: 'Play chapter' })).toBeDisabled();
  });
});
