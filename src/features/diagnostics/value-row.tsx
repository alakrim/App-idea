import { StyleSheet, View } from 'react-native';

import { Text } from '@/ui/text';
import { space } from '@/ui/tokens';

/** Values longer than this wrap under their label instead of sitting beside it. */
const STACKED_VALUE_LENGTH = 28;

/** A label and its value. Long values, such as JSON, take the full row width under the label. */
export function ValueRow({ label, value }: { label: string; value: string }) {
  const stacked = value.length > STACKED_VALUE_LENGTH;
  return (
    <View style={[styles.row, stacked ? styles.stacked : null]}>
      <Text variant="caption" tone="muted" style={styles.rowLabel}>
        {label}
      </Text>
      <Text
        variant="caption"
        style={[styles.rowValue, stacked ? styles.valueStacked : null]}
        selectable
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space.md,
  },
  stacked: {
    flexDirection: 'column',
    gap: space.xxs,
  },
  rowLabel: {
    flexShrink: 0,
  },
  rowValue: {
    flex: 1,
    minWidth: 0,
    textAlign: 'right',
  },
  valueStacked: {
    flex: 0,
    textAlign: 'left',
  },
});
