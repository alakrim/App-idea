import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { CoverImage } from '@/ui/cover-image';
import { clampProgress } from '@/ui/progress-ring';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { gutter, hairline, radius, space } from '@/ui/tokens';

export interface NowPlaying {
  title: string;
  subtitle: string;
  coverUri: string | null;
  /** 0 to 1 playback progress, drawn as an amber hairline. */
  progress: number;
}

export const DEMO_NOW_PLAYING: NowPlaying = {
  title: 'The Night Harbour',
  subtitle: 'Chapter 3 · Tavern rain',
  coverUri: null,
  progress: 0.4,
};

const COVER_SIZE = 40;

export interface MiniPlayerProps {
  /** Null hides the bar. Playback state arrives with the audio brief. */
  nowPlaying: NowPlaying | null;
}

/** Persistent bar above the tab bar. Tapping it opens the full player. */
export function MiniPlayer({ nowPlaying }: MiniPlayerProps) {
  const { colors } = useTheme();

  if (!nowPlaying) {
    return null;
  }

  const percent = Math.round(clampProgress(nowPlaying.progress) * 100);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Now playing ${nowPlaying.title}, ${nowPlaying.subtitle}. Open player`}
      onPress={() => router.push('/player')}
      style={[styles.bar, { backgroundColor: colors.surfaceRaised, borderTopColor: colors.border }]}
    >
      <View style={styles.row}>
        <CoverImage uri={nowPlaying.coverUri} title={nowPlaying.title} style={styles.cover} />
        <View style={styles.copy}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {nowPlaying.title}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {nowPlaying.subtitle}
          </Text>
        </View>
      </View>
      <View style={[styles.track, { backgroundColor: colors.border }]}>
        <View style={[styles.fill, { backgroundColor: colors.accent, width: `${percent}%` }]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    marginHorizontal: gutter,
    marginTop: space.sm,
    marginBottom: space.xs,
    borderRadius: radius.lg,
    borderWidth: hairline,
    overflow: 'hidden',
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    gap: space.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  cover: {
    width: COVER_SIZE,
  },
  copy: {
    flex: 1,
    gap: space.xxs,
  },
  track: {
    height: hairline,
    marginHorizontal: -space.md,
  },
  fill: {
    height: hairline,
  },
});
