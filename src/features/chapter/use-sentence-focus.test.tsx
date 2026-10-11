import { act, renderHook } from '@testing-library/react-native';

import { HIGHLIGHT_MS } from './sentence-focus';
import { useSentenceFocus } from './use-sentence-focus';

describe('useSentenceFocus', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('highlights the target at full strength at once, then fades it out and clears it', async () => {
    const { result } = await renderHook(({ idx }: { idx: number | null }) => useSentenceFocus(idx, false), {
      initialProps: { idx: 3 },
    });
    expect(result.current).toEqual({ sentenceIdx: 3, strength: 1 });

    await act(async () => {
      jest.advanceTimersByTime(HIGHLIGHT_MS / 2);
    });
    expect(result.current?.strength).toBeCloseTo(0.5, 1);

    await act(async () => {
      jest.advanceTimersByTime(HIGHLIGHT_MS);
    });
    expect(result.current).toBeNull();
  });

  it('starts a new highlight when the target changes', async () => {
    const { result, rerender } = await renderHook(
      ({ idx }: { idx: number | null }) => useSentenceFocus(idx, false),
      { initialProps: { idx: 1 } },
    );
    await act(async () => {
      jest.advanceTimersByTime(HIGHLIGHT_MS / 2);
    });

    await act(async () => {
      rerender({ idx: 5 });
    });

    expect(result.current).toEqual({ sentenceIdx: 5, strength: 1 });
  });

  it('shows nothing without a target', async () => {
    const { result } = await renderHook(() => useSentenceFocus(null, false));
    expect(result.current).toBeNull();
  });

  it('holds the highlight at full strength under reduced motion', async () => {
    const { result } = await renderHook(() => useSentenceFocus(2, true));
    await act(async () => {
      jest.advanceTimersByTime(HIGHLIGHT_MS - 200);
    });
    expect(result.current).toEqual({ sentenceIdx: 2, strength: 1 });
  });
});
