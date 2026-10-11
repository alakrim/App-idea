import { readLibrary, type LibraryEntry } from './library-data';
import { useLiveRead } from '@/db/hooks';

const LIBRARY_TABLES = ['series', 'chapters', 'listening_positions'];

/** The live library: series, chapter totals and listening state. Re-reads when they change. */
export function useLibrary(): LibraryEntry[] {
  return useLiveRead(readLibraryForKey, LIBRARY_TABLES, null);
}

// The library has no key, so the read ignores the one it is given.
function readLibraryForKey(db: Parameters<typeof readLibrary>[0], _key: null): LibraryEntry[] {
  return readLibrary(db);
}
