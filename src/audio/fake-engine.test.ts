import type { AmbienceCue } from '@/core/domain/analysis';

import { createFakeEngine } from './fake-engine';

import type { ChapterLoad, LoadedSegment } from './engine';

const CUE = (id: string, start: number, end: number, category: string): AmbienceCue => ({
  id,
  chapterId: '01HZX00000000000000000000A',
  category,
  startSentence: start,
  endSentence: end,
  intensity: 'medium',
  fadeInMs: 2500,
  fadeOutMs: 3000,
  confidence: 0.9,
  reason: 'test',
  enabled: true,
});

/** Four sentences over 10 s, and two cues: rain over sentences 0-1, city over 2-3. */
const SEGMENTS: LoadedSegment[] = [
  { uri: 'a', durationMs: 4000, sentenceStart: 0, sentenceEnd: 1, sentenceOffsetsMs: [0, 2000] },
  { uri: 'b', durationMs: 6000, sentenceStart: 2, sentenceEnd: 3, sentenceOffsetsMs: [0, 3000] },
];

const CHAPTER: ChapterLoad = {
  id: '01HZX00000000000000000000B',
  order: 1,
  title: 'One',
  seriesTitle: 'Series',
  coverUri: null,
  segments: SEGMENTS,
  final: true,
  cues: [CUE('cue-rain', 0, 1, 'light_rain'), CUE('cue-city', 2, 3, 'city_night')],
};

describe('fake engine', () => {
  it('moves only when the virtual clock is advanced', async () => {
    const engine = createFakeEngine();
    await engine.load(CHAPTER, 0);
    engine.play();
    expect(engine.ambienceCommands.length).toBeGreaterThan(0);
    const positions: number[] = [];
    engine.onPosition((u) => positions.push(u.positionMs));
    engine.advance(1000);
    expect(positions.at(-1)).toBe(1000);
  });

  it('swaps beds at sentence boundaries and never leaves one sounding by mistake', async () => {
    const engine = createFakeEngine();
    await engine.load(CHAPTER, 0);
    engine.play();
    expect(engine.soundingBedIds()).toEqual(['cue-rain']);

    engine.advance(4250);
    expect(engine.soundingBedIds()).toEqual(['cue-city']);
    engine.dispose();
  });

  it('applies the correct beds after a seek across cue boundaries', async () => {
    const engine = createFakeEngine();
    await engine.load(CHAPTER, 0);
    engine.seekTo(6000);
    expect(engine.soundingBedIds()).toEqual(['cue-city']);
    engine.seekTo(500);
    expect(engine.soundingBedIds()).toEqual(['cue-rain']);
    engine.dispose();
  });

  it('ducks the beds while the voice plays and releases when it pauses', async () => {
    const engine = createFakeEngine();
    await engine.load(CHAPTER, 0);
    engine.play();
    engine.advance(250);
    engine.pause();
    expect(engine.duckRamps.at(-2)).toEqual({ gainDb: -7, rampMs: 30 });
    expect(engine.duckRamps.at(-1)).toEqual({ gainDb: 0, rampMs: 550 });
    engine.dispose();
  });

  it('reports buffering at the end of a progressive chapter, then ends when the rest arrives', async () => {
    const engine = createFakeEngine();
    const states: string[] = [];
    engine.onState((s) => states.push(s));
    await engine.load({ ...CHAPTER, segments: SEGMENTS.slice(0, 1), final: false }, 0);
    engine.play();
    engine.advance(5000);
    expect(states.at(-1)).toBe('buffering');

    engine.appendSegments([SEGMENTS[1] as LoadedSegment], true);
    expect(engine.soundingBedIds()).toEqual(['cue-city']);
    engine.advance(10_000);
    expect(states.at(-1)).toBe('ended');
    engine.dispose();
  });

  it('plays a remote seek through the same path as the engine seek', async () => {
    const engine = createFakeEngine();
    const positions: number[] = [];
    engine.onPosition((u) => positions.push(u.positionMs));
    await engine.load(CHAPTER, 0);
    engine.emitRemote({ name: 'seekTo', positionMs: 7000 });
    expect(positions.at(-1)).toBe(7000);
    engine.dispose();
  });
});
