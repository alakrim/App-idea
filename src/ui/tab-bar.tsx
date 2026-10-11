import { BlurView } from 'expo-blur';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { selectionHaptic } from './haptics';
import { Text } from './text';
import { useTheme } from './theme';
import { glass, hairline, iconSize, minTouchTarget, opacity, space, tabBarHeight } from './tokens';

import type { BottomTabBarProps } from 'expo-router/js-tabs';

/**
 * Custom bottom tab bar: blurred surfaceRaised, amber active icon, haptic on change.
 * Icons come from each screen's `tabBarIcon` option.
 */
export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      accessibilityRole="tablist"
      style={[styles.container, { borderTopColor: colors.border, paddingBottom: insets.bottom }]}
    >
      <BlurView intensity={glass.blurIntensity} tint={scheme} style={StyleSheet.absoluteFill} />
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: colors.surfaceRaised, opacity: opacity.glass },
        ]}
      />
      <View style={styles.row}>
        {state.routes.map((route, index) => {
          const descriptor = descriptors[route.key];
          if (!descriptor) {
            return null;
          }
          const { options } = descriptor;
          const focused = state.index === index;
          const label = options.title ?? route.name;
          const color = focused ? colors.accent : colors.textMuted;

          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: focused }}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) {
                  selectionHaptic();
                  navigation.navigate(route.name, route.params);
                }
              }}
              onLongPress={() => {
                navigation.emit({ type: 'tabLongPress', target: route.key });
              }}
              style={styles.tab}
            >
              {options.tabBarIcon?.({ focused, color, size: iconSize.md })}
              <Text variant="caption" style={{ color }}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: hairline,
    overflow: 'hidden',
  },
  row: {
    height: tabBarHeight,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tab: {
    flex: 1,
    minHeight: minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xxs,
  },
});
