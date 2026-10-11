import { router } from 'expo-router';
import { useCallback, useState } from 'react';

import { deleteSeries } from '@/features/series/series-service';
import { useSeriesDeps } from '@/features/series/use-series-deps';
import { ConfirmSheet } from '@/features/shared/confirm-sheet';
import { SeriesActionsSheet } from '@/features/shared/series-actions-sheet';
import { Screen } from '@/ui/screen';

import { LibraryView } from './library-view';
import { useLibrary } from './use-library';

import type { LibrarySort } from './library-data';

/** The Library tab: live data, the sort choice, and the long-press menu for a series. */
export function LibraryScreen() {
  const entries = useLibrary();
  const deps = useSeriesDeps();
  const [sort, setSort] = useState<LibrarySort>('recent');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [deleteFor, setDeleteFor] = useState<string | null>(null);

  const menuEntry = entries.find((entry) => entry.series.id === menuFor) ?? null;
  const deleteEntry = entries.find((entry) => entry.series.id === deleteFor) ?? null;

  const openSeries = useCallback((seriesId: string) => {
    router.push({ pathname: '/series/[seriesId]', params: { seriesId } });
  }, []);

  const playChapter = useCallback((chapterId: string) => {
    router.push({ pathname: '/player', params: { chapterId } });
  }, []);

  return (
    <Screen title="Library" scrollable={false}>
      <LibraryView
        entries={entries}
        sort={sort}
        onSortChange={setSort}
        onOpenSeries={openSeries}
        onSeriesMenu={setMenuFor}
        onPlay={playChapter}
        onCreateSeries={() => router.push('/series/new')}
      />

      <SeriesActionsSheet
        visible={menuEntry !== null}
        seriesTitle={menuEntry?.series.title ?? ''}
        onClose={() => setMenuFor(null)}
        onEdit={() => {
          if (menuEntry) {
            setMenuFor(null);
            router.push({
              pathname: '/series/[seriesId]/edit',
              params: { seriesId: menuEntry.series.id },
            });
          }
        }}
        onDelete={() => {
          setDeleteFor(menuFor);
          setMenuFor(null);
        }}
      />

      <ConfirmSheet
        visible={deleteEntry !== null}
        title={`Delete ${deleteEntry?.series.title ?? 'series'}?`}
        message="Its chapters, text and audio are removed from this device. This cannot be undone."
        confirmLabel="Delete series"
        destructive
        onCancel={() => setDeleteFor(null)}
        onConfirm={() => {
          if (deleteFor !== null) deleteSeries(deps, deleteFor);
          setDeleteFor(null);
        }}
      />
    </Screen>
  );
}
