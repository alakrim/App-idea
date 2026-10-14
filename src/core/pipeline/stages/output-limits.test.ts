import { runAnalysisCall } from '../../analysis/analysis-call';
import { ANALYSIS_MAX_OUTPUT_TOKENS } from '../../analysis/limits';
import { translateChapter, TRANSLATE_MAX_OUTPUT_TOKENS } from '../../translate/translate-chapter';

import type { LlmRequest } from '../../llm/transport';

/** A transport that records each request and then fails, so no reply is needed. */
function recorder() {
  const requests: LlmRequest[] = [];
  const llm = async (request: LlmRequest): Promise<never> => {
    requests.push(request);
    throw new Error('stop after recording');
  };
  return { requests, llm };
}

describe('paid chat calls carry an output cap', () => {
  it('caps each translation request at twice the chunk size', async () => {
    const { requests, llm } = recorder();

    await expect(
      translateChapter({
        sentences: [{ idx: 0, text: 'Hello there.' }],
        sourceLang: 'en',
        targetLang: 'it',
        glossary: [],
        llm,
        concurrency: 1,
        signal: new AbortController().signal,
        onProgress: () => undefined,
      }),
    ).rejects.toThrow('stop after recording');

    expect(requests[0]?.maxOutputTokens).toBe(TRANSLATE_MAX_OUTPUT_TOKENS);
    expect(TRANSLATE_MAX_OUTPUT_TOKENS).toBe(3000);
  });

  it('caps each analysis request, the repair included, at twice the expected output', async () => {
    const { requests, llm } = recorder();

    await expect(
      runAnalysisCall(llm, { system: 'system', user: 'user' }, new AbortController().signal),
    ).rejects.toThrow('stop after recording');

    expect(requests[0]?.maxOutputTokens).toBe(ANALYSIS_MAX_OUTPUT_TOKENS);
    expect(ANALYSIS_MAX_OUTPUT_TOKENS).toBe(1800);
  });
});
