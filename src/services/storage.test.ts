import * as FileSystem from 'expo-file-system';

import * as fake from './__fixtures__/fake-expo-file-system';
import * as storage from './storage';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-file-system', () => require('./__fixtures__/fake-expo-file-system'));

const CHAPTER = '01HZX0000000000000000000AA';
const OTHER = '01HZX0000000000000000000BB';

beforeEach(() => {
  fake.__entries.clear();
});

describe('directory helpers', () => {
  it('creates the library directories under the document directory on first access', () => {
    const sources = storage.chapterSourcesDirectory(CHAPTER);
    const covers = storage.coversDirectory();

    expect(sources.uri).toBe(`file:///docs/sources/${CHAPTER}`);
    expect(covers.uri).toBe('file:///docs/covers');
    expect(sources.exists).toBe(true);
    expect(covers.exists).toBe(true);
  });

  it('builds audio and preview paths', () => {
    expect(storage.chapterAudioDirectory(CHAPTER).uri).toBe(`file:///docs/audio/${CHAPTER}`);
    expect(storage.previewsDirectory().uri).toBe('file:///docs/previews');
  });

  it.each(['../../etc', 'sources/abc', '', 'short'])(
    'refuses a chapter id that is not a ULID: %j',
    (badId) => {
      expect(() => storage.chapterSourcesDirectory(badId)).toThrow(/non-ULID/);
      expect(() => storage.chapterAudioDirectory(badId)).toThrow(/non-ULID/);
      expect(() => storage.deleteChapterFiles(badId)).toThrow(/non-ULID/);
    },
  );
});

describe('file bytes', () => {
  it('writes and reads bytes, overwriting an existing file', async () => {
    const file = new FileSystem.File(storage.chapterSourcesDirectory(CHAPTER), 'page.html');

    storage.writeBytes(file, new Uint8Array([1, 2, 3]));
    storage.writeBytes(file, new Uint8Array([9, 8]));

    expect(Array.from(await storage.readBytes(file))).toEqual([9, 8]);
  });
});

describe('deleteChapterFiles', () => {
  it('removes the source and audio directories of one chapter only', () => {
    const source = new FileSystem.File(storage.chapterSourcesDirectory(CHAPTER), 'page.html');
    const audio = new FileSystem.File(storage.chapterAudioDirectory(CHAPTER), 'seg-0.mp3');
    const otherAudio = new FileSystem.File(storage.chapterAudioDirectory(OTHER), 'seg-0.mp3');
    storage.writeBytes(source, new Uint8Array([1]));
    storage.writeBytes(audio, new Uint8Array([1]));
    storage.writeBytes(otherAudio, new Uint8Array([1]));

    storage.deleteChapterFiles(CHAPTER);

    expect(source.exists).toBe(false);
    expect(audio.exists).toBe(false);
    expect(otherAudio.exists).toBe(true);
  });

  it('is a no-op when the chapter has no files', () => {
    expect(() => storage.deleteChapterFiles(CHAPTER)).not.toThrow();
  });
});

describe('bytesUsedByLibrary', () => {
  it('sums file sizes per directory and in total', () => {
    storage.writeBytes(
      new FileSystem.File(storage.coversDirectory(), 'a.jpg'),
      new Uint8Array(100),
    );
    storage.writeBytes(
      new FileSystem.File(storage.chapterSourcesDirectory(CHAPTER), 'page.html'),
      new Uint8Array(40),
    );
    storage.writeBytes(
      new FileSystem.File(storage.chapterAudioDirectory(CHAPTER), 'seg-0.mp3'),
      new Uint8Array(25),
    );
    storage.writeBytes(
      new FileSystem.File(storage.chapterAudioDirectory(OTHER), 'seg-0.mp3'),
      new Uint8Array(5),
    );

    expect(storage.bytesUsedByLibrary()).toEqual({
      totalBytes: 170,
      byDirectory: { covers: 100, sources: 40, audio: 30, previews: 0 },
    });
  });

  it('reports zero before anything is stored', () => {
    expect(storage.bytesUsedByLibrary()).toEqual({
      totalBytes: 0,
      byDirectory: { covers: 0, sources: 0, audio: 0, previews: 0 },
    });
  });
});

describe('freeSpaceBytes', () => {
  it('reports the device free space', () => {
    expect(storage.freeSpaceBytes()).toBe(4_096);
  });
});
