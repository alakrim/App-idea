import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import type { SeriesSummary } from '@/db/repos/series-repo';
import { formatSeriesSummary } from '@/features/shared/format';
import { CoverImage } from '@/ui/cover-image';
import { IconButton } from '@/ui/icon-button';
import { Ellipsis } from '@/ui/icons';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { radius, space } from '@/ui/tokens';
import { usePressScale } from '@/ui/use-press-scale';

/** The listening hairline under each cover. Thin enough to read as a detail, not a bar. */
const PROGRESS_HEIGHT = 2;

export interface SeriesCardProps {
  series: SeriesSummary;
  /** 0..1 share of the series reached by listening. Null when nothing has been played. */
  reachedShare: number | null;
  onOpen: (seriesId: string) => void;
  onMenu: (seriesId: string) => void;
}

/** One series on the shelf: a 2:3 cover, a listening hairline, the title and a quiet summary line. */
export const SeriesCard = memo(function SeriesCard({
  series,
  reachedShare,
  onOpen,
  onMenu,
}: SeriesCardProps) {
  const { colors } = useTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressScale();
  const summary = formatSeriesSummary(series.chapterCount, series.totalDurationMs);
  const share = reachedShare === null ? 0 : Math.min(1, Math.max(0, reachedShare));
  const listening = reachedShare === null ? '' : `, ${Math.round(share * 100)} percent listened`;

  return (
    <Animated.View style={[styles.cell, animatedStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${series.title}, ${summary}${listening}`}
        accessibilityHint="Opens the series. Series actions are in the menu."
        accessibilityActions={[{ name: 'menu', label: 'Series actions' }]}
        onAccessibilityAction={() => onMenu(series.id)}
        delayLongPress={350}
        onPress={() => onOpen(series.id)}
        onLongPress={() => onMenu(series.id)}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={styles.cell}
      >
        <View style={styles.coverFrame}>
          <CoverImage uri={series.coverUri} title={series.title} style={styles.cover} />
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, styles.coverEdge, { borderColor: colors.border }]}
          />
        </View>
        <View style={[styles.track, { backgroundColor: colors.border }]}>
          <View
            style={[styles.fill, { backgroundColor: colors.accent, width: `${share * 100}%` }]}
          />
        </View>
        <Text variant="bodyStrong" numberOfLines={2}>
          {series.title}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {summary}
        </Text>
      </Pressable>
      <View style={styles.menu}>
        <IconButton
          label={`Series actions for ${series.title}`}
          icon={Ellipsis}
          variant="surface"
          onPress={() => onMenu(series.id)}
        />
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  cell: {
    flex: 1,
    gap: space.sm,
  },
  menu: {
    position: 'absolute',
    top: space.xs,
    right: space.xs,
  },
  coverFrame: {
    width: '100%',
  },
  cover: {
    width: '100%',
  },
  coverEdge: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  track: {
    height: PROGRESS_HEIGHT,
    borderRadius: PROGRESS_HEIGHT,
    overflow: 'hidden',
  },
  fill: {
    height: PROGRESS_HEIGHT,
  },
});
