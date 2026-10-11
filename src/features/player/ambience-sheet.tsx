import { StyleSheet, Switch, View } from 'react-native';

import { Sheet } from '@/ui/sheet';
import { Slider } from '@/ui/slider';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { space } from '@/ui/tokens';

import { usePlayback, usePlaybackContent } from './player-provider';

/** Bed level range the engine accepts, in dB relative to the narration. */
export const BED_LEVEL_MIN_DB = -40;
export const BED_LEVEL_MAX_DB = 0;

export interface AmbienceSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Beds sounding at the current sentence, for the status line. */
  activeNames: readonly string[];
}

export function AmbienceSheet({ visible, onClose, activeNames }: AmbienceSheetProps) {
  const { colors } = useTheme();
  const controller = usePlayback();
  const ambience = usePlaybackContent((content) => content.ambience);
  const status =
    activeNames.length > 0 ? activeNames.join(' · ') : 'Nothing sounds at this point';

  return (
    <Sheet visible={visible} onClose={onClose} title="Ambience" snapPoints={['54%']}>
      <View style={styles.row}>
        <View style={styles.copy}>
          <Text variant="bodyStrong">Sound under the narration</Text>
          <Text variant="caption" tone="muted">
            {ambience.enabled ? 'On' : 'Off'}
          </Text>
        </View>
        <Switch
          accessibilityLabel="Ambience on"
          value={ambience.enabled}
          onValueChange={(enabled) => controller.setAmbience({ enabled })}
          trackColor={{ false: colors.border, true: colors.accent }}
          thumbColor={colors.text}
        />
      </View>
      <Slider
        label="Ambience level"
        value={ambience.levelDb}
        min={BED_LEVEL_MIN_DB}
        max={BED_LEVEL_MAX_DB}
        step={1}
        formatValue={(db) => `${db} dB`}
        minimumLabel="Subtle"
        maximumLabel="Present"
        disabled={!ambience.enabled}
        onValueChange={(levelDb) => controller.setAmbience({ levelDb })}
      />
      <Text variant="caption" tone="muted">
        {status}
      </Text>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  copy: {
    flex: 1,
    gap: space.xxs,
  },
});
