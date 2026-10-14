import { PREVIEW_CACHE_LIMIT, prunePreviews } from './preview-cache';

import type { Directory } from 'expo-file-system';

jest.mock('expo-file-system', () => ({ File: class {}, Directory: class {} }));
jest.mock('@/services/storage', () => ({ previewsDirectory: jest.fn(), writeBytes: jest.fn() }));

interface FakeEntry {
  name: string;
  info(): { modificationTime: number };
  delete: jest.Mock;
}

/** A clip (or other entry) with a modification time, and a delete that records the call. */
function entry(name: string, modificationTime: number): FakeEntry {
  return { name, info: () => ({ modificationTime }), delete: jest.fn() };
}

function directoryOf(entries: FakeEntry[]): Directory {
  return { list: () => entries } as unknown as Directory;
}

describe('preview cache (P3)', () => {
  it('keeps the newest twenty clips, and removes the older ones', () => {
    const clips = Array.from({ length: 22 }, (_, i) => entry(`clip-${i}.mp3`, 1000 + i));

    prunePreviews(directoryOf(clips));

    expect(PREVIEW_CACHE_LIMIT).toBe(20);
    expect(clips[0]?.delete).toHaveBeenCalledTimes(1);
    expect(clips[1]?.delete).toHaveBeenCalledTimes(1);
    for (const kept of clips.slice(2)) expect(kept.delete).not.toHaveBeenCalled();
  });

  it('never removes the consent marker, and counts only clips against the limit', () => {
    const consent = entry('paid-preview-consent', 1);
    const clips = [entry('a.wav', 10), entry('b.mp3', 20), entry('c.mp3', 30)];

    prunePreviews(directoryOf([consent, ...clips]), 2);

    expect(consent.delete).not.toHaveBeenCalled();
    expect(clips[0]?.delete).toHaveBeenCalledTimes(1);
    expect(clips[1]?.delete).not.toHaveBeenCalled();
    expect(clips[2]?.delete).not.toHaveBeenCalled();
  });

  it('leaves the cache alone when it cannot be read', () => {
    const broken = {
      list: () => {
        throw new Error('denied');
      },
    } as unknown as Directory;

    expect(() => prunePreviews(broken)).not.toThrow();
  });
});
