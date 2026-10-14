import { mp3Bytes, createFakePorts, CHAPTER_ID } from '../__fixtures__/fake-ports';
import { StageFailure } from '../errors';
import { runChapter } from '../runner';

import type { TtsResult } from '../ports';

/**
 * Enough speech for several passages, so the ordering and the resume rules are really exercised.
 * The first sentence carries the marker that the tests use to pick out passage 0.
 */
const SENTENCES = Array.from(
  { length: 14 },
  (_, index) =>
    `Sentence ${index} tells a short story about the harbour, the lamps and the wet stone of the street.`,
);
const TEXT = SENTENCES.join(' ');
const FIRST_PASSAGE = 'Sentence 0 tells';

const mp3 = (): TtsResult => ({
  bytes: mp3Bytes(1),
  mime: 'audio/mpeg',
  costUsd: null,
  generationId: null,
});

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('narrate stage: finished passages are kept when a run stops', () => {
  it('saves passages 1 to 3 after passage 0 fails, and a retry synthesizes only passage 0', async () => {
    let failing = true;
    const fake = createFakePorts({
      sourceText: TEXT,
      targetLang: null,
      tts: async (text) => {
        if (text.includes(FIRST_PASSAGE)) {
          // Passage 0 is the slow one, so the others finish first, as in the QA repro.
          await pause(30);
          if (failing) {
            throw new StageFailure('INPUT_TOO_LONG', 'Passage 0 is too long.', {
              retryable: false,
              detail: 'repro',
            });
          }
        }
        return mp3();
      },
    });
    fake.state.chapters.set(CHAPTER_ID, { ...fake.chapter(), sourceLang: 'en' });

    expect((await runChapter(CHAPTER_ID, fake.ports)).status).toBe('failed');
    const saved = (fake.state.segments.get(CHAPTER_ID) ?? []).map((s) => s.idx);
    expect(saved).not.toContain(0);
    expect(saved).toEqual(expect.arrayContaining([1, 2, 3]));

    failing = false;
    const before = fake.state.ttsCalls.length;
    expect((await runChapter(CHAPTER_ID, fake.ports)).status).toBe('ready');

    const retried = fake.state.ttsCalls.slice(before).map((call) => call.text);
    expect(retried).toHaveLength(1);
    expect(retried[0]).toContain(FIRST_PASSAGE);
    const total = fake.state.segments.get(CHAPTER_ID)?.length ?? 0;
    expect(total).toBeGreaterThanOrEqual(4);
    expect(saved).toHaveLength(total - 1);
  });

  it('keeps the passages that finished before a cancel, and starts no more', async () => {
    const controller = new AbortController();
    const fake = createFakePorts({
      sourceText: TEXT,
      targetLang: null,
      tts: async (text) => {
        if (text.includes(FIRST_PASSAGE)) {
          // Cancelled while passage 0 is in flight: the passages after it are never started.
          controller.abort();
          await pause(30);
        }
        return mp3();
      },
    });
    fake.state.chapters.set(CHAPTER_ID, { ...fake.chapter(), sourceLang: 'en' });

    const outcome = await runChapter(CHAPTER_ID, fake.ports, { signal: controller.signal });

    expect(outcome.status).toBe('cancelled');
    const saved = (fake.state.segments.get(CHAPTER_ID) ?? []).map((s) => s.idx);
    expect(saved).toContain(0);
    expect(fake.state.ttsCalls.length).toBeLessThan(4);
  });
});

describe('narrate stage: renarration keeps the chapter playable', () => {
  it('leaves the saved passages in place while a renarration is still running', async () => {
    let renarrate = false;
    const fake = createFakePorts({
      sourceText: TEXT,
      targetLang: null,
      tts: async () => {
        if (renarrate) throw new StageFailure('NETWORK', 'Offline.', { retryable: true });
        return mp3();
      },
    });
    fake.state.chapters.set(CHAPTER_ID, { ...fake.chapter(), sourceLang: 'en' });
    expect((await runChapter(CHAPTER_ID, fake.ports)).status).toBe('ready');
    const saved = fake.state.segments.get(CHAPTER_ID)?.length ?? 0;
    expect(saved).toBeGreaterThanOrEqual(4);

    // A new voice makes every passage stale. The run fails at once, so none is replaced.
    renarrate = true;
    fake.state.narration = { ...fake.state.narration, voice: 'another-voice' };
    expect((await runChapter(CHAPTER_ID, fake.ports, { from: 'narrate', force: true })).status).toBe(
      'failed',
    );

    expect(fake.state.segments.get(CHAPTER_ID)).toHaveLength(saved);
  });
});

describe('narrate stage: low storage', () => {
  it('stops before any paid call when the device cannot hold the audio plus 200 MB', async () => {
    const fake = createFakePorts({ sourceText: TEXT, targetLang: null, freeBytes: 1024 });
    fake.state.chapters.set(CHAPTER_ID, { ...fake.chapter(), sourceLang: 'en' });

    expect((await runChapter(CHAPTER_ID, fake.ports)).status).toBe('failed');

    expect(fake.state.ttsCalls).toHaveLength(0);
    expect(fake.job('narrate')?.error).toMatchObject({
      code: 'STORAGE_FULL',
      retryable: true,
      message: 'Your phone is out of storage. Free up some space, then tap Try again.',
    });
  });

  it('maps a write that runs out of space to STORAGE_FULL, not a generic failure', async () => {
    const fake = createFakePorts({ sourceText: TEXT, targetLang: null });
    fake.state.chapters.set(CHAPTER_ID, { ...fake.chapter(), sourceLang: 'en' });
    fake.ports.audio.write = async () => {
      throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
    };

    expect((await runChapter(CHAPTER_ID, fake.ports)).status).toBe('failed');

    expect(fake.job('narrate')?.error).toMatchObject({ code: 'STORAGE_FULL', retryable: true });
  });
});

describe('narrate stage: a translated chapter is only read in its target language', () => {
  /** A chapter translated into Italian, so each sentence has a stored translation to tamper with. */
  async function translatedChapter() {
    const fake = createFakePorts({ sourceText: TEXT, targetLang: 'it' });
    fake.state.chapters.set(CHAPTER_ID, { ...fake.chapter(), sourceLang: 'en' });
    expect((await runChapter(CHAPTER_ID, fake.ports)).status).toBe('ready');
    fake.state.ttsCalls.length = 0;
    return fake;
  }

  it('narrates the target-language translation of every sentence', async () => {
    const fake = createFakePorts({ sourceText: TEXT, targetLang: 'it' });
    fake.state.chapters.set(CHAPTER_ID, { ...fake.chapter(), sourceLang: 'en' });

    expect((await runChapter(CHAPTER_ID, fake.ports)).status).toBe('ready');

    const stored = fake.state.sentences.get(CHAPTER_ID) ?? [];
    expect(stored.every((s) => s.translatedLang === 'it')).toBe(true);
    expect(fake.state.ttsCalls.every((call) => call.text.startsWith('EN '))).toBe(true);
  });

  it('never reads a sentence whose translation is in another language', async () => {
    const fake = await translatedChapter();
    fake.state.sentences.set(
      CHAPTER_ID,
      (fake.state.sentences.get(CHAPTER_ID) ?? []).map((s) => ({
        ...s,
        translatedLang: 'de',
      })),
    );

    const outcome = await runChapter(CHAPTER_ID, fake.ports, { from: 'narrate', force: true });

    expect(outcome.status).toBe('failed');
    expect(fake.state.ttsCalls).toHaveLength(0);
    expect(fake.job('narrate')?.error).toMatchObject({ code: 'UNKNOWN', retryable: false });
    expect(fake.job('narrate')?.error?.message).toContain('Italian translation');
  });

  it('stops, rather than reading the source, when a sentence has no translation', async () => {
    const fake = await translatedChapter();
    fake.state.sentences.set(
      CHAPTER_ID,
      (fake.state.sentences.get(CHAPTER_ID) ?? []).map((s, index) =>
        index === 0 ? { ...s, translated: null, translatedLang: null } : s,
      ),
    );

    const outcome = await runChapter(CHAPTER_ID, fake.ports, { from: 'narrate', force: true });

    expect(outcome.status).toBe('failed');
    expect(fake.state.ttsCalls).toHaveLength(0);
    expect(fake.job('narrate')?.error?.message).toContain('Translate the chapter again');
  });
});
