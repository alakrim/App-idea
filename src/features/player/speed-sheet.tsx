import { Pressable, StyleSheet, View } from 'react-native';

import { PLAYBACK_RATE_RANGE, PLAYBACK_RATE_STEP } from '@/core/playback/ranges';
import { Sheet } from '@/ui/sheet';
import { Slider } from '@/ui/slider';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { minTouchTarget, radius, space } from '@/ui/tokens';

import { formatRate } from './format';
import { usePlayback, usePlayerState } from './player-provider';

const RATE_MIN = PLAYBACK_RATE_RANGE.min;
const RATE_MAX = PLAYBACK_RATE_RANGE.max;
const RATE_STEP = PLAYBACK_RATE_STEP;
/** Presets for the common listening speeds. */
export const RATE_PRESETS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

export interface SpeedSheetProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * The speed of the narration. Moving the slider changes it at once, and the value is saved for the
 * series when the finger lifts, so each series keeps its own speed.
 */
export function SpeedSheet({ visible, onClose }: SpeedSheetProps) {
  const { colors } = useTheme();
  const playback = usePlayback();
  const { player } = playback;
  const rate = usePlayerState((state) => state.rate);

  return (
    <Sheet visible={visible} onClose={onClose} title="Speed" snapPoints={['56%']}>
      <Text variant="display" align="center" style={styles.readout}>
        {formatRate(rate)}
      </Text>
      <Text variant="caption" tone="muted" align="center" accessibilityLiveRegion="polite">
        Saved for this series
      </Text>
      <Slider
        label="Playback speed"
        value={rate}
        min={RATE_MIN}
        max={RATE_MAX}
        step={RATE_STEP}
        formatValue={formatRate}
        minimumLabel={formatRate(RATE_MIN)}
        maximumLabel={formatRate(RATE_MAX)}
        onValueChange={(next) => player.setRate(next)}
        onValueCommit={() => playback.saveRateForSeries()}
      />
      <View style={styles.presets}>
        {RATE_PRESETS.map((preset) => {
          const selected = Math.abs(rate - preset) < RATE_STEP / 2;
          return (
            <Pressable
              key={preset}
              accessibilityRole="radio"
              accessibilityLabel={`Speed ${formatRate(preset)}`}
              accessibilityState={{ checked: selected }}
              onPress={() => {
                player.setRate(preset);
                playback.saveRateForSeries();
              }}
              style={[
                styles.preset,
                {
                  backgroundColor: selected ? colors.accentSoft : colors.surfaceRaised,
                  borderColor: selected ? colors.accent : colors.border,
                },
              ]}
            >
              <Text variant="caption" tone={selected ? 'accent' : 'muted'}>
                {formatRate(preset)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  readout: {
    fontVariant: ['tabular-nums'],
  },
  presets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  preset: {
    flexBasis: '30%',
    flexGrow: 1,
    minHeight: minTouchTarget,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
