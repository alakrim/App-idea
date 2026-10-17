import { pcmToWav } from '@/core/narration/formats';
import {
  FREE_NARRATOR_MODEL_ID,
  GEMINI_NARRATOR_MODEL_ID,
  KOKORO_MODEL_ID,
} from '@/core/narration/options';
import { estimateSpeechSeconds } from '@/core/text/speech-rate';

import { CHAPTER_ID, createFakePorts, mp3Bytes } from '../__fixtures__/fake-ports';
import { EN_PASSAGE_600, ZH_PASSAGE_600 } from '../__fixtures__/narration-passages';
import { longText } from '../__fixtures__/pages';
import { StageFailure } from '../errors';
import { runChapter } from '../runner';

import type { PipelineEvent } from '../context';
import type { TtsResult } from '../ports';

const PCM_MODEL = 'google/gemini-3.8-flash-lite-tts';

/** `seconds` of 24 kHz mono silence wrapped as the WAV the TTS adapter stores. */
function wavOf(seconds: number): Uint8Array {
  return pcmToWav(new Uint8Array(seconds * 24_000 * 2), { rate: 24_000, channels: 1 });
}

const CJK_TEXT = Array.from({ length: 6 }, () => '雨一直下着，街上没有人，灯火在水里摇晃。').join(
  '\n\n',
);

describe('narrate stage: WAV output from a PCM-only voice', () => {
  it('stores WAV segments with the exact duration read from the file header', async () => {
    const fake = createFakePorts({
      sourceText: 'The boats came in at dusk. Ada waited on the quay. The lamps were lit.',
      targetLang: null,
      tts: () => ({ bytes: wavOf(3), mime: 'audio/wav', costUsd: null }),
    });

    expect((await runChapter(CHAPTER_ID, fake.ports)).status).toBe('ready');

    const segments = fake.state.segments.get(CHAPTER_ID) ?? [];
    expect(segments.length).toBeGreaterThan(0);
    for (const segment of segments) {
      expect(segment.fileUri.endsWith('.wav')).toBe(true);
      expect(segment.durationMs).toBe(3_000);
    }
    expect(fake.state.written.every((entry) => entry.endsWith(`:${44 + 144_000}`))).toBe(true);
    expect(fake.chapter().durationMs).toBe(segments.length * 3_000);
  });

  it('records the header-measured seconds in the usage ledger', async () => {
    const fake = createFakePorts({
      sourceText: 'The boats came in at dusk. Ada waited on the quay. The lamps were lit.',
      targetLang: null,
      tts: () => ({ bytes: wavOf(2), mime: 'audio/wav', costUsd: null }),
    });

    await runChapter(CHAPTER_ID, fake.ports);

    const narrate = fake.state.ledger.filter((entry) => entry.stage === 'narrate');
    expect(narrate.length).toBeGreaterThan(0);
    for (const entry of narrate) expect(entry.audioSeconds).toBe(2);
  });

  it('times an unknown audio format by the script of its text, not a flat 15 characters a second', async () => {
    const fake = createFakePorts({
      sourceText: CJK_TEXT,
      targetLang: null,
      tts: () => ({
        bytes: new Uint8Array([1, 2, 3]),
        mime: 'application/octet-stream',
        costUsd: null,
      }),
    });

    await runChapter(CHAPTER_ID, fake.ports);

    const first = fake.state.ttsCalls[0];
    const segment = fake.state.segments.get(CHAPTER_ID)?.[0];
    expect(first).toBeDefined();
    expect(segment).toBeDefined();
    const expectedMs = Math.round(estimateSpeechSeconds(first?.text ?? '') * 1000);
    expect(segment?.durationMs).toBe(expectedMs);
    // A flat 15 characters a second would be several times too short for Mandarin.
    const flatMs = Math.round(([...(first?.text ?? '')].length / 15) * 1000);
    expect(segment?.durationMs ?? 0).toBeGreaterThan(flatMs * 2);
  });
});

describe('narrate stage: a chapter whose voice changes format', () => {
  it('regenerates every segment as WAV, and keeps no MP3 segment rows', async () => {
    const fake = createFakePorts({
      sourceText: CJK_TEXT,
      targetLang: null,
      tts: (_text, profile) =>
        profile.model === PCM_MODEL
          ? { bytes: wavOf(1), mime: 'audio/wav', costUsd: null }
          : { bytes: mp3Bytes(38), mime: 'audio/mpeg', costUsd: null },
    });

    await runChapter(CHAPTER_ID, fake.ports);
    const mp3Segments = fake.state.segments.get(CHAPTER_ID)?.length ?? 0;
    expect(mp3Segments).toBeGreaterThan(0);
    expect(fake.state.segments.get(CHAPTER_ID)?.every((s) => s.fileUri.endsWith('.mp3'))).toBe(
      true,
    );

    fake.state.narration = { ...fake.state.narration, model: PCM_MODEL, voice: 'Puck' };
    const before = fake.state.ttsCalls.length;
    expect((await runChapter(CHAPTER_ID, fake.ports)).status).toBe('ready');

    const segments = fake.state.segments.get(CHAPTER_ID) ?? [];
    expect(segments).toHaveLength(mp3Segments);
    expect(segments.every((s) => s.fileUri.endsWith('.wav'))).toBe(true);
    expect(segments.every((s) => s.durationMs === 1_000)).toBe(true);
    expect(fake.state.ttsCalls.slice(before).every((call) => call.voice === 'Puck')).toBe(true);
  });
});

describe('narrate stage: segment size per narrator', () => {
  /** One paragraph of about 1,240 characters, so the segment size alone decides the split. */
  const LONG_PARAGRAPH = Array.from(
    { length: 20 },
    (_, i) => `Sentence number ${i} keeps the story moving forward slowly.`,
  ).join(' ');

  it('splits at the default 600 characters for a narrator without a size of its own', async () => {
    const fake = createFakePorts({ sourceText: LONG_PARAGRAPH, targetLang: null });

    await runChapter(CHAPTER_ID, fake.ports);

    const texts = fake.state.ttsCalls.map((call) => call.text);
    expect(texts.length).toBeGreaterThan(1);
    for (const text of texts) expect(text.length).toBeLessThanOrEqual(600);
  });

  it('ramps the free narrator up to its 1,800-character segments, after a short first one', async () => {
    const fake = createFakePorts({
      sourceText: LONG_PARAGRAPH,
      targetLang: null,
      narration: { model: FREE_NARRATOR_MODEL_ID, voice: '' },
    });

    await runChapter(CHAPTER_ID, fake.ports);

    const [first, second, ...rest] = fake.state.ttsCalls.map((call) => call.text.length);
    expect(first).toBeLessThanOrEqual(200);
    expect(second).toBeGreaterThan(first ?? 0);
    expect(second).toBeLessThanOrEqual(400);
    expect(rest.length).toBeGreaterThan(0);
    for (const length of rest) expect(length).toBeLessThanOrEqual(1_800);
    expect(fake.state.ttsCalls.every((call) => call.voice === '')).toBe(true);
  });
});

describe('narrate stage: a narrator that cannot speak the chapter language', () => {
  const GERMAN = [
    'Der alte Mann ging mit seinem Hund durch den Wald, und die Sonne stand schon tief.',
    'Er dachte an die Zeit, als er noch jung war und nicht so viel über das Leben wusste.',
    'Dann hörte er ein Geräusch hinter den Bäumen und blieb stehen, weil er nicht allein war.',
  ].join(' ');

  it('fails before any paid request, with a message that names the language and the fix', async () => {
    const fake = createFakePorts({
      sourceText: GERMAN,
      targetLang: null,
      narration: { model: KOKORO_MODEL_ID, voice: 'af_heart' },
    });

    await runChapter(CHAPTER_ID, fake.ports);

    expect(fake.state.ttsCalls).toHaveLength(0);
    const job = fake.job('narrate');
    expect(job?.status).toBe('failed');
    expect(job?.error?.code).toBe('MODEL_UNAVAILABLE');
    expect(job?.error?.retryable).toBe(false);
    expect(job?.error?.message).toContain("can't read German");
    expect(job?.error?.message).toContain('Settings → Narration');
  });

  it('still narrates the same chapter with a multilingual narrator', async () => {
    const fake = createFakePorts({
      sourceText: GERMAN,
      targetLang: null,
      narration: { model: GEMINI_NARRATOR_MODEL_ID, voice: 'Kore' },
    });

    await runChapter(CHAPTER_ID, fake.ports);

    expect(fake.job('narrate')?.status).toBe('done');
    expect(fake.state.ttsCalls.length).toBeGreaterThan(0);
  });
});

const secondsOf = (text: string, lang: string): number => estimateSpeechSeconds(text, lang);

describe('narrate stage: passages sized by speech time', () => {
  it('splits the 600-character Mandarin passage into nine passages, the first at most 12 seconds', async () => {
    const fake = createFakePorts({ sourceText: ZH_PASSAGE_600, targetLang: null });
    fake.state.chapters.set(CHAPTER_ID, { ...fake.chapter(), sourceLang: 'zh' });

    await runChapter(CHAPTER_ID, fake.ports);

    // The opening ramp (ADR-0008) holds the second passage shorter than the paid cap, so one more passage.
    const texts = fake.state.ttsCalls.map((call) => call.text);
    expect(texts).toHaveLength(9);
    expect(secondsOf(texts[0] ?? '', 'zh')).toBeLessThanOrEqual(12);
    for (const text of texts.slice(1)) {
      expect(secondsOf(text, 'zh')).toBeLessThanOrEqual(40);
    }
  });

  it('splits the 600-character English passage into three passages, the first at most 12 seconds', async () => {
    const fake = createFakePorts({ sourceText: EN_PASSAGE_600, targetLang: null });
    fake.state.chapters.set(CHAPTER_ID, { ...fake.chapter(), sourceLang: 'en' });

    await runChapter(CHAPTER_ID, fake.ports);

    const texts = fake.state.ttsCalls.map((call) => call.text);
    expect(texts).toHaveLength(3);
    expect(secondsOf(texts[0] ?? '', 'en')).toBeLessThanOrEqual(12);
    for (const text of texts.slice(1)) {
      expect(secondsOf(text, 'en')).toBeLessThanOrEqual(40);
    }
  });
});

describe('narrate stage: split-and-join fallback for one stubborn passage', () => {
  const OPENING =
    'Alpha opens the old wooden door of the bookshop, and the whole street smells of wet stone and rain.';
  const SECOND = 'Bravo follows her inside to the counter.';
  const THIRD = 'Charlie hangs the wet coat by the stove.';
  const FOURTH = 'Delta lights the lamp that hangs above the table.';
  const TEXT = [OPENING, SECOND, THIRD, FOURTH].join(' ');
  const oneSecondWav = (): TtsResult => ({
    bytes: pcmToWav(new Uint8Array(24_000 * 2), { rate: 24_000, channels: 1 }),
    mime: 'audio/wav',
    costUsd: null,
  });

  it('joins the two halves of a failing passage into one saved passage, with the sum of their lengths', async () => {
    const fake = createFakePorts({
      sourceText: TEXT,
      targetLang: null,
      tts: (text) => {
        // Only the whole passage fails. Its halves, each without both names, succeed.
        if (text.includes('Bravo') && text.includes('Delta')) {
          throw new StageFailure('UNKNOWN', 'The narrator is busy.', {
            retryable: true,
            detail: 'HTTP 502',
          });
        }
        return oneSecondWav();
      },
    });
    fake.state.chapters.set(CHAPTER_ID, { ...fake.chapter(), sourceLang: 'en' });

    expect((await runChapter(CHAPTER_ID, fake.ports)).status).toBe('ready');

    const segments = fake.state.segments.get(CHAPTER_ID) ?? [];
    expect(segments.map((s) => [s.sentenceStart, s.sentenceEnd])).toEqual([
      [0, 0],
      [1, 3],
    ]);
    const joined = segments[1];
    expect(joined?.fileUri.endsWith('.wav')).toBe(true);
    expect(joined?.durationMs).toBe(2_000);
    // One header and two seconds of samples: 44 + 2 * 48,000 bytes.
    expect(fake.state.written.some((entry) => entry.endsWith(':96044'))).toBe(true);
    // The passage is split where its characters are nearest the middle: after the third sentence's
    // predecessor, so the first half holds Bravo and Charlie, and the second holds Delta.
    const halves = fake.state.ttsCalls.slice(-2);
    expect(halves[0]?.text).toBe(`${SECOND} ${THIRD}`);
    expect(halves[1]?.text).toBe(FOURTH);
    // The failed whole-passage request costs nothing, so only the three answered calls are recorded.
    const narrated = fake.state.ledger.filter((entry) => entry.stage === 'narrate');
    expect(narrated).toHaveLength(3);
  });

  it('keeps the original failure when a half fails too, and says which passage failed', async () => {
    const fake = createFakePorts({
      sourceText: TEXT,
      targetLang: null,
      tts: (text) => {
        if (text.includes('Bravo')) {
          throw new StageFailure('NETWORK', 'No connection.', {
            retryable: true,
            detail: 'timeout',
          });
        }
        return oneSecondWav();
      },
    });
    fake.state.chapters.set(CHAPTER_ID, { ...fake.chapter(), sourceLang: 'en' });

    await runChapter(CHAPTER_ID, fake.ports);

    const job = fake.job('narrate');
    expect(job?.status).toBe('failed');
    expect(job?.error).toEqual({
      code: 'NETWORK',
      message:
        "The narrator service didn't answer for passage 2 of 2. Your progress is saved. Tap Retry to continue.",
      retryable: true,
      detail: 'timeout',
    });
    expect(fake.chapter().status).toBe('failed');
  });

  it('keeps a non-retryable failure as it is, with no passage wording', async () => {
    const fake = createFakePorts({
      sourceText: TEXT,
      targetLang: null,
      tts: () => {
        throw new StageFailure('MODEL_UNAVAILABLE', 'This voice is gone.', {
          retryable: false,
          detail: 'voice removed',
        });
      },
    });
    fake.state.chapters.set(CHAPTER_ID, { ...fake.chapter(), sourceLang: 'en' });

    await runChapter(CHAPTER_ID, fake.ports);

    expect(fake.job('narrate')?.error).toEqual({
      code: 'MODEL_UNAVAILABLE',
      message: 'This voice is gone.',
      retryable: false,
      detail: 'voice removed',
    });
  });
});

const ALPHA_OPENING = Array.from(
  { length: 3 },
  () =>
    'Alpha opens the old wooden door of the bookshop, and the whole street smells of wet stone and rain.',
).join(' ');

describe('narrate stage: a retry resumes at the first missing passage', () => {
  it('synthesizes no passage that was saved, and finishes the rest', async () => {
    let failing = true;
    const fake = createFakePorts({
      // The opening passage is long enough to fill the first speech window, so Bravo starts a later one.
      sourceText: `${ALPHA_OPENING} Bravo follows her inside to the counter, and the lamps are lit.`,
      targetLang: null,
      tts: (text) => {
        if (failing && text.includes('Bravo')) {
          throw new StageFailure('NETWORK', 'No connection.', {
            retryable: true,
            detail: 'timeout',
          });
        }
        return { bytes: mp3Bytes(1), mime: 'audio/mpeg', costUsd: null };
      },
    });
    fake.state.chapters.set(CHAPTER_ID, { ...fake.chapter(), sourceLang: 'en' });

    expect((await runChapter(CHAPTER_ID, fake.ports)).status).toBe('failed');
    const saved = fake.state.segments.get(CHAPTER_ID)?.map((s) => s.idx) ?? [];
    expect(saved[0]).toBe(0);
    expect(saved).toEqual([...saved].sort((a, b) => a - b));

    failing = false;
    const before = fake.state.ttsCalls.length;
    expect((await runChapter(CHAPTER_ID, fake.ports)).status).toBe('ready');

    const retried = fake.state.ttsCalls.slice(before).map((call) => call.text);
    const total = fake.state.segments.get(CHAPTER_ID)?.length ?? 0;
    expect(retried.every((text) => text.includes('Bravo'))).toBe(true);
    expect(retried).toHaveLength(total - saved.length);
  });
});

describe('narrate stage: parallel passages, saved in order', () => {
  it('saves and announces the passages in order, even when a later one is ready first', async () => {
    let call = 0;
    const events: PipelineEvent[] = [];
    const fake = createFakePorts({
      sourceText: ZH_PASSAGE_600,
      targetLang: null,
      tts: () => {
        call += 1;
        // The first request is the slowest, so the later ones are ready before it.
        const delay = call === 1 ? 40 : 2;
        return new Promise<TtsResult>((resolve) =>
          setTimeout(
            () => resolve({ bytes: mp3Bytes(1), mime: 'audio/mpeg', costUsd: null }),
            delay,
          ),
        );
      },
    });
    fake.state.chapters.set(CHAPTER_ID, { ...fake.chapter(), sourceLang: 'zh' });

    await runChapter(CHAPTER_ID, fake.ports, { onEvent: (event) => events.push(event) });

    const ready = events.flatMap((event) =>
      event.type === 'segmentReady' ? [event.segment.idx] : [],
    );
    expect(ready).toEqual([...ready].sort((a, b) => a - b));
    expect(ready).toHaveLength(9);
  });

  it('keeps three passages in flight for the Best narrator, and one for the Free narrator', async () => {
    const measure = async (model: string, sourceText: string): Promise<number> => {
      let inFlight = 0;
      let maxInFlight = 0;
      const fake = createFakePorts({
        sourceText,
        targetLang: null,
        narration: { model, voice: model === FREE_NARRATOR_MODEL_ID ? '' : 'Kore' },
        tts: () => {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          return new Promise<TtsResult>((resolve) =>
            setTimeout(() => {
              inFlight -= 1;
              resolve({ bytes: mp3Bytes(1), mime: 'audio/mpeg', costUsd: null });
            }, 5),
          );
        },
      });
      fake.state.chapters.set(CHAPTER_ID, { ...fake.chapter(), sourceLang: 'zh' });
      await runChapter(CHAPTER_ID, fake.ports);
      expect(fake.state.ttsCalls.length).toBeGreaterThanOrEqual(3);
      return maxInFlight;
    };

    // The window starts at three and grows to the narrator's ceiling of six while requests succeed.
    const best = await measure(GEMINI_NARRATOR_MODEL_ID, ZH_PASSAGE_600);
    expect(best).toBeGreaterThanOrEqual(3);
    expect(best).toBeLessThanOrEqual(6);
    expect(await measure(FREE_NARRATOR_MODEL_ID, ZH_PASSAGE_600)).toBe(1);
  });
});

describe('narrate stage: passage counts for the progress line', () => {
  it('counts each passage as it is saved, in order, and ends at the total', async () => {
    const fake = createFakePorts({ sourceText: longText(12, 250), targetLang: 'en' });
    const events: PipelineEvent[] = [];

    await runChapter(CHAPTER_ID, fake.ports, { onEvent: (event) => events.push(event) });

    const total = fake.state.segments.get(CHAPTER_ID)?.length ?? 0;
    const counts = events.flatMap((e) =>
      e.type === 'progress' && e.stage === 'narrate' && e.passages !== undefined
        ? [e.passages]
        : [],
    );
    expect(total).toBeGreaterThan(1);
    // A count is shown once the chapter's total is known, so the first one may come after passage 1.
    expect(counts.length).toBeGreaterThan(0);
    expect(counts.every((c) => c.total === total)).toBe(true);
    expect(counts.map((c) => c.done)).toEqual([...counts.map((c) => c.done)].sort((a, b) => a - b));
    expect(counts.at(-1)).toEqual({ done: total, total });
  });

  it('starts a resumed run at the passages already saved', async () => {
    const controller = new AbortController();
    let abortOnce = true;
    const fake = createFakePorts({
      sourceText: longText(12, 250),
      targetLang: 'en',
      tts: () => {
        if (abortOnce) {
          abortOnce = false;
          controller.abort();
        }
        return { bytes: mp3Bytes(1), mime: 'audio/mpeg', costUsd: null };
      },
    });
    await runChapter(CHAPTER_ID, fake.ports, { signal: controller.signal });
    const saved = fake.state.segments.get(CHAPTER_ID)?.length ?? 0;
    const events: PipelineEvent[] = [];

    await runChapter(CHAPTER_ID, fake.ports, { onEvent: (event) => events.push(event) });

    const counts = events.flatMap((e) =>
      e.type === 'progress' && e.stage === 'narrate' && e.passages !== undefined
        ? [e.passages.done]
        : [],
    );
    // The passages saved before the cancel are counted at once, and the rest follow them.
    expect(counts[0]).toBe(saved);
  });
});
