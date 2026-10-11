import { Pause, Play, RotateCcw, RotateCw } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { impactHaptic } from '@/ui/haptics';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { iconStrokeWidth, opacity, radius, space, transparent } from '@/ui/tokens';
import { usePressScale } from '@/ui/use-press-scale';

import { PLAYER } from './layout';

import type { LucideIcon } from 'lucide-react-native';

export interface TransportProps {
  playing: boolean;
  /** Loading or buffering. The play button shows it as busy. */
  busy: boolean;
  onTogglePlay: () => void;
  onSkip: (deltaMs: number) => void;
  onSentence: (direction: 'next' | 'previous') => void;
}

const BACK_MS = 15_000;
const FORWARD_MS = 30_000;

/** Back 15 s, play or pause, and forward 30 s. Holding a skip moves by sentence instead. */
export function Transport({ playing, busy, onTogglePlay, onSkip, onSentence }: TransportProps) {
  return (
    <View style={styles.row}>
      <SkipButton
        label="Back 15 seconds"
        hint="Hold to go to the previous sentence"
        icon={RotateCcw}
        seconds={15}
        onPress={() => onSkip(-BACK_MS)}
        onLongPress={() => onSentence('previous')}
      />
      <PlayButton playing={playing} busy={busy} onPress={onTogglePlay} />
      <SkipButton
        label="Forward 30 seconds"
        hint="Hold to go to the next sentence"
        icon={RotateCw}
        seconds={30}
        onPress={() => onSkip(FORWARD_MS)}
        onLongPress={() => onSentence('next')}
      />
    </View>
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
        style={[
          styles.skip,
          { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
        ]}
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
}

function PlayButton({ playing, busy, onPress }: PlayButtonProps) {
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
