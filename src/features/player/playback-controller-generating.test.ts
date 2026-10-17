import {
  CUE,
  SEGMENT_ONE,
  SEGMENT_TWO,
  fixtureChapter,
  id,
  setupController,
} from './__fixtures__/playback-fixtures';

describe('a chapter still being narrated', () => {
  it('keeps following a chapter that is waiting for a connection, so its audio is still picked up', async () => {
    const processing = fixtureChapter(1, 1, 'processing', [SEGMENT_ONE]);
    const { controller, pipe, fixture } = setupController([processing]);
    await controller.playChapter(id(1));

    pipe.emit(id(1), 'waiting', 1);
    expect(pipe.listenerCount(id(1))).toBe(1);

    fixture.chapters.set(id(1), { ...processing, segments: [SEGMENT_ONE, SEGMENT_TWO] });
    pipe.emit(id(1), 'waiting', 2);

    expect(controller.content.getState().timeline?.totalDurationMs).toBe(10_000);
    expect(controller.content.getState().final).toBe(false);
  });

  it('exposes the estimated total while generating, and clears it once the chapter is final', async () => {
    const processing = fixtureChapter(1, 1, 'processing', [SEGMENT_ONE]);
    const { controller, pipe } = setupController([processing]);
    await controller.playChapter(id(1));

    pipe.emit(id(1), 'running', 1, { estimatedTotalMs: 60_000, narratedMs: 4000 });
    expect(controller.content.getState().estimatedTotalMs).toBe(60_000);

    pipe.emit(id(1), 'ready', 1);
    expect(controller.content.getState().estimatedTotalMs).toBeNull();
  });

  it('clamps a seek to the end of the audio made so far, not to the estimated length', async () => {
    const processing = fixtureChapter(1, 1, 'processing', [SEGMENT_ONE]);
    const { controller, pipe } = setupController([processing]);
    await controller.playChapter(id(1));
    pipe.emit(id(1), 'running', 1, { estimatedTotalMs: 60_000, narratedMs: 4000 });

    controller.seekToMs(50_000);

    expect(controller.player.getState().positionMs).toBe(4000);
  });

  it('waits at the end of the audio made so far, keeps the ambience, and resumes by itself when the next segment lands', async () => {
    const processing = fixtureChapter(1, 1, 'processing', [SEGMENT_ONE]);
    const { controller, pipe, fixture, engine } = setupController([processing]);
    await controller.playChapter(id(1));
    pipe.emit(id(1), 'running', 1);

    controller.player.play();
    engine.advance(4000);

    expect(controller.player.getState().state).toBe('buffering');
    expect(controller.content.getState().final).toBe(false);
    expect(engine.soundingBedIds()).toEqual([id(900)]);

    fixture.chapters.set(id(1), { ...processing, segments: [SEGMENT_ONE, SEGMENT_TWO] });
    pipe.emit(id(1), 'running', 2);

    expect(controller.player.getState().state).toBe('playing');
    engine.advance(1000);
    expect(controller.player.getState().positionMs).toBe(5000);
    expect(controller.player.getState().sentenceIdx).toBe(2);
  });

  it('starts an ambience bed that covers the current sentence when the analysis lands late, and reports the new cues', async () => {
    const processing = fixtureChapter(2, 2, 'processing', [SEGMENT_ONE]);
    const { controller, pipe, fixture, engine } = setupController([processing]);
    await controller.playChapter(id(2));
    controller.seekToSentence(1);
    controller.player.play();
    expect(engine.soundingBedIds()).toEqual([]);

    const lateCue = { ...CUE, id: id(901), chapterId: id(2) };
    fixture.chapters.set(id(2), { ...processing, cues: [lateCue] });
    pipe.emit(id(2), 'running', 1, {
      stages: [{ stage: 'analyze', status: 'done', progress: 1, since: null, passages: null }],
    });

    expect(controller.content.getState().cues.map((cue) => cue.id)).toEqual([id(901)]);
    expect(engine.soundingBedIds()).toEqual([id(901)]);
    expect(engine.ambienceCommands.at(-1)).toMatchObject({ type: 'start', cueId: id(901) });
  });

  it('reads the cues once per run, however many progress events follow the analysis', async () => {
    const processing = fixtureChapter(2, 2, 'processing', [SEGMENT_ONE]);
    const { controller, pipe, fixture, engine } = setupController([processing]);
    await controller.playChapter(id(2));
    const analysed = [
      {
        stage: 'analyze' as const,
        status: 'done' as const,
        progress: 1,
        since: null,
        passages: null,
      },
    ];
    const setCues = jest.spyOn(engine, 'setCues');

    fixture.chapters.set(id(2), {
      ...processing,
      cues: [{ ...CUE, id: id(901), chapterId: id(2) }],
    });
    pipe.emit(id(2), 'running', 1, { stages: analysed });
    pipe.emit(id(2), 'running', 1, { stages: analysed });

    expect(setCues).toHaveBeenCalledTimes(1);
  });
});
