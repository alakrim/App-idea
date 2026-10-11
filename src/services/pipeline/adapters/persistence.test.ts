import { DEFAULT_NARRATION } from '@/core/defaults';
import { StageFailure } from '@/core/pipeline/errors';
import type { NarrationSettings } from '@/core/settings';
import { chapterRow, id, seriesRow, T0 } from '@/db/__fixtures__/factories';
import { createTestDb } from '@/db/__fixtures__/test-db';
import { audioSegmentRepo } from '@/db/repos/audio-segment-repo';
import { chapterRepo } from '@/db/repos/chapter-repo';
import { narrationProfileRepo } from '@/db/repos/narration-profile-repo';
import { seriesRepo } from '@/db/repos/series-repo';
import { settingsRepo } from '@/db/repos/settings-repo';

import { createMemoryLibraryFiles } from '../__fixtures__/memory-library-files';
import { narrationProfileFor, narrationProfileId } from '../narration-id';
import { createAudioFiles, removeSegmentFilesFrom } from './audio-files';
import { createCatalog, supportsStyle } from './catalog';
import { createChapterStore } from './chapter-store';
import { createJobStore, QUEUE_SETTING_KEY } from './job-store';
import { fileNameOf } from './pdf-text-source';
import { createTts } from './tts';

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/u;
const NARRATION: NarrationSettings = { ...DEFAULT_NARRATION, style: 'Calm.' } as NarrationSettings;

describe('narrationProfileId', () => {
  it('is a valid id, the same for the same voice settings, and different when a setting changes', () => {
    const id1 = narrationProfileId(NARRATION);
    expect(id1).toMatch(ULID);
    expect(narrationProfileId({ ...NARRATION })).toBe(id1);
    expect(narrationProfileId({ ...NARRATION, voice: 'Puck' })).not.toBe(id1);
    expect(narrationProfileId({ ...NARRATION, speed: 1.1 })).not.toBe(id1);
    expect(narrationProfileId({ ...NARRATION, style: null })).not.toBe(id1);
  });

  it('builds a profile whose name says the voice and the model', () => {
    const profile = narrationProfileFor(NARRATION);
    expect(profile.name).toBe(`Kore (${DEFAULT_NARRATION.model})`);
    expect(profile.id).toBe(narrationProfileId(NARRATION));
  });
});

describe('supportsStyle', () => {
  it('is true for Gemini TTS models and for models that list the instructions parameter', () => {
    expect(supportsStyle({ id: 'google/gemini-3.8-flash-lite-tts', supportedParameters: [] })).toBe(
      true,
    );
    expect(supportsStyle({ id: 'vendor/voice', supportedParameters: ['instructions'] })).toBe(true);
    expect(supportsStyle({ id: 'hexgrad/kokoro-82m', supportedParameters: [] })).toBe(false);
    expect(supportsStyle({ id: 'google/gemini-flash', supportedParameters: [] })).toBe(false);
  });
});

describe('removeSegmentFilesFrom', () => {
  it('removes the segment files from an index on, and leaves earlier segments and other files', async () => {
    const files = createMemoryLibraryFiles();
    const chapterId = id(9);
    const audio = createAudioFiles(files);
    for (const idx of [0, 1, 2, 3]) await audio.write(chapterId, idx, new Uint8Array([idx]), 'mp3');
    await files.write(`audio/${chapterId}/notes.txt`, 'keep me');

    await removeSegmentFilesFrom(files, chapterId, 2);

    expect([...files.entries.keys()].sort()).toEqual(
      [
        `audio/${chapterId}/0.mp3`,
        `audio/${chapterId}/1.mp3`,
        `audio/${chapterId}/notes.txt`,
      ].sort(),
    );
  });
});

describe('createJobStore queue persistence', () => {
  it('saves the queue with its options and reads it back', async () => {
    const { db } = createTestDb();
    const store = createJobStore({ db, clock: { now: () => T0 } });
    await store.saveQueue([
      { chapterId: id(1) },
      { chapterId: id(2), from: 'narrate', force: true, pdfEngine: 'mistral-ocr' },
    ]);
    expect(await store.loadQueue()).toEqual([
      { chapterId: id(1) },
      { chapterId: id(2), from: 'narrate', force: true, pdfEngine: 'mistral-ocr' },
    ]);
  });

  it('drops a malformed entry on its own, and an unreadable queue entirely', async () => {
    const { db } = createTestDb();
    const store = createJobStore({ db, clock: { now: () => T0 } });
    db.run(
      `INSERT INTO settings (key, value, updated_at) VALUES ('${QUEUE_SETTING_KEY}', '[{"chapterId":"a"},{"from":"nope"},{"chapterId":"b","from":"clean"}]', 0)`,
    );
    expect(await store.loadQueue()).toEqual([
      { chapterId: 'a' },
      { chapterId: 'b', from: 'clean' },
    ]);

    db.run(`UPDATE settings SET value = 'not json' WHERE key = '${QUEUE_SETTING_KEY}'`);
    expect(await store.loadQueue()).toEqual([]);
  });

  it('keeps the queue setting out of the user settings', async () => {
    const { db } = createTestDb();
    const store = createJobStore({ db, clock: { now: () => T0 } });
    await store.saveQueue([{ chapterId: id(1) }]);
    expect(Object.keys(settingsRepo.getSettings(db))).not.toContain(QUEUE_SETTING_KEY);
  });
});

describe('createChapterStore', () => {
  function setup() {
    const { db } = createTestDb();
    seriesRepo.insert(db, seriesRow(1));
    chapterRepo.insert(db, chapterRow(1, 1, 1, { status: 'processing' }));
    const files = createMemoryLibraryFiles();
    let counter = 0;
    const store = createChapterStore({
      db,
      clock: { now: () => T0 + 1 },
      ids: () => id(500 + (counter += 1)),
      files,
    });
    return { db, files, store };
  }

  it('loads the chapter with its series and upserts the narration profile from the settings', async () => {
    const { db, store } = setup();
    const record = await store.load(id(1));
    expect(record?.chapter.id).toBe(id(1));
    expect(record?.narration.id).toBe(narrationProfileId(settingsRepo.getSettings(db).narration));
    expect(narrationProfileRepo.get(db, record?.narration.id ?? '')).toEqual(record?.narration);
    expect(await store.load(id(99))).toBeNull();
  });

  it('stores null for the sentences that fell back to the source text', async () => {
    const { store } = setup();
    await store.replaceText(id(1), {
      paragraphs: [{ idx: 0, sentenceStart: 0, sentenceEnd: 2, kind: 'text', text: 'a b' }],
      sentences: [
        { idx: 0, paragraphIdx: 0, kind: 'text', text: 'A.', charCount: 2 },
        { idx: 1, paragraphIdx: 0, kind: 'text', text: 'B.', charCount: 2 },
      ],
    });
    await store.setTranslations(id(1), new Map([[0, 'Uno.']]), [1]);
    const stored = await store.getSentences(id(1));
    expect(stored.map((s) => s.translated)).toEqual(['Uno.', null]);
  });

  it('deletes the rows and the files of the segments past a shrinking end', async () => {
    const { db, files, store } = setup();
    // Loading the chapter upserts its narration profile, which the segments reference.
    await store.load(id(1));
    const audio = createAudioFiles(files);
    for (const idx of [0, 1, 2]) {
      await audio.write(id(1), idx, new Uint8Array([idx]), 'mp3');
      await store.saveAudioSegment({
        id: id(700 + idx),
        chapterId: id(1),
        idx,
        sentenceStart: idx,
        sentenceEnd: idx,
        fileUri: `mem://audio/${id(1)}/${idx}.mp3`,
        durationMs: 1000,
        sentenceOffsetsMs: [0],
        profileId: narrationProfileId(settingsRepo.getSettings(db).narration),
        inputHash: 'h',
      });
    }
    await store.deleteAudioFrom(id(1), 1);
    expect(audioSegmentRepo.listByChapter(db, id(1)).map((s) => s.idx)).toEqual([0]);
    expect([...files.entries.keys()]).toEqual([`audio/${id(1)}/0.mp3`]);
  });

  it('sets the chapter metadata and only the fields it is given', async () => {
    const { db, store } = setup();
    await store.setMeta(id(1), { title: 'Renamed', wordCount: 420 });
    const chapter = chapterRepo.get(db, id(1));
    expect(chapter).toMatchObject({ title: 'Renamed', wordCount: 420, sourceLang: 'en' });
  });
});

describe('fileNameOf and the device voice', () => {
  it('reads the file name from a library URI, decoded and without a query', () => {
    expect(fileNameOf('file:///data/inbox/My%20Book.pdf?x=1')).toBe('My Book.pdf');
    expect(fileNameOf('')).toBe('document.pdf');
  });

  it('refuses the device voice for stored narration, with a message that says what to do', async () => {
    const tts = createTts({ openrouter: { synthesizeSpeech: jest.fn() } as never });
    const error = await tts
      .synthesize({
        text: 'Hello.',
        profile: { ...narrationProfileFor(NARRATION), provider: 'device' },
        signal: new AbortController().signal,
      })
      .catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(StageFailure);
    expect((error as StageFailure).error).toMatchObject({
      code: 'MODEL_UNAVAILABLE',
      retryable: false,
    });
  });

  it('treats a catalog that cannot be read as an empty catalog', async () => {
    const catalog = createCatalog({
      openrouter: {
        models: { list: async () => Promise.reject(new Error('offline')) } as never,
      },
    });
    await expect(catalog.find('vendor/model')).resolves.toBeNull();
  });
});
