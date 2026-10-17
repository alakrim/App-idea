import { Pressable, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';

import type { LucideIcon } from '@/ui/icons';

import { useTheme } from './theme';
import { iconSize, iconStrokeWidth, minTouchTarget, opacity, radius, transparent } from './tokens';
import { usePressScale } from './use-press-scale';

export type IconButtonVariant = 'ghost' | 'surface';

export interface IconButtonProps {
  /** Accessible name, since an icon alone has no text. */
  label: string;
  icon: LucideIcon;
  onPress: () => void;
  variant?: IconButtonVariant;
  disabled?: boolean;
  testID?: string;
}

/** Square icon button with the design system's minimum touch target. */
export function IconButton({
  label,
  icon: Icon,
  onPress,
  variant = 'ghost',
  disabled = false,
  testID,
}: IconButtonProps) {
  const { colors } = useTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressScale();
  const filled = variant === 'surface';

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        testID={testID}
        style={[
          styles.base,
          {
            backgroundColor: filled ? colors.surfaceRaised : transparent,
            borderColor: colors.border,
          },
          filled ? styles.bordered : null,
          disabled ? styles.disabled : null,
        ]}
      >
        <Icon size={iconSize.md} strokeWidth={iconStrokeWidth} color={colors.text} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    width: minTouchTarget,
    height: minTouchTarget,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bordered: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  disabled: {
    opacity: opacity.disabled,
  },
});
