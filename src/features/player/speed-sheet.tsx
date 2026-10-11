import { Pressable, StyleSheet, View } from 'react-native';

import { Sheet } from '@/ui/sheet';
import { Slider } from '@/ui/slider';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { minTouchTarget, radius, space } from '@/ui/tokens';

import { formatRate } from './format';
import { usePlayback, usePlayerState } from './player-provider';

export const RATE_MIN = 0.5;
export const RATE_MAX = 2;
export const RATE_STEP = 0.05;
/** Presets for the common listening speeds. */
export const RATE_PRESETS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

export interface SpeedSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function SpeedSheet({ visible, onClose }: SpeedSheetProps) {
  const { colors } = useTheme();
  const { player } = usePlayback();
  const rate = usePlayerState((state) => state.rate);

  return (
    <Sheet visible={visible} onClose={onClose} title="Speed" snapPoints={['56%']}>
      <Text variant="display" align="center" style={styles.readout}>
        {formatRate(rate)}
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
              onPress={() => player.setRate(preset)}
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
