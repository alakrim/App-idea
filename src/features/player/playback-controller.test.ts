import { createVirtualTimers } from '@/core/playback/timers';

import {
  DEFAULT_AMBIENCE,
  SEGMENT_ONE,
  SEGMENT_TWO,
  fixtureChapter,
  flush,
  id,
  setupController,
} from './__fixtures__/playback-fixtures';
import { BED_PREVIEW_MS } from './playback-controller';

describe('playChapter', () => {
  it('loads the chapter, exposes its content and starts at the beginning', async () => {
    const { controller, engine } = setupController([fixtureChapter(1, 1, 'ready')]);

    await controller.playChapter(id(1));

    const content = controller.content.getState();
    expect(content.status).toBe('ready');
    expect(content.timeline?.totalDurationMs).toBe(10_000);
    expect(content.sentences).toHaveLength(4);
    expect(content.cues.map((c) => c.id)).toEqual([id(900)]);
    expect(content.coverTint).toBe('#2B3A55');
    expect(controller.player.getState().nowPlaying).toMatchObject({
      chapterId: id(1),
      seriesTitle: 'The Night Harbour',
    });
    controller.player.play();
    expect(engine.soundingBedIds()).toEqual([id(900)]);
  });

  it('resumes the saved sentence when it belongs to the chapter', async () => {
    const { controller } = setupController([fixtureChapter(1, 1, 'ready')], {
      chapterId: id(1),
      chapterOrder: 1,
      sentenceIdx: 2,
    });

    await controller.playChapter(id(1));

    expect(controller.player.getState().positionMs).toBe(4000);
    expect(controller.player.getState().sentenceIdx).toBe(2);
  });

  it('starts from the beginning when the saved position is in another chapter', async () => {
    const { controller } = setupController([fixtureChapter(1, 1, 'ready')], {
      chapterId: id(7),
      chapterOrder: 2,
      sentenceIdx: 3,
    });

    await controller.playChapter(id(1));

    expect(controller.player.getState().positionMs).toBe(0);
  });

  it('starts at an explicit sentence over the saved position', async () => {
    const { controller } = setupController([fixtureChapter(1, 1, 'ready')], {
      chapterId: id(1),
      chapterOrder: 1,
      sentenceIdx: 3,
    });

    await controller.playChapter(id(1), { fromSentence: 1 });

    expect(controller.player.getState().positionMs).toBe(2000);
  });

  it('reports unavailable for a chapter with no narration yet, and never loads the engine', async () => {
    const { controller, engine } = setupController([fixtureChapter(1, 1, 'ready', [])]);
    const load = jest.spyOn(engine, 'load');

    await controller.playChapter(id(1));

    expect(controller.content.getState().status).toBe('unavailable');
    expect(load).not.toHaveBeenCalled();
  });

  it('reports unavailable for a chapter that does not exist', async () => {
    const { controller } = setupController([]);

    await controller.playChapter(id(42));

    expect(controller.content.getState().status).toBe('unavailable');
  });

  it('saves the position of the previous chapter before switching', async () => {
    const { controller, fixture, engine } = setupController([
      fixtureChapter(1, 1, 'ready'),
      fixtureChapter(2, 2, 'ready', [SEGMENT_ONE]),
    ]);
    await controller.playChapter(id(1));
    controller.player.play();
    engine.advance(2500);

    await controller.playChapter(id(2));

    expect(fixture.saved.at(-1)).toMatchObject({ chapterId: id(1), sentenceIdx: 1 });
  });
});

describe('auto-advance', () => {
  it('moves to the next ready chapter when the current one ends', async () => {
    const { controller, engine } = setupController([
      fixtureChapter(1, 1, 'ready'),
      fixtureChapter(2, 2, 'ready', [SEGMENT_ONE]),
    ]);
    await controller.playChapter(id(1));
    controller.player.play();

    engine.advance(10_000);
    await flush();

    expect(controller.player.getState().nowPlaying?.chapterId).toBe(id(2));
  });

  it('stops at the end of the series', async () => {
    const { controller, engine } = setupController([fixtureChapter(1, 1, 'ready')]);
    await controller.playChapter(id(1));
    controller.player.play();

    engine.advance(10_000);
    await flush();

    expect(controller.player.getState().nowPlaying?.chapterId).toBe(id(1));
    expect(controller.player.getState().state).toBe('ended');
  });

  it('does not advance when the sleep timer ends at the end of the chapter', async () => {
    const { controller, engine } = setupController([
      fixtureChapter(1, 1, 'ready'),
      fixtureChapter(2, 2, 'ready', [SEGMENT_ONE]),
    ]);
    await controller.playChapter(id(1));
    controller.player.setSleepTimer({ mode: 'endOfChapter' });
    controller.player.play();

    engine.advance(10_000);
    await flush();

    expect(controller.player.getState().nowPlaying?.chapterId).toBe(id(1));
  });
});

describe('progressive playback', () => {
  it('appends narration as the pipeline produces it, and finishes when narration is done', async () => {
    const processing = fixtureChapter(1, 1, 'processing', [SEGMENT_ONE]);
    const { controller, pipe, fixture } = setupController([processing]);
    await controller.playChapter(id(1));
    expect(controller.content.getState().final).toBe(false);
    pipe.emit(id(1), 'running', 1);

    fixture.chapters.set(id(1), { ...processing, segments: [SEGMENT_ONE, SEGMENT_TWO] });
    pipe.emit(id(1), 'running', 2);

    expect(controller.content.getState().timeline?.sentenceCount).toBe(4);
    expect(controller.content.getState().timeline?.totalDurationMs).toBe(10_000);

    pipe.emit(id(1), 'ready', 2);
    expect(controller.content.getState().final).toBe(true);
    expect(pipe.listenerCount(id(1))).toBe(0);
  });

  it('starts a chapter that had no audio as soon as its first segment arrives', async () => {
    const waiting = fixtureChapter(1, 1, 'processing', []);
    const { controller, pipe, fixture } = setupController([waiting]);
    await controller.playChapter(id(1));
    expect(controller.content.getState().status).toBe('unavailable');

    fixture.chapters.set(id(1), { ...waiting, segments: [SEGMENT_ONE] });
    pipe.emit(id(1), 'running', 1);
    await flush();

    expect(controller.content.getState().status).toBe('ready');
    expect(controller.player.getState().nowPlaying?.chapterId).toBe(id(1));
  });
});

describe('repeat and seeking', () => {
  it('repeats one sentence until it is cleared', async () => {
    const { controller, engine } = setupController([fixtureChapter(1, 1, 'ready')]);
    await controller.playChapter(id(1));
    controller.setLoopSentence(0);
    controller.player.play();

    engine.advance(2500);

    expect(controller.player.getState().positionMs).toBeLessThan(2000);
    expect(controller.player.getState().sentenceIdx).toBe(0);
    controller.setLoopSentence(null);
    expect(controller.content.getState().loopSentenceIdx).toBeNull();
  });

  it('ends the repeat when the listener taps a different sentence', async () => {
    const { controller } = setupController([fixtureChapter(1, 1, 'ready')]);
    await controller.playChapter(id(1));
    controller.setLoopSentence(0);

    controller.seekToSentence(2);

    expect(controller.content.getState().loopSentenceIdx).toBeNull();
    expect(controller.player.getState().positionMs).toBe(4000);
  });

  it('keeps the repeat when the listener taps the repeating sentence again', async () => {
    const { controller } = setupController([fixtureChapter(1, 1, 'ready')]);
    await controller.playChapter(id(1));
    controller.setLoopSentence(1);

    controller.seekToSentence(1);

    expect(controller.content.getState().loopSentenceIdx).toBe(1);
  });

  it('steps forward a sentence and back, restarting the sentence when more than 2 s in', async () => {
    const { controller } = setupController([fixtureChapter(1, 1, 'ready')]);
    await controller.playChapter(id(1));

    controller.stepSentence('next');
    expect(controller.player.getState().positionMs).toBe(2000);

    controller.seekBy(2500);
    controller.stepSentence('previous');
    expect(controller.player.getState().positionMs).toBe(2000);

    controller.stepSentence('previous');
    expect(controller.player.getState().positionMs).toBe(0);
  });

  it('seeks by a relative amount, clamped to the chapter', async () => {
    const { controller } = setupController([fixtureChapter(1, 1, 'ready')]);
    await controller.playChapter(id(1));

    controller.seekBy(30_000);
    expect(controller.player.getState().positionMs).toBe(10_000);

    controller.seekBy(-15_000);
    expect(controller.player.getState().positionMs).toBe(0);
  });
});

describe('ambience settings (P1-3)', () => {
  it('applies the saved settings to the engine on load, including the ducking', async () => {
    const { controller, engine, ambience } = setupController([fixtureChapter(1, 1, 'ready')]);
    const mix = jest.spyOn(engine, 'setAmbienceMix');
    ambience.saveFromSettings({ enabled: true, levelDb: -30, duckingDb: 12 });

    await controller.playChapter(id(1));

    expect(mix).toHaveBeenLastCalledWith({ enabled: true, levelDb: -30, duckingDb: 12 });
    expect(controller.content.getState().ambience).toEqual({
      enabled: true,
      levelDb: -30,
      duckingDb: 12,
    });
  });

  it('reads the saved settings again when a chapter loads, even if an update was missed', async () => {
    const { controller, engine, ambience } = setupController([fixtureChapter(1, 1, 'ready')]);
    const mix = jest.spyOn(engine, 'setAmbienceMix');
    ambience.saveSilently({ enabled: true, levelDb: -33, duckingDb: 9 });

    await controller.playChapter(id(1));

    expect(mix).toHaveBeenLastCalledWith({ enabled: true, levelDb: -33, duckingDb: 9 });
  });

  it('applies a change made in the settings while the player is open', async () => {
    const { controller, engine, ambience } = setupController([fixtureChapter(1, 1, 'ready')]);
    await controller.playChapter(id(1));
    const mix = jest.spyOn(engine, 'setAmbienceMix');

    ambience.saveFromSettings({ enabled: false, levelDb: -18, duckingDb: 4 });

    expect(mix).toHaveBeenLastCalledWith({ enabled: false, levelDb: -18, duckingDb: 4 });
    expect(controller.content.getState().ambience.levelDb).toBe(-18);
  });

  it('writes an in-player change back to the saved settings, clamped to the shared range', async () => {
    const { controller, engine, ambience } = setupController([fixtureChapter(1, 1, 'ready')]);
    const mix = jest.spyOn(engine, 'setAmbienceMix');
    await controller.playChapter(id(1));

    controller.setAmbience({ levelDb: -12 });
    controller.setAmbience({ enabled: false, levelDb: 9 });

    expect(ambience.written.at(-1)).toEqual({ enabled: false, levelDb: 0, duckingDb: 7 });
    expect(mix).toHaveBeenLastCalledWith({ enabled: false, levelDb: 0, duckingDb: 7 });
    expect(controller.content.getState().ambience).toEqual({
      enabled: false,
      levelDb: 0,
      duckingDb: DEFAULT_AMBIENCE.duckingDb,
    });
  });

  it('clamps a saved level below the range to -40 dB before the engine sees it', async () => {
    const { controller, engine } = setupController([fixtureChapter(1, 1, 'ready')]);
    const mix = jest.spyOn(engine, 'setAmbienceMix');
    await controller.playChapter(id(1));

    controller.setAmbience({ levelDb: -60 });

    expect(mix).toHaveBeenLastCalledWith({ enabled: true, levelDb: -40, duckingDb: 7 });
  });
});

describe('bed preview', () => {
  it('plays the bed through the engine for the preview length, with the level kept in range', () => {
    const { controller, engine } = setupController([fixtureChapter(1, 1, 'ready')]);
    const preview = jest.spyOn(engine, 'previewBed');

    controller.previewBed('base_rain', -12);
    controller.previewBed('base_rain', 9);

    expect(preview).toHaveBeenNthCalledWith(1, 'base_rain', -12, BED_PREVIEW_MS);
    expect(preview).toHaveBeenNthCalledWith(2, 'base_rain', 0, BED_PREVIEW_MS);
  });
});

describe('auto-advance keeps listening (P2-1)', () => {
  it('lets the store see the end before the next chapter starts, and plays the next chapter', async () => {
    const { controller, engine } = setupController([
      fixtureChapter(1, 1, 'ready'),
      fixtureChapter(2, 2, 'ready', [SEGMENT_ONE]),
    ]);
    await controller.playChapter(id(1));
    const states: string[] = [];
    engine.onState((state) => states.push(state));
    controller.player.play();

    engine.advance(10_000);
    expect(states).toEqual(['playing', 'ended']);
    await flush();

    expect(controller.player.getState().state).toBe('playing');
    expect(controller.player.getState().nowPlaying?.chapterId).toBe(id(2));
    expect(states.at(-1)).toBe('playing');
  });
});

describe('engine errors during playback (P1-4)', () => {
  it('shows the error state for a playback failure, and "Try again" resumes at the saved sentence', async () => {
    const { controller, engine, fixture } = setupController([fixtureChapter(1, 1, 'ready')]);
    await controller.playChapter(id(1));
    controller.player.play();
    engine.advance(5000);
    controller.seekToSentence(2);
    engine.advance(250);

    engine.injectError('decoder stalled');

    expect(controller.content.getState().status).toBe('error');
    expect(controller.content.getState().failure).toBe('playback');
    expect(controller.content.getState().chapterId).toBe(id(1));
    expect(fixture.saved.at(-1)).toMatchObject({ chapterId: id(1), sentenceIdx: 2 });

    await controller.playChapter(id(1));
    controller.player.play();

    expect(controller.content.getState().status).toBe('ready');
    expect(controller.player.getState().sentenceIdx).toBe(2);
    expect(controller.player.getState().state).toBe('playing');
  });

  it('reports a chapter that fails to load as a load failure, not a playback one', async () => {
    const { controller, fixture } = setupController([fixtureChapter(1, 1, 'ready')]);
    // Sentence numbering that does not start at zero cannot be built into a timeline.
    fixture.chapters.get(id(1))!.segments = [
      { ...SEGMENT_ONE, sentenceStart: 5, sentenceEnd: 5, sentenceOffsetsMs: [0] },
    ];
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await controller.playChapter(id(1));

    expect(controller.content.getState().status).toBe('error');
    expect(controller.content.getState().failure).toBe('load');
    warn.mockRestore();
  });
});

describe('narration that is not final (P1-5)', () => {
  it('keeps a chapter open while processing is idle or cancelled, and shows that narration is paused', async () => {
    const { controller, pipe } = setupController([
      fixtureChapter(4, 4, 'processing', [SEGMENT_ONE]),
    ]);
    await controller.playChapter(id(4));

    pipe.emit(id(4), 'idle', 1);
    expect(controller.content.getState().final).toBe(false);
    expect(controller.content.getState().narrationPaused).toBe(true);

    pipe.emit(id(4), 'cancelled', 1);
    expect(controller.content.getState().final).toBe(false);
    expect(controller.content.getState().narrationPaused).toBe(true);
    expect(pipe.listenerCount(id(4))).toBe(1);
  });

  it('treats a stall or reconnect as narrating, and resumes appending when it recovers', async () => {
    const processing = fixtureChapter(1, 1, 'processing', [SEGMENT_ONE]);
    const { controller, pipe, fixture } = setupController([processing]);
    await controller.playChapter(id(1));

    pipe.emit(id(1), 'running', 1);
    pipe.emit(id(1), 'idle', 1);
    expect(controller.content.getState().narrationPaused).toBe(true);

    fixture.chapters.set(id(1), { ...processing, segments: [SEGMENT_ONE, SEGMENT_TWO] });
    pipe.emit(id(1), 'running', 2);
    expect(controller.content.getState().narrationPaused).toBe(false);
    expect(controller.content.getState().timeline?.sentenceCount).toBe(4);
    expect(controller.content.getState().final).toBe(false);
  });

  it('becomes final only when narration fails for good', async () => {
    const { controller, pipe } = setupController([
      fixtureChapter(1, 1, 'processing', [SEGMENT_ONE]),
    ]);
    await controller.playChapter(id(1));

    pipe.emit(id(1), 'failed', 1);
    expect(controller.content.getState().final).toBe(true);
    expect(pipe.listenerCount(id(1))).toBe(0);
  });
});

describe('sample playback (P1-6)', () => {
  it('pauses the narration for a sample, and resumes it when the sample ends', async () => {
    const { controller, engine, samples } = setupController([fixtureChapter(1, 1, 'ready')]);
    await controller.playChapter(id(1));
    controller.player.play();

    controller.playSample({ kind: 'clip', uri: 'file:///preview.mp3' });
    expect(controller.player.getState().state).toBe('paused');
    expect(controller.sample.getState().playing).toBe(true);

    samples.finish();
    expect(controller.sample.getState().playing).toBe(false);
    expect(controller.player.getState().state).toBe('playing');
    expect(engine.voiceVolume).toBe(1);
  });

  it('does not start narration that was not playing when the sample ends', async () => {
    const { controller, samples } = setupController([fixtureChapter(1, 1, 'ready')]);
    await controller.playChapter(id(1));

    controller.playSample({ kind: 'clip', uri: 'file:///preview.mp3' });
    samples.finish();

    expect(controller.player.getState().state).toBe('paused');
  });

  it('replaces a sample that is playing without resuming the narration in between', async () => {
    const { controller, samples } = setupController([fixtureChapter(1, 1, 'ready')]);
    await controller.playChapter(id(1));
    controller.player.play();

    controller.playSample({ kind: 'clip', uri: 'file:///a.mp3' });
    controller.playSample({ kind: 'speech', text: 'Hello.', language: 'en', voice: null, rate: 1 });

    expect(samples.requests.at(-1)).toMatchObject({ kind: 'speech' });
    expect(controller.player.getState().state).toBe('paused');
    expect(controller.sample.getState().playing).toBe(true);

    samples.finish();
    expect(controller.player.getState().state).toBe('playing');
  });

  it('stopping a sample resumes the narration, and ends it without a second resume', async () => {
    const { controller, samples } = setupController([fixtureChapter(1, 1, 'ready')]);
    await controller.playChapter(id(1));
    controller.player.play();
    controller.playSample({ kind: 'clip', uri: 'file:///a.mp3' });

    controller.stopSample();

    expect(controller.sample.getState().playing).toBe(false);
    expect(controller.player.getState().state).toBe('playing');
    expect(samples.stops).toBe(1);
  });

  it('starting another chapter ends the sample without resuming the old narration', async () => {
    const { controller } = setupController([
      fixtureChapter(1, 1, 'ready'),
      fixtureChapter(2, 2, 'ready'),
    ]);
    await controller.playChapter(id(1));
    controller.player.play();
    controller.playSample({ kind: 'clip', uri: 'file:///a.mp3' });

    await controller.playChapter(id(2));

    expect(controller.sample.getState().playing).toBe(false);
    expect(controller.player.getState().state).toBe('paused');
  });
});

describe('repeat jump timing (P2-14)', () => {
  it('schedules the jump back from the predicted end of the sentence, not at the next position tick', async () => {
    const timers = createVirtualTimers();
    const { controller, engine } = setupController([fixtureChapter(1, 1, 'ready')], null, {
      timers,
    });
    await controller.playChapter(id(1));
    controller.setLoopSentence(0);
    controller.player.play();
    const seek = jest.spyOn(engine, 'seekTo');

    engine.advance(1750);
    timers.advance(249);
    expect(seek).not.toHaveBeenCalled();

    timers.advance(1);
    expect(seek).toHaveBeenCalledWith(0);
    expect(seek).toHaveBeenCalledTimes(1);
  });
});
