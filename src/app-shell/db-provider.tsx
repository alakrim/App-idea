import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { getDatabase } from '@/db/client';
import type { LectioDatabase } from '@/db/client';
import { DbContext } from '@/db/hooks';
import { useLectioMigrations } from '@/db/use-migrations';
import { settingsStore } from '@/features/settings/settings-store';

import { FatalError, formatErrorDetails, hideSplashScreen } from './fatal-error';

export { useDb } from '@/db/hooks';

const OPEN_FAILURE_TITLE = "We couldn't open your library";
const OPEN_FAILURE_MESSAGE =
  'Try again. If it keeps happening, copy the details and send them to us.';

type OpenResult = { db: LectioDatabase } | { error: unknown };

function openLibrary(): OpenResult {
  try {
    return { db: getDatabase() };
  } catch (error) {
    return { error };
  }
}

/**
 * Opens the database, applies migrations and loads the settings before any child renders. The
 * native splash stays up until that finishes. A failure renders a designed error with Try again.
 */
export function DbProvider({ children }: { children: ReactNode }) {
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  // A new key remounts the opener, which reopens the database and reruns the migrations.
  return (
    <LibraryOpener key={attempt} onRetry={retry}>
      {children}
    </LibraryOpener>
  );
}

function LibraryOpener({ children, onRetry }: { children: ReactNode; onRetry: () => void }) {
  const [opened] = useState(openLibrary);

  if ('error' in opened) {
    return <LibraryFailure error={opened.error} onRetry={onRetry} />;
  }
  return (
    <LibraryMigrator db={opened.db} onRetry={onRetry}>
      {children}
    </LibraryMigrator>
  );
}

function LibraryMigrator({
  db,
  children,
  onRetry,
}: {
  db: LectioDatabase;
  children: ReactNode;
  onRetry: () => void;
}) {
  const migration = useLectioMigrations(db);
  const hydrated = settingsStore.useSettingsState((state) => state.hydrated);

  useEffect(() => {
    // A read failure here throws out of the effect, which the root ErrorBoundary catches.
    if (migration.success) settingsStore.hydrate(db);
  }, [db, migration.success]);

  useEffect(() => {
    if (hydrated) hideSplashScreen();
  }, [hydrated]);

  if (migration.error !== undefined) {
    return <LibraryFailure error={migration.error} onRetry={onRetry} />;
  }
  if (!hydrated) {
    return null;
  }
  return <DbContext.Provider value={db}>{children}</DbContext.Provider>;
}

function LibraryFailure({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  useEffect(() => {
    hideSplashScreen();
  }, []);

  return (
    <FatalError
      title={OPEN_FAILURE_TITLE}
      message={OPEN_FAILURE_MESSAGE}
      details={formatErrorDetails('opening the library', error)}
      onRetry={onRetry}
    />
  );
}
