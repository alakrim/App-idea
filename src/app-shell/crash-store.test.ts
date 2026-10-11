import {
  LAST_CRASH_FILE_NAME,
  PREVIOUS_CRASH_FILE_NAME,
  readLastCrashReport,
  writeLastCrashReport,
} from './crash-store';

// An in-memory document directory, shaped like the parts of expo-file-system's File API the store uses.
const mockFiles = new Map<string, string>();

jest.mock('expo-file-system', () => {
  class File {
    readonly uri: string;

    constructor(directory: { uri: string }, name: string) {
      this.uri = `${directory.uri}/${name}`;
    }

    get exists(): boolean {
      return mockFiles.has(this.uri);
    }

    textSync(): string {
      const text = mockFiles.get(this.uri);
      if (text === undefined) throw new Error('missing');
      return text;
    }

    write(content: string): void {
      mockFiles.set(this.uri, content);
    }
  }
  return { File, Paths: { document: { uri: 'file:///files' } } };
});

const CURRENT = `file:///files/${LAST_CRASH_FILE_NAME}`;
const PREVIOUS = `file:///files/${PREVIOUS_CRASH_FILE_NAME}`;

beforeEach(() => {
  mockFiles.clear();
});

describe('writeLastCrashReport', () => {
  it('writes the pending report to the crash file', () => {
    writeLastCrashReport('Lectio crash report\nboom');

    expect(mockFiles.get(CURRENT)).toBe('Lectio crash report\nboom');
  });
});

describe('readLastCrashReport', () => {
  it('returns null when no report was kept', () => {
    expect(readLastCrashReport()).toBeNull();
  });

  it('prefers the pending report over the kept one', () => {
    mockFiles.set(CURRENT, 'pending');
    mockFiles.set(PREVIOUS, 'kept');

    expect(readLastCrashReport()).toEqual({ text: 'pending', kept: 'current' });
  });

  it('falls back to the kept report after Continue', () => {
    mockFiles.set(PREVIOUS, 'kept');

    expect(readLastCrashReport()).toEqual({ text: 'kept', kept: 'previous' });
  });

  it('ignores a blank file', () => {
    mockFiles.set(CURRENT, '   \n');
    mockFiles.set(PREVIOUS, 'kept');

    expect(readLastCrashReport()).toEqual({ text: 'kept', kept: 'previous' });
  });
});
