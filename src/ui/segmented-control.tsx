import { Pressable, StyleSheet, View } from 'react-native';

import { selectionHaptic } from './haptics';
import { Text } from './text';
import { useTheme } from './theme';
import { hairline, minTouchTarget, radius, space, transparent } from './tokens';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  /** Accessible name of the group. */
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  const { colors } = useTheme();

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[
        styles.track,
        { backgroundColor: colors.surfaceRaised, borderColor: colors.boundary },
      ]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: selected }}
            onPress={() => {
              if (!selected) {
                selectionHaptic();
                onChange(option.value);
              }
            }}
            style={[
              styles.segment,
              selected ? { backgroundColor: colors.surface, borderColor: colors.boundary } : null,
            ]}
          >
            <Text variant="caption" tone={selected ? 'default' : 'muted'}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: radius.pill,
    borderWidth: hairline,
    padding: space.xxs,
  },
  segment: {
    flex: 1,
    minHeight: minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: hairline,
    borderColor: transparent,
  },
});
