import { LinearGradient } from 'expo-linear-gradient';
import { Play } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { withAlpha } from '@/features/shared/color';
import { CoverImage } from '@/ui/cover-image';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import {
  hairline,
  iconSize,
  iconStrokeWidth,
  minTouchTarget,
  radius,
  space,
  transparent,
} from '@/ui/tokens';
import { usePressScale } from '@/ui/use-press-scale';

import type { ListeningState } from './library-data';

/** Cover width inside the hero. The hero reads as a card, so the cover stays modest. */
const HERO_COVER_WIDTH = 92;
const PLAY_SIZE = minTouchTarget;
/** How strongly the cover colour washes the hero, by theme. Light themes need less. */
const WASH_ALPHA = { dark: 0.42, light: 0.2 } as const;

export interface ContinueCardProps {
  seriesTitle: string;
  coverUri: string | null;
  /** The cover's average colour, or null for the neutral wash. */
  coverTint: string | null;
  listening: ListeningState;
  onPlay: (chapterId: string) => void;
}

/** The "Continue listening" hero: the chapter last played, one tap from the player. */
export function ContinueCard({
  seriesTitle,
  coverUri,
  coverTint,
  listening,
  onPlay,
}: ContinueCardProps) {
  const { colors, scheme } = useTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressScale();
  const position = `Chapter ${listening.chapterNumber} of ${listening.chapterCount}`;

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Continue listening: ${listening.chapterTitle}, ${position}, ${seriesTitle}`}
        accessibilityHint="Opens the player"
        onPress={() => onPlay(listening.chapterId)}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
      >
        {coverTint ? (
          <LinearGradient
            pointerEvents="none"
            colors={[withAlpha(coverTint, WASH_ALPHA[scheme]), withAlpha(coverTint, 0)]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <View style={styles.row}>
          <CoverImage uri={coverUri} title={seriesTitle} style={styles.cover} />
          <View style={styles.copy}>
            <Text variant="micro" tone="accent">
              Continue listening
            </Text>
            <Text variant="heading" numberOfLines={2}>
              {listening.chapterTitle}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {`${seriesTitle} · ${position}`}
            </Text>
            <View style={styles.footer}>
              <View style={[styles.track, { backgroundColor: colors.border }]}>
                <View
                  style={[
                    styles.fill,
                    { backgroundColor: colors.accent, width: `${listening.reachedShare * 100}%` },
                  ]}
                />
              </View>
              <View style={[styles.play, { backgroundColor: colors.accent }]}>
                <Play
                  size={iconSize.sm}
                  strokeWidth={iconStrokeWidth}
                  color={colors.onAccent}
                  fill={colors.onAccent}
                />
              </View>
            </View>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderTopColor: transparent,
    overflow: 'hidden',
    padding: space.lg,
  },
  row: {
    flexDirection: 'row',
    gap: space.lg,
    alignItems: 'center',
  },
  cover: {
    width: HERO_COVER_WIDTH,
  },
  copy: {
    flex: 1,
    gap: space.xs,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginTop: space.sm,
  },
  track: {
    flex: 1,
    height: space.xxs,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  fill: {
    height: space.xxs,
  },
  play: {
    width: PLAY_SIZE,
    height: PLAY_SIZE,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
