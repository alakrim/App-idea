import type { AmbienceCue } from '@/core/domain/analysis';
import { bedGainDb } from '@/core/playback/ambience-scheduler';
import type { RemoteEvent } from '@/core/playback/remote-commands';

import { type InterruptionEvent, type LectioEngineDeps, createLectioEngine } from './lectio-engine';

import type { AmbienceMixer } from './ambience-mixer';
import type { ChapterLoad, LoadedSegment, PlaybackState, PositionUpdate } from './engine';
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
    setMaster: jest.fn(),
    setDucking: jest.fn(),
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
  };
}

function setup() {
  const voice = createMockVoice();
  const mixer = createMockMixer();
  const interruptions = createSource<InterruptionEvent>();
  const remote = createSource<RemoteEvent>();
  const deps: LectioEngineDeps = { voice, mixer, interruptions, remote };
  const engine = createLectioEngine(deps);
  const states: PlaybackState[] = [];
  const positions: PositionUpdate[] = [];
  const remoteCommands: unknown[] = [];
  engine.onState((state) => states.push(state));
  engine.onPosition((update) => positions.push(update));
  engine.onRemoteCommand((command) => remoteCommands.push(command));
  return { engine, voice, mixer, interruptions, remote, states, positions, remoteCommands };
}

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

  it('starts ambience for the sentence at the start position', async () => {
    const { engine, mixer } = setup();
    await engine.load(chapter(), 2500);
    expect(mixer.apply).toHaveBeenLastCalledWith([
      { type: 'start', cueId: ID(1), category: 'light_rain', gainDb: -12, fadeMs: 2500 },
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

  it('stops the previous chapter beds when a new chapter loads', async () => {
    const { engine, mixer } = setup();
    await engine.load(chapter(), 0);
    mixer.apply.mockClear();
    await engine.load(chapter({ cues: [] }), 0);
    expect(mixer.apply).toHaveBeenCalledWith([{ type: 'stop', cueId: ID(1), fadeMs: 3000 }]);
  });
});

describe('lectio-engine: state, position and ducking', () => {
  it('maps snapshots to states and ducks only while the voice is playing', async () => {
    const { engine, voice, mixer, states } = setup();
    await engine.load(chapter(), 0);
    voice.emit({ loaded: true, playing: true });
    voice.emit({ loaded: true, playing: false });
    expect(states).toEqual(['loading', 'playing', 'paused']);
    expect(mixer.setDucking.mock.calls).toEqual([
      [{ gainDb: -7, rampMs: 30 }],
      [{ gainDb: 0, rampMs: 550 }],
    ]);
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
    const { engine, voice, mixer } = setup();
    await engine.load(chapter(), 0);
    mixer.apply.mockClear();
    voice.emit({ loaded: true, playing: true, positionMs: 100 });
    voice.emit({ loaded: true, playing: true, positionMs: 900 });
    expect(mixer.apply).not.toHaveBeenCalled();
    voice.emit({ loaded: true, playing: true, positionMs: 4000 });
    expect(mixer.apply).toHaveBeenCalledWith([{ type: 'stop', cueId: ID(1), fadeMs: 3000 }]);
  });
});

describe('lectio-engine: seeking and rate', () => {
  it('clamps a seek to the available audio and plans beds for the new sentence', async () => {
    const { engine, voice, mixer } = setup();
    await engine.load(chapter(), 0);
    mixer.apply.mockClear();
    engine.seekTo(99_000);
    expect(voice.seekTo).toHaveBeenCalledWith(10_000);
    expect(mixer.apply).toHaveBeenCalledWith([{ type: 'stop', cueId: ID(1), fadeMs: 3000 }]);
  });

  it('brings the beds back when seeking back into the cue', async () => {
    const { engine, mixer } = setup();
    await engine.load(chapter(), 4500);
    mixer.apply.mockClear();
    engine.seekTo(1000);
    expect(mixer.apply).toHaveBeenCalledWith([
      { type: 'start', cueId: ID(1), category: 'light_rain', gainDb: -12, fadeMs: 2500 },
    ]);
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

  it('validates volume', async () => {
    const { engine, voice } = setup();
    await engine.load(chapter(), 0);
    expect(() => engine.setVolume(1.2)).toThrow(RangeError);
    engine.setVolume(0.25);
    expect(voice.setVolume).toHaveBeenCalledWith(0.25);
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
    expect(voice.append).toHaveBeenCalledWith([{ uri: 'file:///c.m4a', durationMs: 3000 }]);
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

describe('lectio-engine: ambience master', () => {
  it('turns the master on and off through the mixer', async () => {
    const { engine, mixer } = setup();
    await engine.load(chapter(), 0);
    engine.setAmbienceMaster(false, -22);
    expect(mixer.setMaster).toHaveBeenLastCalledWith(false);
  });

  it('retargets sounding beds when the level changes', async () => {
    const { engine, mixer } = setup();
    await engine.load(chapter(), 0);
    mixer.apply.mockClear();
    engine.setAmbienceMaster(true, -18);
    expect(mixer.apply).toHaveBeenCalledWith([
      { type: 'retarget', cueId: ID(1), gainDb: -8, rampMs: 400 },
    ]);
  });

  it('rejects a level outside -40 to 0 dB', async () => {
    const { engine } = setup();
    await engine.load(chapter(), 0);
    expect(() => engine.setAmbienceMaster(true, 6)).toThrow(RangeError);
  });

  it('ignores cues that are disabled', async () => {
    const { engine, mixer } = setup();
    await engine.load(chapter({ cues: [{ ...RAIN, enabled: false }] }), 0);
    expect(mixer.apply).not.toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ type: 'start' })]),
    );
  });
});

describe('lectio-engine: interruptions', () => {
  it('pauses on a phone call and resumes when the OS says it may', async () => {
    const { engine, voice, interruptions } = setup();
    await engine.load(chapter(), 0);
    voice.emit({ loaded: true, playing: true });
    interruptions.emit({ type: 'began', shouldResume: false });
    expect(voice.pause).toHaveBeenCalledTimes(1);
    interruptions.emit({ type: 'ended', shouldResume: true });
    expect(voice.play).toHaveBeenCalledTimes(1);
  });

  it('stays paused when the call ends without permission to resume', async () => {
    const { engine, voice, interruptions } = setup();
    await engine.load(chapter(), 0);
    voice.emit({ loaded: true, playing: true });
    interruptions.emit({ type: 'began', shouldResume: false });
    interruptions.emit({ type: 'ended', shouldResume: false });
    expect(voice.play).not.toHaveBeenCalled();
  });

  it('does not resume a voice that was paused before the interruption', async () => {
    const { engine, voice, interruptions } = setup();
    await engine.load(chapter(), 0);
    voice.emit({ loaded: true, playing: false });
    interruptions.emit({ type: 'began', shouldResume: false });
    expect(voice.pause).not.toHaveBeenCalled();
    interruptions.emit({ type: 'ended', shouldResume: true });
    expect(voice.play).not.toHaveBeenCalled();
  });

  it('forgets an interruption once the user pauses', async () => {
    const { engine, voice, interruptions } = setup();
    await engine.load(chapter(), 0);
    voice.emit({ loaded: true, playing: true });
    interruptions.emit({ type: 'began', shouldResume: false });
    engine.pause();
    interruptions.emit({ type: 'ended', shouldResume: true });
    expect(voice.play).not.toHaveBeenCalled();
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
    expect(remoteCommands).toEqual([
      { type: 'play' },
      { type: 'pause' },
      { type: 'seek', positionMs: 2000 },
    ]);
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
    expect(remoteCommands).toEqual([{ type: 'next' }, { type: 'prev' }]);
    expect(voice.play).not.toHaveBeenCalled();
    expect(voice.pause).not.toHaveBeenCalled();
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
    const { engine, voice, mixer, interruptions, remote, states } = setup();
    await engine.load(chapter(), 0);
    engine.dispose();
    expect(voice.dispose).toHaveBeenCalled();
    expect(mixer.dispose).toHaveBeenCalled();
    voice.emit({ loaded: true, playing: true });
    expect(states.at(-1)).toBe('loading');
    interruptions.emit({ type: 'began', shouldResume: false });
    remote.emit({ name: 'pause' });
    expect(voice.pause).not.toHaveBeenCalled();
  });
});

describe('lectio-engine: bed preview', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts the bed on its own cue at the level-derived gain, then fades it out after the duration', () => {
    const { engine, mixer } = setup();
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
    jest.advanceTimersByTime(7999);
    expect(mixer.apply).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(mixer.apply).toHaveBeenCalledWith([{ type: 'stop', cueId: 'preview', fadeMs: 400 }]);
  });

  it('restarts the timer when a second preview comes in, so the first stop does not cut it short', () => {
    const { engine, mixer } = setup();
    engine.previewBed('base_rain', -22, 8000);
    jest.advanceTimersByTime(5000);
    engine.previewBed('base_rain', -22, 8000);
    mixer.apply.mockClear();

    jest.advanceTimersByTime(5000);
    expect(mixer.apply).not.toHaveBeenCalled();

    jest.advanceTimersByTime(3000);
    expect(mixer.apply).toHaveBeenCalledWith([{ type: 'stop', cueId: 'preview', fadeMs: 400 }]);
  });

  it('cancels a pending stop on dispose, so no command reaches a closed mixer', () => {
    const { engine, mixer } = setup();
    engine.previewBed('base_rain', -22, 8000);
    engine.dispose();
    mixer.apply.mockClear();

    jest.advanceTimersByTime(10_000);
    expect(mixer.apply).not.toHaveBeenCalled();
  });

  it('rejects a level outside -40 to 0 dB', () => {
    const { engine } = setup();
    expect(() => engine.previewBed('base_rain', 3, 8000)).toThrow(RangeError);
  });
});
