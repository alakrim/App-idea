import { Library, Plus } from 'lucide-react-native';
import { useCallback, useMemo } from 'react';
import { FlatList, StyleSheet, View, type ListRenderItemInfo } from 'react-native';

import { EmptyState } from '@/ui/empty-state';
import { IconButton } from '@/ui/icon-button';
import { SegmentedControl, type SegmentedOption } from '@/ui/segmented-control';
import { Text } from '@/ui/text';
import { space, tabBarHeight } from '@/ui/tokens';

import { ContinueCard } from './continue-card';
import {
  continueListening,
  sortLibrary,
  type LibraryEntry,
  type LibrarySort,
} from './library-data';
import { SeriesCard } from './series-card';

const SORT_OPTIONS: readonly SegmentedOption<LibrarySort>[] = [
  { value: 'recent', label: 'Recent' },
  { value: 'title', label: 'Title' },
];
const GRID_COLUMNS = 2;

export interface LibraryViewProps {
  entries: readonly LibraryEntry[];
  sort: LibrarySort;
  onSortChange: (sort: LibrarySort) => void;
  onOpenSeries: (seriesId: string) => void;
  onSeriesMenu: (seriesId: string) => void;
  onPlay: (chapterId: string) => void;
  onCreateSeries: () => void;
}

/** The shelf: a hero for what you were hearing, then the series grid. Pure over its props. */
export function LibraryView({
  entries,
  sort,
  onSortChange,
  onOpenSeries,
  onSeriesMenu,
  onPlay,
  onCreateSeries,
}: LibraryViewProps) {
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={Library}
        title="Your shelf is empty"
        description="Series hold your chapters. Start one, then add the first chapter from a link or a PDF."
        action={{ label: 'New series', icon: Plus, onPress: onCreateSeries }}
      />
    );
  }

  return (
    <ShelfGrid
      {...{ entries, sort, onSortChange, onOpenSeries, onSeriesMenu, onPlay, onCreateSeries }}
    />
  );
}

function ShelfGrid({
  entries,
  sort,
  onSortChange,
  onOpenSeries,
  onSeriesMenu,
  onPlay,
  onCreateSeries,
}: LibraryViewProps) {
  const sorted = useMemo(() => sortLibrary(entries, sort), [entries, sort]);
  const continued = useMemo(() => continueListening(entries), [entries]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<LibraryEntry>) => (
      <View style={styles.cell}>
        <SeriesCard
          series={item.series}
          reachedShare={item.listening?.reachedShare ?? null}
          onOpen={onOpenSeries}
          onMenu={onSeriesMenu}
        />
      </View>
    ),
    [onOpenSeries, onSeriesMenu],
  );

  const header = (
    <View style={styles.header}>
      {continued?.listening ? (
        <ContinueCard
          seriesTitle={continued.series.title}
          coverUri={continued.series.coverUri}
          coverTint={continued.series.coverTint}
          listening={continued.listening}
          onPlay={onPlay}
        />
      ) : null}
      <View style={styles.sectionRow}>
        <View style={styles.sectionTitle}>
          <Text variant="heading" accessibilityRole="header">
            Series
          </Text>
          <Text variant="caption" tone="muted">
            {String(entries.length)}
          </Text>
        </View>
        <IconButton label="New series" icon={Plus} variant="surface" onPress={onCreateSeries} />
      </View>
      <SegmentedControl
        label="Sort series"
        options={SORT_OPTIONS}
        value={sort}
        onChange={onSortChange}
      />
    </View>
  );

  return (
    <FlatList
      data={sorted}
      keyExtractor={(entry) => entry.series.id}
      renderItem={renderItem}
      numColumns={GRID_COLUMNS}
      columnWrapperStyle={styles.row}
      ListHeaderComponent={header}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      removeClippedSubviews
      initialNumToRender={6}
    />
  );
}

const styles = StyleSheet.create({
  header: {
    gap: space.lg,
    paddingBottom: space.lg,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.sm,
  },
  row: {
    gap: space.lg,
    paddingBottom: space.xl,
  },
  cell: {
    flex: 1,
  },
  list: {
    paddingBottom: tabBarHeight + space.xxl,
  },
});
