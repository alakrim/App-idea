/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories load the stand-ins with require() */
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeProvider } from '@/ui/theme';
import { palette } from '@/ui/tokens';

import { sentences } from './__fixtures__/playback-fixtures';
import { SyncedTextPane, type SyncedTextPaneProps } from './synced-text-pane';

jest.mock('react-native-reanimated', () => require('../../__tests__/helpers/reanimated-stub'));
jest.mock('react-native-gesture-handler', () => require('./__fixtures__/gesture-stub'));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));

const PARAGRAPHS = [
  { idx: 0, sentenceStart: 0, sentenceEnd: 2, kind: 'text' as const },
  { idx: 1, sentenceStart: 2, sentenceEnd: 4, kind: 'quote' as const },
];

async function renderPane(overrides: Partial<SyncedTextPaneProps> = {}) {
  const props: SyncedTextPaneProps = {
    paragraphs: PARAGRAPHS,
    sentences: sentences(1, 4),
    availableCount: 3,
    currentIdx: 1,
    loopIdx: null,
    openHeight: 700,
    peekHeight: 120,
    onSeekSentence: jest.fn(),
    onLongPressSentence: jest.fn(),
    ...overrides,
  };
  await render(
    <ThemeProvider initialMode="dark">
      <SyncedTextPane {...props} />
    </ThemeProvider>,
  );
  return props;
}

async function openPane() {
  const [toggle] = screen.getAllByRole('button', { name: 'Open text' });
  await fireEvent.press(toggle as NonNullable<typeof toggle>);
}

describe('SyncedTextPane', () => {
  it('shows the sentence being read when it is closed', async () => {
    await renderPane();

    expect(screen.getByText('Sentence 1 of chapter 1.')).toBeOnTheScreen();
  });

  it('highlights the current sentence with the accent-soft token and no other', async () => {
    await renderPane();
    await openPane();

    expect(screen.getByText('Sentence 1 of chapter 1.')).toHaveStyle({
      backgroundColor: palette.dark.accentSoft,
    });
    expect(screen.getByText('Sentence 2 of chapter 1.')).not.toHaveStyle({
      backgroundColor: palette.dark.accentSoft,
    });
  });

  it('seeks to a tapped sentence, and not to one the audio has not reached', async () => {
    const props = await renderPane();
    await openPane();

    await fireEvent.press(screen.getByText('Sentence 2 of chapter 1.'));
    expect(props.onSeekSentence).toHaveBeenCalledWith(2);

    await fireEvent.press(screen.getByText('Sentence 3 of chapter 1.'));
    expect(props.onSeekSentence).not.toHaveBeenCalledWith(3);
  });

  it('reports a held sentence for the sentence actions', async () => {
    const props = await renderPane();
    await openPane();

    await fireEvent(screen.getByText('Sentence 2 of chapter 1.'), 'longPress');

    expect(props.onLongPressSentence).toHaveBeenCalledWith(2);
  });

  it('marks a repeated sentence as underlined', async () => {
    await renderPane({ loopIdx: 2 });
    await openPane();

    expect(screen.getByText('Sentence 2 of chapter 1.')).toHaveStyle({
      textDecorationLine: 'underline',
    });
  });

  it('shows the original under each translation when bilingual is on', async () => {
    const translated = sentences(1, 4).map((sentence, index) =>
      index === 1 ? { ...sentence, translated: 'Deuxieme phrase.' } : sentence,
    );
    await renderPane({ sentences: translated });
    await openPane();

    await fireEvent.press(screen.getByRole('switch', { name: 'Bilingual text' }));

    expect(screen.getByText('Deuxieme phrase.')).toBeOnTheScreen();
    expect(screen.getByText('Sentence 1 of chapter 1.')).toBeOnTheScreen();
  });
});
