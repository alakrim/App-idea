import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { useTheme } from './theme';
import { gutter, radius, space, topHighlight } from './tokens';
import { usePressScale } from './use-press-scale';

import type { ReactNode } from 'react';

export interface CardProps {
  children: ReactNode;
  /** Raised cards sit one colour step up, for modals and the player sheet. */
  raised?: boolean;
  onPress?: () => void;
  /** Required when the card is pressable, so screen readers can name it. */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Card({
  children,
  raised = false,
  onPress,
  accessibilityLabel,
  style,
  testID,
}: CardProps) {
  const { colors, scheme } = useTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressScale();
  // A white highlight is invisible on a light surface, so light raised cards use a hairline instead.
  const raisedTop = scheme === 'dark' ? topHighlight : colors.border;

  const surface = [
    styles.base,
    {
      backgroundColor: raised ? colors.surfaceRaised : colors.surface,
      borderColor: colors.border,
      borderTopColor: raised ? raisedTop : colors.border,
    },
    style,
  ];

  if (!onPress) {
    return (
      <View testID={testID} style={surface}>
        {children}
      </View>
    );
  }

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        testID={testID}
        style={surface}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: gutter,
    gap: space.sm,
  },
});
