import { router } from 'expo-router';
import { Pause, Play } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { CoverImage } from '@/ui/cover-image';
import { clampProgress } from '@/ui/progress-ring';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { gutter, hairline, iconSize, iconStrokeWidth, minTouchTarget, radius, space } from '@/ui/tokens';

import { useGlide } from './motion';
import { usePlayback, usePlaybackContent, usePlayerState } from './player-provider';
import { displayText } from './synced-text-pane';

/** A drag upwards this far (px) opens the full player, as does a quick flick. */
const SWIPE_OPEN_DISTANCE = 24;
const SWIPE_OPEN_VELOCITY = -500;
const COVER_SIZE = 40;

export interface NowPlaying {
  title: string;
  subtitle: string;
  coverUri: string | null;
  /** 0 to 1 playback progress, drawn as an amber hairline. */
  progress: number;
  playing: boolean;
}

export const DEMO_NOW_PLAYING: NowPlaying = {
  title: 'The Night Harbour',
  subtitle: 'Chapter 3 · Tavern rain',
  coverUri: null,
  progress: 0.4,
  playing: true,
};

export interface MiniPlayerViewProps {
  /** Null hides the bar. */
  nowPlaying: NowPlaying | null;
  onOpen?: () => void;
  onTogglePlay?: () => void;
}

/** The mini player's look, driven by plain values. Tapping or swiping up opens the full player. */
export function MiniPlayerView({ nowPlaying, onOpen, onTogglePlay }: MiniPlayerViewProps) {
  const { colors } = useTheme();
  const progress = useGlide(clampProgress(nowPlaying?.progress ?? 0));
  const fillStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  if (!nowPlaying) {
    return null;
  }

  const open = () => (onOpen ? onOpen() : router.push('/player'));
  const swipeUp = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetY(-SWIPE_OPEN_DISTANCE / 2)
    .onEnd((event) => {
      if (event.translationY < -SWIPE_OPEN_DISTANCE || event.velocityY < SWIPE_OPEN_VELOCITY) {
        open();
      }
    });

  return (
    <GestureDetector gesture={swipeUp}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Now playing ${nowPlaying.title}, ${nowPlaying.subtitle}. Open player`}
        accessibilityHint="Swipe up to open the full player"
        onPress={open}
        testID="mini-player"
        style={[
          styles.bar,
          { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
        ]}
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
          {onTogglePlay ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={nowPlaying.playing ? 'Pause' : 'Play'}
              onPress={onTogglePlay}
              hitSlop={space.xs}
              style={styles.playButton}
            >
              {nowPlaying.playing ? (
                <Pause size={iconSize.md} strokeWidth={iconStrokeWidth} color={colors.text} />
              ) : (
                <Play size={iconSize.md} strokeWidth={iconStrokeWidth} color={colors.text} />
              )}
            </Pressable>
          ) : null}
        </View>
        <View style={[styles.track, { backgroundColor: colors.border }]}>
          <Animated.View style={[styles.fill, { backgroundColor: colors.accent }, fillStyle]} />
        </View>
      </Pressable>
    </GestureDetector>
  );
}

/** The mini player wired to the playback store. It is hidden until something is loaded. */
export function MiniPlayer() {
  const { player } = usePlayback();
  const nowPlaying = usePlayerState((state) => state.nowPlaying);
  const playState = usePlayerState((state) => state.state);
  const positionMs = usePlayerState((state) => state.positionMs);
  const sentenceIdx = usePlayerState((state) => state.sentenceIdx);
  const durationMs = usePlaybackContent((content) => content.timeline?.totalDurationMs ?? 0);
  const sentence = usePlaybackContent((content) => content.sentences[sentenceIdx]);

  if (nowPlaying === null) {
    return null;
  }

  return (
    <MiniPlayerView
      nowPlaying={{
        title: nowPlaying.title,
        subtitle: sentence ? displayText(sentence) : nowPlaying.seriesTitle,
        coverUri: nowPlaying.coverUri,
        progress: durationMs > 0 ? positionMs / durationMs : 0,
        playing: playState === 'playing' || playState === 'buffering',
      }}
      onTogglePlay={() => player.togglePlay()}
    />
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
  playButton: {
    width: minTouchTarget,
    height: minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    height: hairline,
    marginHorizontal: -space.md,
  },
  fill: {
    height: hairline,
  },
});
