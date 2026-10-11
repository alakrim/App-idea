import { fireEvent, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { renderThemed } from '@/__tests__/helpers/render-themed';

import { ReadingText } from './reading-text';

import type { ReadingParagraph } from './chapter-data';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('../../__tests__/helpers/reanimated-stub'));
jest.mock('@/ui/icons', () => new Proxy({}, { get: () => () => null }));

const PARAGRAPHS: ReadingParagraph[] = [
  {
    idx: 0,
    kind: 'text',
    sentences: [
      { idx: 0, text: 'The lighthouse was dark.', translated: 'Il faro era spento.' },
      { idx: 1, text: 'Nobody spoke of it.', translated: 'Nessuno ne parlava.' },
    ],
  },
  {
    idx: 1,
    kind: 'text',
    sentences: [{ idx: 2, text: 'The keeper had gone.', translated: 'Il guardiano era andato.' }],
  },
];

function backgroundOf(text: string): string | undefined {
  const flattened = StyleSheet.flatten(screen.getByText(text).props.style);
  return flattened?.backgroundColor as string | undefined;
}

describe('ReadingText highlight', () => {
  it('highlights only the target sentence, in the translation view', async () => {
    await renderThemed(
      <ReadingText
        paragraphs={PARAGRAPHS}
        mode="translation"
        sourceLang="en"
        highlight={{ sentenceIdx: 1, strength: 1 }}
      />,
    );

    expect(backgroundOf('Nessuno ne parlava.')).toBe('rgba(232,168,74,0.140)');
    expect(backgroundOf('Il faro era spento.')).toBeUndefined();
  });

  it('fades the highlight with its strength, so it can end at zero', async () => {
    await renderThemed(
      <ReadingText
        paragraphs={PARAGRAPHS}
        mode="original"
        sourceLang="en"
        highlight={{ sentenceIdx: 2, strength: 0.5 }}
      />,
    );

    expect(backgroundOf('The keeper had gone.')).toBe('rgba(232,168,74,0.070)');
  });

  it('highlights the paired sentence in the bilingual view', async () => {
    await renderThemed(
      <ReadingText
        paragraphs={PARAGRAPHS}
        mode="both"
        sourceLang="en"
        highlight={{ sentenceIdx: 0, strength: 1 }}
      />,
    );

    const pair = screen.getByLabelText('Il faro era spento.. Original: The lighthouse was dark.');
    expect(StyleSheet.flatten(pair.props.style)).toMatchObject({
      backgroundColor: 'rgba(232,168,74,0.140)',
    });
  });

  it('reports where each paragraph starts, so the chapter can scroll to it', async () => {
    const onParagraphLayout = jest.fn();
    await renderThemed(
      <ReadingText
        paragraphs={PARAGRAPHS}
        mode="translation"
        sourceLang="en"
        onParagraphLayout={onParagraphLayout}
      />,
    );

    await fireEvent(screen.getByTestId('paragraph-0'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 40 } },
    });
    await fireEvent(screen.getByTestId('paragraph-1'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 96, width: 300, height: 40 } },
    });

    expect(onParagraphLayout).toHaveBeenCalledWith(0, 0);
    expect(onParagraphLayout).toHaveBeenCalledWith(1, 96);
  });
});
