import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/ui/theme';
import { radius, thinTrackHeight } from '@/ui/tokens';

export interface ListeningBarProps {
  /** How much of the chapter has been heard, 0 to 1. */
  fraction: number;
}

/** A thin bar under a chapter's copy. Screen readers get the minutes left from the row instead. */
export function ListeningBar({ fraction }: ListeningBarProps) {
  const { colors } = useTheme();
  const heard = Math.min(1, Math.max(0, fraction));
  return (
    <View
      importantForAccessibility="no"
      accessibilityElementsHidden
      style={[styles.track, { backgroundColor: colors.border }]}
    >
      {/* Flex shares the track between the heard part and the rest, so no percentage string is needed. */}
      <View style={{ flex: heard, backgroundColor: colors.accent }} />
      <View style={{ flex: 1 - heard }} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: thinTrackHeight,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
});
