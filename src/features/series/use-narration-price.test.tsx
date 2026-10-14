import { act, renderHook } from '@testing-library/react-native';

import type { CostEstimate, PipelineFacade } from '@/features/pipeline/facade';
import { PipelineContext } from '@/features/pipeline/facade';

import { useNarrationPrice, type NarrationTarget } from './use-narration-price';

import type { ReactNode } from 'react';

const TARGET: NarrationTarget = { wordCount: 4000, sourceLang: 'en', targetLang: null };

function estimateWith(lines: CostEstimate['lines']): CostEstimate {
  return { totalUsd: 0, lowUsd: 0, highUsd: 0, lines };
}

const priced = (usd: number) => ({ usd, basis: '4000 words', unknownReason: null });

function wrapperWith(estimate: jest.Mock): ({ children }: { children: ReactNode }) => ReactNode {
  // Only `estimate` is used by the hook, so the rest of the facade is left out on purpose.
  const facade = { estimate } as unknown as PipelineFacade;
  return function Wrapper({ children }: { children: ReactNode }) {
    return <PipelineContext.Provider value={facade}>{children}</PipelineContext.Provider>;
  };
}

describe('useNarrationPrice', () => {
  it('prices the narration of the chapter from its word count', async () => {
    const estimate = jest
      .fn()
      .mockResolvedValue(estimateWith([{ stage: 'narrate', ...priced(0.27) }]));
    const { result } = await renderHook(() => useNarrationPrice(TARGET), {
      wrapper: wrapperWith(estimate),
    });

    await act(async () => {});

    expect(result.current).toEqual({ kind: 'priced', usd: 0.27 });
    expect(estimate).toHaveBeenCalledWith(expect.objectContaining({ sourceLang: 'en' }));
  });

  it('says the price is unknown, not free, when the catalogue cannot price narration', async () => {
    const estimate = jest
      .fn()
      .mockResolvedValue(
        estimateWith([
          {
            stage: 'narrate',
            usd: null,
            basis: 'pricing unavailable for vendor/removed',
            unknownReason: 'pricing unavailable for vendor/removed',
          },
        ]),
      );
    const { result } = await renderHook(() => useNarrationPrice(TARGET), {
      wrapper: wrapperWith(estimate),
    });

    await act(async () => {});

    expect(result.current).toEqual({ kind: 'unknown' });
  });

  it('says the price is unknown when the estimate fails', async () => {
    const estimate = jest.fn().mockRejectedValue(new Error('offline'));
    const { result } = await renderHook(() => useNarrationPrice(TARGET), {
      wrapper: wrapperWith(estimate),
    });

    await act(async () => {});

    expect(result.current).toEqual({ kind: 'unknown' });
  });

  it('says unknown without asking the catalogue when the chapter has no word count', async () => {
    const estimate = jest.fn();
    const { result } = await renderHook(() => useNarrationPrice({ ...TARGET, wordCount: null }), {
      wrapper: wrapperWith(estimate),
    });

    expect(result.current).toEqual({ kind: 'unknown' });
    expect(estimate).not.toHaveBeenCalled();
  });

  it('is loading while no chapter is chosen', async () => {
    const estimate = jest.fn();
    const { result } = await renderHook(() => useNarrationPrice(null), {
      wrapper: wrapperWith(estimate),
    });

    expect(result.current).toEqual({ kind: 'loading' });
    expect(estimate).not.toHaveBeenCalled();
  });
});
