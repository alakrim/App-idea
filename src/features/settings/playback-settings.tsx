import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PLAYBACK_RATE_RANGE, PLAYBACK_RATE_STEP } from '@/core/playback/ranges';
import { formatRate } from '@/features/player/format';
import { Slider } from '@/ui/slider';
import { Text } from '@/ui/text';
import { space } from '@/ui/tokens';

import { ValueHeading } from './setting-controls';
import { useSettings } from './settings-store';

/**
 * The speed a series starts at until its listener picks one. The slider keeps a draft while it is
 * dragged and saves the value on release, so the settings are not written on every tick.
 */
export function PlaybackSettings() {
  const { settings, patch } = useSettings();
  const [dragRate, setDragRate] = useState<number | null>(null);
  const rate = dragRate ?? settings.playback.defaultRate;

  return (
    <View style={styles.section}>
      <ValueHeading title="Default speed" value={formatRate(rate)} />
      <Text variant="caption" tone="muted">
        Used for a series until you change its speed. Each series then keeps its own.
      </Text>
      <Slider
        label="Default playback speed for new series"
        value={rate}
        min={PLAYBACK_RATE_RANGE.min}
        max={PLAYBACK_RATE_RANGE.max}
        step={PLAYBACK_RATE_STEP}
        formatValue={formatRate}
        minimumLabel={formatRate(PLAYBACK_RATE_RANGE.min)}
        maximumLabel={formatRate(PLAYBACK_RATE_RANGE.max)}
        onValueChange={setDragRate}
        onValueCommit={(defaultRate) => {
          setDragRate(null);
          patch({ playback: { defaultRate } });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: space.sm,
  },
});
