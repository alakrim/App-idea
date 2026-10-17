import { Pressable, StyleSheet, View, type AccessibilityActionEvent } from 'react-native';
import Animated from 'react-native-reanimated';

import { impactHaptic } from '@/ui/haptics';
import { Bookmark, Pause, Play, RotateCcw, RotateCw } from '@/ui/icons';
import type { LucideIcon } from '@/ui/icons';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { iconStrokeWidth, opacity, radius, space, transparent } from '@/ui/tokens';
import { usePressScale } from '@/ui/use-press-scale';

import { PLAYER } from './layout';
import { NarratingAhead } from './narrating-ahead';

export interface TransportProps {
  playing: boolean;
  /** Loading or buffering. The play button shows it as busy. */
  busy: boolean;
  /** Playback is waiting for narration that is still being made. Shown beneath the controls. */
  narratingAhead?: boolean;
  /** True when the sentence in view is bookmarked. */
  bookmarked: boolean;
  onTogglePlay: () => void;
  onSkip: (deltaMs: number) => void;
  onSentence: (direction: 'next' | 'previous') => void;
  onBookmark: () => void;
}

const BACK_MS = 15_000;
const FORWARD_MS = 30_000;

/**
 * Back 15 s, play or pause, and forward 30 s, with the bookmark at the right end. Holding a skip
 * moves by sentence instead. A spacer of the bookmark's width at the left keeps play centred. The
 * line beneath keeps its height, so the controls never move when "Narrating ahead" comes and goes.
 */
export function Transport({
  playing,
  busy,
  narratingAhead = false,
  bookmarked,
  onTogglePlay,
  onSkip,
  onSentence,
  onBookmark,
}: TransportProps) {
  return (
    <View style={styles.stack}>
    <View style={styles.row}>
      <View style={styles.bookmarkSpacer} />
      <SkipButton
        label="Back 15 seconds"
        hint="Hold to go to the previous sentence"
        icon={RotateCcw}
        seconds={15}
        onPress={() => onSkip(-BACK_MS)}
        onLongPress={() => onSentence('previous')}
      />
      <PlayButton
        playing={playing}
        busy={busy && !narratingAhead}
        onPress={onTogglePlay}
        onSentence={onSentence}
      />
      <SkipButton
        label="Forward 30 seconds"
        hint="Hold to go to the next sentence"
        icon={RotateCw}
        seconds={30}
        onPress={() => onSkip(FORWARD_MS)}
        onLongPress={() => onSentence('next')}
      />
      <BookmarkButton bookmarked={bookmarked} onPress={onBookmark} />
    </View>
      <View style={styles.ahead}>{narratingAhead ? <NarratingAhead /> : null}</View>
    </View>
  );
}

interface BookmarkButtonProps {
  bookmarked: boolean;
  onPress: () => void;
}

function BookmarkButton({ bookmarked, onPress }: BookmarkButtonProps) {
  const { colors } = useTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressScale();
  const label = bookmarked ? 'Remove bookmark' : 'Bookmark this sentence';

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={
          bookmarked
            ? 'Removes the bookmark from this sentence'
            : 'Saves this moment to come back to'
        }
        accessibilityState={{ selected: bookmarked }}
        onPress={() => {
          impactHaptic();
          onPress();
        }}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={[
          styles.bookmark,
          { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
        ]}
      >
        <Bookmark
          size={PLAYER.skipIconSize}
          strokeWidth={iconStrokeWidth}
          color={bookmarked ? colors.accent : colors.text}
          fill={bookmarked ? colors.accent : transparent}
        />
      </Pressable>
    </Animated.View>
  );
}

interface SkipButtonProps {
  label: string;
  hint: string;
  icon: LucideIcon;
  seconds: number;
  onPress: () => void;
  onLongPress: () => void;
}

function SkipButton({ label, hint, icon: Icon, seconds, onPress, onLongPress }: SkipButtonProps) {
  const { colors } = useTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressScale();

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={hint}
        onPress={() => {
          impactHaptic();
          onPress();
        }}
        onLongPress={() => {
          impactHaptic();
          onLongPress();
        }}
        delayLongPress={350}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={[styles.skip, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
      >
        <Icon size={PLAYER.skipIconSize} strokeWidth={iconStrokeWidth} color={colors.text} />
        <Text variant="micro" style={styles.skipSeconds} importantForAccessibility="no">
          {String(seconds)}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

interface PlayButtonProps {
  playing: boolean;
  busy: boolean;
  onPress: () => void;
  onSentence: (direction: 'next' | 'previous') => void;
}

/** Screen readers step by sentence from this button, since the long press is invisible to them (P2-18). */
const SENTENCE_STEP_ACTIONS = [
  { name: 'previous', label: 'Previous sentence' },
  { name: 'next', label: 'Next sentence' },
] as const;

function PlayButton({ playing, busy, onPress, onSentence }: PlayButtonProps) {
  const { colors } = useTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressScale();
  const Icon: LucideIcon = playing ? Pause : Play;
  const label = playing ? 'Pause' : 'Play';

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ busy, disabled: false }}
        accessibilityActions={SENTENCE_STEP_ACTIONS}
        onAccessibilityAction={(event: AccessibilityActionEvent) => {
          const { actionName: name } = event.nativeEvent;
          if (name === 'previous' || name === 'next') onSentence(name);
        }}
        onPress={() => {
          impactHaptic();
          onPress();
        }}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={[styles.play, { backgroundColor: colors.accent }, busy ? styles.busy : null]}
      >
        <Icon
          size={PLAYER.playIconSize}
          strokeWidth={iconStrokeWidth}
          color={colors.onAccent}
          fill={playing ? transparent : colors.onAccent}
        />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: space.md,
  },
  ahead: {
    height: space.lg,
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
  },
  skip: {
    width: PLAYER.skipButtonSize,
    height: PLAYER.skipButtonSize,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipSeconds: {
    position: 'absolute',
    bottom: space.xs,
  },
  bookmark: {
    width: PLAYER.skipButtonSize,
    height: PLAYER.skipButtonSize,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookmarkSpacer: {
    width: PLAYER.skipButtonSize,
    height: PLAYER.skipButtonSize,
  },
  play: {
    width: PLAYER.playButtonSize,
    height: PLAYER.playButtonSize,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  busy: {
    opacity: opacity.pressed,
  },
});
