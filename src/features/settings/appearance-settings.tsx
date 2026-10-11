import { StyleSheet, View } from 'react-native';

import type { ThemeMode } from '@/core/settings';
import { SegmentedControl, type SegmentedOption } from '@/ui/segmented-control';
import { Text } from '@/ui/text';
import { space } from '@/ui/tokens';

import { ValueHeading } from './setting-controls';
import { useSettings } from './settings-store';

const OPTIONS: readonly SegmentedOption<ThemeMode>[] = [
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
];

/** Theme choice. The change applies at once because the root theme follows the saved setting. */
export function AppearanceSettings() {
  const { settings, patch } = useSettings();

  return (
    <>
      <View style={styles.section}>
        <ValueHeading title="Theme" />
        <SegmentedControl
          label="Theme"
          options={OPTIONS}
          value={settings.theme}
          onChange={(theme) => patch({ theme })}
        />
      </View>
      <Text variant="caption" tone="muted">
        System follows your phone&apos;s light or dark setting. Dark is the default, made for
        reading at night.
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: space.sm,
  },
});
