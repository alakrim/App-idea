import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import type { LucideIcon } from '@/ui/icons';

import { impactHaptic } from './haptics';
import { Text } from './text';
import { useTheme } from './theme';
import {
  iconSize,
  iconStrokeWidth,
  minTouchTarget,
  opacity,
  radius,
  space,
  transparent,
  type ThemeColors,
} from './tokens';
import { usePressScale } from './use-press-scale';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'lg';

export interface ButtonProps {
  /** Visible label. It is also the accessible name. */
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  icon?: LucideIcon;
  fullWidth?: boolean;
  accessibilityHint?: string;
  testID?: string;
}

const HEIGHT: Record<ButtonSize, number> = { md: minTouchTarget, lg: 52 };

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon: Icon,
  fullWidth = false,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const { colors } = useTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressScale();
  const inactive = disabled || loading;
  const look = variantLook(variant, colors);

  const handlePress = () => {
    if (variant === 'primary') {
      impactHaptic();
    }
    onPress();
  };

  return (
    <Animated.View style={[fullWidth && styles.fullWidth, animatedStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: inactive, busy: loading }}
        disabled={inactive}
        onPress={handlePress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        testID={testID}
        style={({ pressed }) => [
          styles.base,
          { height: HEIGHT[size], backgroundColor: look.background },
          look.border ? { borderWidth: StyleSheet.hairlineWidth, borderColor: look.border } : null,
          fullWidth && styles.fullWidth,
          inactive && styles.inactive,
          pressed && !inactive ? styles.pressed : null,
        ]}
      >
        <View style={styles.row}>
          {loading ? (
            <ActivityIndicator size="small" color={look.foreground} />
          ) : Icon ? (
            <Icon size={iconSize.sm} strokeWidth={iconStrokeWidth} color={look.foreground} />
          ) : null}
          <Text variant="bodyStrong" style={{ color: look.foreground }}>
            {label}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

interface VariantLook {
  background: string;
  foreground: string;
  border?: string;
}

function variantLook(variant: ButtonVariant, colors: ThemeColors): VariantLook {
  switch (variant) {
    case 'primary':
      return { background: colors.accent, foreground: colors.onAccent };
    case 'secondary':
      return { background: colors.surfaceRaised, foreground: colors.text, border: colors.border };
    case 'ghost':
      return { background: transparent, foreground: colors.accent };
    case 'danger':
      return { background: colors.danger, foreground: colors.bg };
  }
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.lg,
    paddingHorizontal: space.lg,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: minTouchTarget,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  inactive: {
    opacity: opacity.disabled,
  },
  pressed: {
    opacity: opacity.pressed,
  },
});
