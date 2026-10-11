import { pcmToWav } from '@/core/narration/formats';
import { estimateSpeechSeconds } from '@/core/text/speech-rate';

import { CHAPTER_ID, createFakePorts, mp3Bytes } from '../__fixtures__/fake-ports';
import { runChapter } from '../runner';

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
    // A flat 15 characters a second would give about a third of the Mandarin duration.
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
