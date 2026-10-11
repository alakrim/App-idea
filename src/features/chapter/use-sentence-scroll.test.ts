import { act, renderHook } from '@testing-library/react-native';

import { useSentenceScroll } from './use-sentence-scroll';

const PARAGRAPHS = [
  { idx: 0, sentences: [{ idx: 0 }] },
  { idx: 1, sentences: [{ idx: 1 }, { idx: 2 }] },
];

type Props = Parameters<typeof useSentenceScroll>[0];

async function setup(initial: Partial<Props> = {}) {
  const scrollTo = jest.fn();
  const hook = await renderHook((props: Props) => useSentenceScroll(props), {
    initialProps: { focusSentence: 2, paragraphs: PARAGRAPHS, reduced: false, scrollTo, ...initial },
  });
  return { ...hook, scrollTo };
}

/** Reports the three layouts the chapter view reports on the device. */
async function layOut(result: { current: ReturnType<typeof useSentenceScroll> }) {
  await act(async () => {
    result.current.onSectionLayout(400);
    result.current.onReadingLayout(60);
    result.current.onParagraphLayout(1, 120);
  });
}

describe('useSentenceScroll', () => {
  it('scrolls to the paragraph of the linked sentence once every position is known', async () => {
    const { result, scrollTo } = await setup();

    await act(async () => {
      result.current.onParagraphLayout(1, 120);
    });
    expect(scrollTo).not.toHaveBeenCalled();

    await layOut(result);

    // 400 + 60 + 120, less the xl gutter of 24, with animation on.
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith(556, true);
  });

  it('scrolls without animation under reduced motion', async () => {
    const { result, scrollTo } = await setup({ reduced: true });
    await layOut(result);
    expect(scrollTo).toHaveBeenCalledWith(556, false);
  });

  it('does not scroll again when the chapter is re-read with new paragraph arrays', async () => {
    const { result, rerender, scrollTo } = await setup();
    await layOut(result);

    await act(async () => {
      rerender({ focusSentence: 2, paragraphs: [...PARAGRAPHS], reduced: false, scrollTo });
    });
    await layOut(result);

    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it('scrolls again for a new link, and never for a link to a sentence that is not in the chapter', async () => {
    const { result, rerender, scrollTo } = await setup({ focusSentence: null });
    await layOut(result);
    expect(scrollTo).not.toHaveBeenCalled();

    await act(async () => {
      rerender({ focusSentence: 1, paragraphs: PARAGRAPHS, reduced: false, scrollTo });
    });
    expect(scrollTo).toHaveBeenCalledTimes(1);

    await act(async () => {
      rerender({ focusSentence: 99, paragraphs: PARAGRAPHS, reduced: false, scrollTo });
    });
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });
});
