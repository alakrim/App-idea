/*
 * QA-E proof, in the engine's ducking stage (P2-B). It asserts the behaviour the fix must reach, so
 * it FAILS on the unified code. Excluded from `npm test` by testPathIgnorePatterns in jest.config.js.
 * Run it with: npx jest --testPathIgnorePatterns=/node_modules/ lectio-engine.audit
 */
import { createLectioEngine } from './lectio-engine';

import type { AmbienceMixer } from './ambience-mixer';
import type { ChapterLoad } from './engine';
import type { VoicePort, VoiceSnapshot } from './voice-port';

const BASE_SNAPSHOT: VoiceSnapshot = {
  positionMs: 0,
  playing: false,
  buffering: false,
  ended: false,
  loaded: true,
  error: null,
};

function fakeVoice() {
  let emit: (snapshot: VoiceSnapshot) => void = () => undefined;
  const port: VoicePort = {
    load: jest.fn(() => Promise.resolve()),
    append: jest.fn(),
    play: jest.fn(),
    pause: jest.fn(),
    seekTo: jest.fn(() => Promise.resolve()),
    setRate: jest.fn(),
    setVolume: jest.fn(),
    onSnapshot(callback) {
      emit = callback;
      return () => undefined;
    },
    dispose: jest.fn(),
  };
  return {
    port,
    snapshot: (partial: Partial<VoiceSnapshot>) => emit({ ...BASE_SNAPSHOT, ...partial }),
  };
}

const CHAPTER: ChapterLoad = {
  id: 'chapter-1',
  order: 1,
  title: 'One',
  seriesTitle: 'Series',
  coverUri: null,
  segments: [
    {
      uri: 'file:///a.m4a',
      durationMs: 60_000,
      sentenceStart: 0,
      sentenceEnd: 0,
      sentenceOffsetsMs: [0],
    },
  ],
  final: false,
  cues: [],
};

describe('QA-E proof: buffering flaps and the ducking stage (P2-B)', () => {
  it('a buffering flap during playback does not release the ducking of the beds', async () => {
    const { port, snapshot } = fakeVoice();
    const mixer = {
      apply: jest.fn(),
      setMasterGain: jest.fn(),
      setDucking: jest.fn(),
      suspend: jest.fn(),
      dispose: jest.fn(),
    };
    const engine = createLectioEngine({
      voice: port,
      mixer: mixer as AmbienceMixer,
      remote: { subscribe: () => () => undefined },
    });
    await engine.load(CHAPTER, 0);
    snapshot({ playing: true });
    const whilePlaying = mixer.setDucking.mock.calls.at(-1)?.[0];

    // ExoPlayer reports buffering for a moment while the voice is still playing.
    snapshot({ playing: true, buffering: true });

    // Expected: the beds stay ducked. Today deriveState() maps buffering to a state where the
    // ducking releases (duckEnvelope voiceActive false), so the beds swell by the ducking depth
    // for the 550 ms release, then dip again on the next playing snapshot.
    expect(whilePlaying).toBeDefined();
    expect(mixer.setDucking.mock.calls.at(-1)?.[0]).toEqual(whilePlaying);
    engine.dispose();
  });
});
