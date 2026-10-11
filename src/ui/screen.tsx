import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { Text } from './text';
import { useTheme } from './theme';
import { gutter, hairline, minTouchTarget, space } from './tokens';

import type { ReactNode } from 'react';

export interface ScreenProps {
  children: ReactNode;
  /** Large title at the top of the content. It also shows as a compact bar once scrolled. */
  title?: string;
  /** Scrollable screens collapse the title into the compact bar. Non-scrollable ones fill the space. */
  scrollable?: boolean;
  edges?: Edge[];
  contentStyle?: StyleProp<ViewStyle>;
}

const COLLAPSE_START = space.xl;
const COLLAPSE_END = space.xxxl;

export function Screen({
  children,
  title,
  scrollable = true,
  edges = ['top'],
  contentStyle,
}: ScreenProps) {
  const { colors } = useTheme();
  const scrollY = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const compactBarStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [COLLAPSE_START, COLLAPSE_END],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));

  // The large title sits under the status bar with a little air, so it never hugs the top edge.
  const titleSpacing = title ? styles.titledContent : null;

  const heading = title ? (
    <Text variant="display" accessibilityRole="header" numberOfLines={2}>
      {title}
    </Text>
  ) : null;

  return (
    <SafeAreaView edges={edges} style={[styles.root, { backgroundColor: colors.bg }]}>
      {title ? (
        <Animated.View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.compactBar,
            { backgroundColor: colors.bg, borderBottomColor: colors.border },
            compactBarStyle,
          ]}
        >
          <Text variant="heading" numberOfLines={1} style={styles.compactTitle}>
            {title}
          </Text>
        </Animated.View>
      ) : null}

      {scrollable ? (
        <Animated.ScrollView
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={[styles.content, titleSpacing, contentStyle]}
        >
          {heading}
          {children}
        </Animated.ScrollView>
      ) : (
        <View style={[styles.content, styles.fill, titleSpacing, contentStyle]}>
          {heading}
          {children}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  fill: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: gutter,
    paddingBottom: space.xxl,
    gap: space.lg,
  },
  titledContent: {
    paddingTop: space.sm,
  },
  compactBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
    pointerEvents: 'none',
    minHeight: minTouchTarget,
    justifyContent: 'center',
    paddingHorizontal: gutter,
    borderBottomWidth: hairline,
  },
  compactTitle: {
    textAlign: 'center',
  },
});
