import { File, Paths } from 'expo-file-system';

/**
 * The crash report files, in the app's document directory (which is `filesDir` on Android, where the
 * native side writes them too). The names are a contract with plugins/crash-reporter/CrashReporter.kt.
 */
export const LAST_CRASH_FILE_NAME = 'lectio-last-crash.txt';
export const PREVIOUS_CRASH_FILE_NAME = 'lectio-last-crash.prev.txt';

export interface StoredCrashReport {
  text: string;
  /** `current` is a report not yet shown on launch. `previous` was kept after Continue. */
  kept: 'current' | 'previous';
}

/** Writes the pending report. Synchronous, because it runs while a fatal error is being handled. */
export function writeLastCrashReport(report: string): void {
  new File(Paths.document, LAST_CRASH_FILE_NAME).write(report);
}

/** The most recent report: the pending one if present, otherwise the one kept after Continue. */
export function readLastCrashReport(): StoredCrashReport | null {
  return (
    readReport(LAST_CRASH_FILE_NAME, 'current') ?? readReport(PREVIOUS_CRASH_FILE_NAME, 'previous')
  );
}

function readReport(name: string, kept: StoredCrashReport['kept']): StoredCrashReport | null {
  try {
    const file = new File(Paths.document, name);
    if (!file.exists) return null;
    const text = file.textSync();
    return text.trim().length > 0 ? { text, kept } : null;
  } catch {
    // An unreadable report is not worth failing the Diagnostics screen for.
    return null;
  }
}
