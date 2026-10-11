import {
  SEGMENT_ONE,
  SEGMENT_TWO,
  fixtureChapter,
  flush,
  id,
  setupController,
} from './__fixtures__/playback-fixtures';

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
    expect(engine.ambienceCommands.length).toBeGreaterThan(0);
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

describe('ambience settings', () => {
  it('applies the master switch and the level to the engine, clamped to the engine range', async () => {
    const { controller, engine } = setupController([fixtureChapter(1, 1, 'ready')]);
    const master = jest.spyOn(engine, 'setAmbienceMaster');
    await controller.playChapter(id(1));

    controller.setAmbience({ levelDb: -12 });
    controller.setAmbience({ enabled: false, levelDb: 9 });

    expect(master).toHaveBeenLastCalledWith(false, 0);
    expect(controller.content.getState().ambience).toEqual({ enabled: false, levelDb: 0 });
  });
});
