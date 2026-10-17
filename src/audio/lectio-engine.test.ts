import type { AmbienceCue } from '@/core/domain/analysis';
import { bedGainDb } from '@/core/playback/ambience-scheduler';
import type { RemoteEvent } from '@/core/playback/remote-commands';
import { createVirtualTimers, type VirtualTimers } from '@/core/playback/timers';

import {
  BED_FADE_OUT_MS,
  BED_STOP_DELAY_MS,
  BED_SUSPEND_DELAY_MS,
  BUFFER_DUCK_HOLD_MS,
  type LectioEngineDeps,
  type PlatformEventSource,
  createLectioEngine,
} from './lectio-engine';

import type { AmbienceMixer } from './ambience-mixer';
import type {
  AmbienceMix,
  ChapterLoad,
  LoadedSegment,
  PlaybackState,
  PositionUpdate,
} from './engine';
import type { VoicePort, VoiceSnapshot } from './voice-port';

/** 26-character ULID-shaped ids for fixtures. */
const ID = (n: number) => `01HZX${String(n).padStart(21, '0')}`;

const SEGMENTS: LoadedSegment[] = [
  {
    uri: 'file:///a.m4a',
    durationMs: 4000,
    sentenceStart: 0,
    sentenceEnd: 1,
    sentenceOffsetsMs: [0, 2000],
  },
  {
    uri: 'file:///b.m4a',
    durationMs: 6000,
    sentenceStart: 2,
    sentenceEnd: 3,
    sentenceOffsetsMs: [0, 3000],
  },
];

const RAIN: AmbienceCue = {
  id: ID(1),
  chapterId: ID(9),
  category: 'light_rain',
  startSentence: 0,
  endSentence: 1,
  intensity: 'medium',
  fadeInMs: 2500,
  fadeOutMs: 3000,
  confidence: 0.9,
  reason: 'rain on the roof',
  enabled: true,
};

const MIX: AmbienceMix = { enabled: true, levelDb: -22, duckingDb: 7 };

function chapter(overrides: Partial<ChapterLoad> = {}): ChapterLoad {
  return {
    id: ID(9),
    order: 1,
    title: 'Chapter one',
    seriesTitle: 'Series',
    coverUri: null,
    segments: SEGMENTS,
    final: true,
    cues: [RAIN],
    ...overrides,
  };
}

const IDLE_SNAPSHOT: VoiceSnapshot = {
  positionMs: 0,
  playing: false,
  buffering: false,
  ended: false,
  loaded: true,
  error: null,
};

function createMockVoice() {
  let listener: ((snapshot: VoiceSnapshot) => void) | null = null;
  const voice = {
    load: jest.fn((_segments: unknown, _startMs: number, _metadata: unknown) => Promise.resolve()),
    append: jest.fn(),
    play: jest.fn(),
    pause: jest.fn(),
    seekTo: jest.fn((_ms: number) => Promise.resolve()),
    setRate: jest.fn(),
    setVolume: jest.fn(),
    onSnapshot: jest.fn((callback: (snapshot: VoiceSnapshot) => void) => {
      listener = callback;
      return () => {
        listener = null;
      };
    }),
    dispose: jest.fn(),
    emit(snapshot: Partial<VoiceSnapshot>) {
      listener?.({ ...IDLE_SNAPSHOT, ...snapshot });
    },
  };
  return voice satisfies VoicePort & { emit: (s: Partial<VoiceSnapshot>) => void };
}

function createMockMixer() {
  return {
    apply: jest.fn(),
    setMasterGain: jest.fn(),
    setDucking: jest.fn(),
    suspend: jest.fn(),
    dispose: jest.fn(),
  } satisfies AmbienceMixer;
}

function createSource<E>() {
  const listeners = new Set<(event: E) => void>();
  return {
    subscribe: jest.fn((callback: (event: E) => void) => {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    }),
    emit(event: E) {
      for (const listener of [...listeners]) listener(event);
    },
  } satisfies PlatformEventSource<E> & { emit(event: E): void };
}

function setup(overrides: Partial<LectioEngineDeps> = {}) {
  const voice = createMockVoice();
  const mixer = createMockMixer();
  const remote = createSource<RemoteEvent>();
  const timers: VirtualTimers = createVirtualTimers();
  const deps: LectioEngineDeps = { voice, mixer, remote, timers, ...overrides };
  const engine = createLectioEngine(deps);
  const states: PlaybackState[] = [];
  const positions: PositionUpdate[] = [];
  const remoteCommands: unknown[] = [];
  engine.onState((state) => states.push(state));
  engine.onPosition((update) => positions.push(update));
  engine.onRemoteCommand((command) => remoteCommands.push(command));
  /** Starts the chapter playing: loaded, then a snapshot that plays. */
  const startPlaying = async (load: ChapterLoad = chapter(), startMs = 0) => {
    await engine.load(load, startMs);
    engine.setAmbienceMix(MIX);
    voice.emit({ loaded: true, playing: true, positionMs: startMs });
  };
  return { engine, voice, mixer, remote, timers, states, positions, remoteCommands, startPlaying };
}

const RAIN_START = {
  type: 'start',
  cueId: ID(1),
  category: 'light_rain',
  gainDb: -12,
  fadeMs: 2500,
} as const;
const RAIN_STOP = { type: 'stop', cueId: ID(1), fadeMs: BED_FADE_OUT_MS } as const;
/** The planner's stop when a sentence leaves the cue: the cue's own fade, not the transport's. */
const RAIN_LEAVE = { type: 'stop', cueId: ID(1), fadeMs: 3000 } as const;

describe('lectio-engine: loading', () => {
  it('hands the segments and metadata to the voice and reports loading until it is ready', async () => {
    const { engine, voice, states } = setup();
    await engine.load(chapter(), 0);
    expect(voice.load).toHaveBeenCalledWith(
      [
        { uri: 'file:///a.m4a', durationMs: 4000 },
        { uri: 'file:///b.m4a', durationMs: 6000 },
      ],
      0,
      { title: 'Chapter one', seriesTitle: 'Series', coverUri: null },
    );
    expect(states).toEqual(['loading']);
    voice.emit({ loaded: true, positionMs: 0 });
    expect(states).toEqual(['loading', 'paused']);
  });

  it('does not sound beds while the voice is paused, and starts them when it plays', async () => {
    const { engine, voice, mixer } = setup();
    await engine.load(chapter(), 2500);
    engine.setAmbienceMix(MIX);
    voice.emit({ loaded: true, playing: false, positionMs: 2500 });
    expect(mixer.apply).not.toHaveBeenCalledWith([expect.objectContaining({ type: 'start' })]);

    voice.emit({ loaded: true, playing: true, positionMs: 2500 });
    expect(mixer.apply).toHaveBeenLastCalledWith([
      { ...RAIN_START, gainDb: bedGainDb(-22, 'medium', undefined) },
    ]);
  });

  it('rejects an invalid timeline before the voice sees anything', async () => {
    const { engine, voice } = setup();
    const bad = chapter({
      segments: [
        { uri: 'x', durationMs: 1000, sentenceStart: 3, sentenceEnd: 3, sentenceOffsetsMs: [0] },
      ],
    });
    await expect(engine.load(bad, 0)).rejects.toThrow(RangeError);
    expect(voice.load).not.toHaveBeenCalled();
  });

  it('fades the previous chapter beds out when a new chapter loads', async () => {
    const { engine, mixer, startPlaying } = setup();
    await startPlaying();
    mixer.apply.mockClear();
    await engine.load(chapter({ cues: [] }), 0);
    expect(mixer.apply).toHaveBeenCalledWith([RAIN_STOP]);
  });

  it('lets a newer load win: a stale load resolving late does not move the position', async () => {
    const resolvers: (() => void)[] = [];
    const { engine, voice, positions } = setup();
    voice.load.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const first = engine.load(chapter({ id: ID(1), segments: SEGMENTS }), 30_000);
    const second = engine.load(chapter({ id: ID(2), segments: SEGMENTS }), 0);
    resolvers[1]?.();
    await second;
    resolvers[0]?.();
    await first;
    expect(positions.at(-1)).toEqual({ positionMs: 0, sentenceIdx: 0 });
  });
});

describe('lectio-engine: state and transport', () => {
  it('maps snapshots to states', async () => {
    const { engine, voice, states } = setup();
    await engine.load(chapter(), 0);
    voice.emit({ loaded: true, playing: true });
    voice.emit({ loaded: true, playing: false });
    expect(states).toEqual(['loading', 'playing', 'paused']);
  });

  it('reports buffering rather than ended while the chapter is still generating', async () => {
    const { engine, voice, states } = setup();
    await engine.load(chapter({ final: false }), 0);
    voice.emit({ loaded: true, playing: true });
    voice.emit({ loaded: true, playing: false, ended: true, positionMs: 10_000 });
    expect(states.at(-1)).toBe('buffering');
  });

  it('reports ended once a final chapter runs out', async () => {
    const { engine, voice, states } = setup();
    await engine.load(chapter(), 0);
    voice.emit({ loaded: true, ended: true, positionMs: 10_000 });
    expect(states.at(-1)).toBe('ended');
  });

  it('reports errors from the voice', async () => {
    const { engine, voice, states } = setup();
    await engine.load(chapter(), 0);
    voice.emit({ loaded: false, error: 'codec failure' });
    expect(states.at(-1)).toBe('error');
  });

  it('emits a position on every snapshot, with the sentence derived from the timeline', async () => {
    const { engine, voice, positions } = setup();
    await engine.load(chapter(), 0);
    voice.emit({ loaded: true, playing: true, positionMs: 2100 });
    voice.emit({ loaded: true, playing: true, positionMs: 4500 });
    expect(positions.at(-2)).toEqual({ positionMs: 2100, sentenceIdx: 1 });
    expect(positions.at(-1)).toEqual({ positionMs: 4500, sentenceIdx: 2 });
  });

  it('re-plans beds only when the sentence changes', async () => {
    const { voice, mixer, startPlaying } = setup();
    await startPlaying();
    mixer.apply.mockClear();
    voice.emit({ loaded: true, playing: true, positionMs: 100 });
    voice.emit({ loaded: true, playing: true, positionMs: 900 });
    expect(mixer.apply).not.toHaveBeenCalled();
    voice.emit({ loaded: true, playing: true, positionMs: 4000 });
    expect(mixer.apply).toHaveBeenCalledWith([RAIN_LEAVE]);
  });
});

describe('lectio-engine: beds follow the transport (P1-2)', () => {
  it('fades beds out only after the debounce once the voice pauses', async () => {
    const { engine, voice, mixer, timers, startPlaying } = setup();
    await startPlaying();
    mixer.apply.mockClear();

    engine.pause();
    voice.emit({ loaded: true, playing: false, positionMs: 1000 });
    timers.advance(BED_STOP_DELAY_MS - 1);
    expect(mixer.apply).not.toHaveBeenCalled();

    timers.advance(1);
    expect(mixer.apply).toHaveBeenCalledWith([RAIN_STOP]);
  });

  it('keeps the beds through a resume inside the debounce, so a segment swap never flickers them', async () => {
    const { voice, mixer, timers, startPlaying } = setup();
    await startPlaying();
    mixer.apply.mockClear();

    voice.emit({ loaded: true, playing: false, positionMs: 1000 });
    timers.advance(200);
    voice.emit({ loaded: true, playing: true, positionMs: 1200 });
    timers.advance(1000);

    expect(mixer.apply).not.toHaveBeenCalledWith([RAIN_STOP]);
  });

  it('keeps the beds through buffering, and fades them out when the voice errors', async () => {
    const { voice, mixer, timers, startPlaying } = setup();
    await startPlaying();
    mixer.apply.mockClear();

    voice.emit({ loaded: true, playing: true, buffering: true, positionMs: 1000 });
    timers.advance(2000);
    expect(mixer.apply).not.toHaveBeenCalledWith([RAIN_STOP]);

    voice.emit({ loaded: false, error: 'codec failure', positionMs: 1000 });
    timers.advance(BED_STOP_DELAY_MS);
    expect(mixer.apply).toHaveBeenCalledWith([RAIN_STOP]);
  });

  it('fades the beds out when a final chapter ends', async () => {
    const { voice, mixer, timers, startPlaying } = setup();
    await startPlaying();
    mixer.apply.mockClear();

    voice.emit({ loaded: true, ended: true, positionMs: 1000 });
    timers.advance(BED_STOP_DELAY_MS);
    expect(mixer.apply).toHaveBeenCalledWith([RAIN_STOP]);
  });

  it('holds the ducking until the beds have faded, so a pause never makes them louder', async () => {
    const { engine, voice, mixer, timers, startPlaying } = setup();
    await startPlaying();
    expect(mixer.setDucking.mock.calls.at(-1)?.[0]).toEqual({ gainDb: -7, rampMs: 30 });

    const sentToMixerBeforePause = mixer.setDucking.mock.calls.length;
    engine.pause();
    voice.emit({ loaded: true, playing: false, positionMs: 1000 });
    timers.advance(BED_STOP_DELAY_MS + BED_FADE_OUT_MS - 1);
    const duringFade = mixer.setDucking.mock.calls.slice(sentToMixerBeforePause);
    expect(duringFade.every(([ramp]) => ramp.gainDb === -7)).toBe(true);

    timers.advance(1);
    expect(mixer.setDucking.mock.calls.at(-1)?.[0]).toEqual({ gainDb: 0, rampMs: 550 });
  });

  it('keeps the ducking through a buffering flap shorter than BUFFER_DUCK_HOLD_MS (QA-E E-05)', async () => {
    const { voice, mixer, startPlaying } = setup();
    await startPlaying();
    const whilePlaying = mixer.setDucking.mock.calls.at(-1)?.[0];
    const sentBefore = mixer.setDucking.mock.calls.length;

    voice.emit({ loaded: true, playing: true, buffering: true, positionMs: 1000 });
    voice.emit({ loaded: true, playing: true, buffering: false, positionMs: 1100 });

    // The flap never releases the ducking, so the beds neither swell nor dip again.
    expect(mixer.setDucking.mock.calls.slice(sentBefore)).toEqual([]);
    expect(mixer.setDucking.mock.calls.at(-1)?.[0]).toEqual(whilePlaying);
  });

  it('releases the ducking when buffering lasts past BUFFER_DUCK_HOLD_MS', async () => {
    const { voice, mixer, timers, startPlaying } = setup();
    await startPlaying();
    voice.emit({ loaded: true, playing: true, buffering: true, positionMs: 1000 });

    timers.advance(BUFFER_DUCK_HOLD_MS - 1);
    expect(mixer.setDucking.mock.calls.at(-1)?.[0]).not.toEqual({ gainDb: 0, rampMs: 550 });
    timers.advance(1);
    expect(mixer.setDucking.mock.calls.at(-1)?.[0]).toEqual({ gainDb: 0, rampMs: 550 });
  });

  it('suspends the audio clock a fixed delay after the beds have faded', async () => {
    const { engine, voice, mixer, timers, startPlaying } = setup();
    await startPlaying();
    engine.pause();
    voice.emit({ loaded: true, playing: false, positionMs: 1000 });
    timers.advance(BED_STOP_DELAY_MS + BED_FADE_OUT_MS);
    expect(mixer.suspend).not.toHaveBeenCalled();

    timers.advance(BED_SUSPEND_DELAY_MS);
    expect(mixer.suspend).toHaveBeenCalledTimes(1);
  });

  it('cancels the suspend when the voice plays again', async () => {
    const { engine, voice, mixer, timers, startPlaying } = setup();
    await startPlaying();
    engine.pause();
    voice.emit({ loaded: true, playing: false, positionMs: 1000 });
    timers.advance(BED_STOP_DELAY_MS + BED_FADE_OUT_MS);
    voice.emit({ loaded: true, playing: true, positionMs: 1000 });

    timers.advance(BED_SUSPEND_DELAY_MS * 2);
    expect(mixer.suspend).not.toHaveBeenCalled();
  });
});

describe('lectio-engine: seeking and rate', () => {
  it('clamps a seek to the available audio and plans beds for the new sentence', async () => {
    const { engine, voice, mixer, startPlaying } = setup();
    await startPlaying();
    mixer.apply.mockClear();
    engine.seekTo(99_000);
    expect(voice.seekTo).toHaveBeenCalledWith(10_000);
    expect(mixer.apply).toHaveBeenCalledWith([RAIN_LEAVE]);
  });

  it('brings the beds back when seeking back into the cue while the voice plays', async () => {
    const { engine, mixer, startPlaying } = setup();
    await startPlaying(chapter(), 4500);
    mixer.apply.mockClear();
    engine.seekTo(1000);
    expect(mixer.apply).toHaveBeenCalledWith([RAIN_START]);
  });

  it('plans the beds for a seek made while paused, and sounds them when the voice plays', async () => {
    const { engine, voice, mixer } = setup();
    await engine.load(chapter(), 0);
    engine.setAmbienceMix(MIX);
    voice.emit({ loaded: true, playing: false, positionMs: 0 });
    mixer.apply.mockClear();

    engine.seekTo(1000);
    expect(mixer.apply).not.toHaveBeenCalledWith([expect.objectContaining({ type: 'start' })]);

    voice.emit({ loaded: true, playing: true, positionMs: 1000 });
    expect(mixer.apply).toHaveBeenCalledWith([expect.objectContaining({ type: 'start' })]);
  });

  it('validates the rate range and forwards valid rates', async () => {
    const { engine, voice } = setup();
    await engine.load(chapter(), 0);
    expect(() => engine.setRate(0.4)).toThrow(RangeError);
    expect(() => engine.setRate(2.5)).toThrow(RangeError);
    engine.setRate(1.5);
    expect(voice.setRate).toHaveBeenCalledWith(1.5);
    expect(voice.setRate).toHaveBeenCalledTimes(1);
  });

  it('keeps the timeline in media time, so a rate change does not move the sentence', async () => {
    const { engine, voice, positions } = setup();
    await engine.load(chapter(), 0);
    engine.setRate(2);
    voice.emit({ loaded: true, playing: true, positionMs: 2100 });
    expect(positions.at(-1)?.sentenceIdx).toBe(1);
  });
});

describe('lectio-engine: volume (sleep fade)', () => {
  it('sets the voice volume and the master gain of the beds together', async () => {
    const { engine, voice, mixer } = setup();
    await engine.load(chapter(), 0);
    engine.setVolume(0.25);
    expect(voice.setVolume).toHaveBeenCalledWith(0.25);
    expect(mixer.setMasterGain).toHaveBeenCalledWith(0.25);
  });

  it('validates volume', async () => {
    const { engine, voice, mixer } = setup();
    await engine.load(chapter(), 0);
    expect(() => engine.setVolume(1.2)).toThrow(RangeError);
    expect(voice.setVolume).not.toHaveBeenCalled();
    expect(mixer.setMasterGain).not.toHaveBeenCalled();
  });
});

describe('lectio-engine: progressive playback', () => {
  it('does not report ended until the final segment is appended', async () => {
    const { engine, voice, states } = setup();
    await engine.load(chapter({ final: false, segments: SEGMENTS.slice(0, 1) }), 0);
    voice.emit({ loaded: true, playing: true });
    voice.emit({ loaded: true, playing: false, ended: true, positionMs: 4000 });
    expect(states.at(-1)).toBe('buffering');

    const next: LoadedSegment = {
      uri: 'file:///c.m4a',
      durationMs: 3000,
      sentenceStart: 2,
      sentenceEnd: 2,
      sentenceOffsetsMs: [0],
    };
    engine.appendSegments([next], true);
    expect(voice.append).toHaveBeenCalledWith([{ uri: 'file:///c.m4a', durationMs: 3000 }], true);
    expect(states.at(-1)).toBe('ended');
  });

  it('refuses a segment that does not continue the sentence numbering', async () => {
    const { engine, voice } = setup();
    await engine.load(chapter({ final: false, segments: SEGMENTS.slice(0, 1) }), 0);
    const gap: LoadedSegment = {
      uri: 'file:///gap.m4a',
      durationMs: 1000,
      sentenceStart: 5,
      sentenceEnd: 5,
      sentenceOffsetsMs: [0],
    };
    expect(() => engine.appendSegments([gap], false)).toThrow(RangeError);
    expect(voice.append).not.toHaveBeenCalled();
  });
});

describe('lectio-engine: ambience mix', () => {
  it('turns beds off at once when the ambience is disabled, and does not start them while off', async () => {
    const { engine, voice, mixer, timers, startPlaying } = setup();
    await startPlaying();
    mixer.apply.mockClear();

    engine.setAmbienceMix({ ...MIX, enabled: false });
    expect(mixer.apply).toHaveBeenCalledWith([RAIN_STOP]);

    voice.emit({ loaded: true, playing: false, positionMs: 1000 });
    voice.emit({ loaded: true, playing: true, positionMs: 1000 });
    timers.advance(1000);
    expect(mixer.apply).not.toHaveBeenCalledWith([expect.objectContaining({ type: 'start' })]);
  });

  it('retargets sounding beds when the level changes', async () => {
    const { engine, mixer, startPlaying } = setup();
    await startPlaying();
    mixer.apply.mockClear();
    engine.setAmbienceMix({ ...MIX, levelDb: -18 });
    expect(mixer.apply).toHaveBeenCalledWith([
      { type: 'retarget', cueId: ID(1), gainDb: -8, rampMs: 400 },
    ]);
  });

  it('ramps the ducking to the duck depth the mix sets', async () => {
    const { engine, mixer, startPlaying } = setup();
    await startPlaying();
    engine.setAmbienceMix({ ...MIX, duckingDb: 12 });
    expect(mixer.setDucking.mock.calls.at(-1)?.[0]).toEqual({ gainDb: -12, rampMs: 30 });
  });

  it('rejects a level outside -40 to 0 dB, and a ducking outside 0 to 24 dB', async () => {
    const { engine, mixer } = setup();
    await engine.load(chapter(), 0);
    expect(() => engine.setAmbienceMix({ ...MIX, levelDb: 6 })).toThrow(RangeError);
    expect(() => engine.setAmbienceMix({ ...MIX, levelDb: -41 })).toThrow(RangeError);
    expect(() => engine.setAmbienceMix({ ...MIX, duckingDb: 25 })).toThrow(RangeError);
    expect(mixer.apply).not.toHaveBeenCalledWith(expect.arrayContaining([expect.anything()]));
  });

  it('ignores cues that are disabled', async () => {
    const { engine, mixer } = setup();
    await engine.load(chapter({ cues: [{ ...RAIN, enabled: false }] }), 0);
    engine.setAmbienceMix(MIX);
    expect(mixer.apply).not.toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ type: 'start' })]),
    );
  });
});

describe('lectio-engine: remote commands', () => {
  it('applies play, pause and seek, and forwards every command to listeners', async () => {
    const { engine, voice, remote, remoteCommands } = setup();
    await engine.load(chapter(), 0);
    remote.emit({ name: 'play' });
    remote.emit({ name: 'pause' });
    remote.emit({ name: 'seekTo', positionMs: 2000 });
    expect(voice.play).toHaveBeenCalledTimes(1);
    expect(voice.pause).toHaveBeenCalledTimes(1);
    expect(voice.seekTo).toHaveBeenCalledWith(2000);
    expect(remoteCommands).toHaveLength(3);
  });

  it('toggles against the state the engine last reported', async () => {
    const { engine, voice, remote } = setup();
    await engine.load(chapter(), 0);
    voice.emit({ loaded: true, playing: true });
    remote.emit({ name: 'togglePlayPause' });
    expect(voice.pause).toHaveBeenCalledTimes(1);
  });

  it('forwards next and previous without touching the voice', async () => {
    const { engine, voice, remote, remoteCommands } = setup();
    await engine.load(chapter(), 0);
    remote.emit({ name: 'next' });
    remote.emit({ name: 'previous' });
    expect(voice.play).not.toHaveBeenCalled();
    expect(voice.pause).not.toHaveBeenCalled();
    expect(remoteCommands).toHaveLength(2);
  });
});

describe('lectio-engine: play from the end and disposal', () => {
  it('restarts the chapter when play is pressed after it ended', async () => {
    const { engine, voice } = setup();
    await engine.load(chapter(), 0);
    voice.emit({ loaded: true, ended: true, positionMs: 10_000 });
    engine.play();
    expect(voice.seekTo).toHaveBeenCalledWith(0);
    expect(voice.play).toHaveBeenCalledTimes(1);
  });

  it('disposes the voice and mixer, stops listening to platform events, and goes quiet', async () => {
    const { engine, voice, mixer, remote, startPlaying } = setup();
    await startPlaying();
    engine.dispose();
    expect(voice.dispose).toHaveBeenCalledTimes(1);
    expect(mixer.dispose).toHaveBeenCalledTimes(1);
    remote.emit({ name: 'pause' });
    expect(voice.pause).not.toHaveBeenCalled();
  });
});

describe('lectio-engine: bed preview', () => {
  it('starts the bed on its own cue at the level-derived gain, then fades it out after the duration', async () => {
    const { engine, mixer, timers } = setup();
    engine.previewBed('base_rain', -22, 8000);

    expect(mixer.apply).toHaveBeenLastCalledWith([
      {
        type: 'start',
        cueId: 'preview',
        category: 'base_rain',
        gainDb: bedGainDb(-22, 'medium', undefined),
        fadeMs: 400,
      },
    ]);

    mixer.apply.mockClear();
    timers.advance(7999);
    expect(mixer.apply).not.toHaveBeenCalled();

    timers.advance(1);
    expect(mixer.apply).toHaveBeenCalledWith([{ type: 'stop', cueId: 'preview', fadeMs: 400 }]);
  });

  it('restarts the timer when a second preview comes in, so the first stop does not cut it short', () => {
    const { engine, mixer, timers } = setup();
    engine.previewBed('base_rain', -22, 8000);
    timers.advance(5000);
    engine.previewBed('base_rain', -22, 8000);
    mixer.apply.mockClear();

    timers.advance(5000);
    expect(mixer.apply).not.toHaveBeenCalled();

    timers.advance(3000);
    expect(mixer.apply).toHaveBeenCalledWith([{ type: 'stop', cueId: 'preview', fadeMs: 400 }]);
  });

  it('cancels a pending stop on dispose, so no command reaches a closed mixer', () => {
    const { engine, mixer, timers } = setup();
    engine.previewBed('base_rain', -22, 8000);
    engine.dispose();
    mixer.apply.mockClear();

    timers.advance(10_000);
    expect(mixer.apply).not.toHaveBeenCalled();
  });

  it('rejects a level outside -40 to 0 dB', () => {
    const { engine } = setup();
    expect(() => engine.previewBed('base_rain', 3, 8000)).toThrow(RangeError);
  });
});
