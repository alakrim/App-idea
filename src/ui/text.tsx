import {
  Text as RNText,
  type StyleProp,
  type TextProps as RNTextProps,
  type TextStyle,
} from 'react-native';

import { useTheme } from './theme';
import { maxFontScale, typography, type TextVariant, type ThemeColors } from './tokens';

export type TextTone = 'default' | 'muted' | 'faint' | 'accent' | 'success' | 'warning' | 'danger';

export interface TextProps extends Omit<RNTextProps, 'style'> {
  variant?: TextVariant;
  tone?: TextTone;
  align?: TextStyle['textAlign'];
  style?: StyleProp<TextStyle>;
}

/** Variant-driven text. Caps OS font scaling at the design system limit. */
export function Text({
  variant = 'body',
  tone = 'default',
  align,
  style,
  maxFontSizeMultiplier = maxFontScale,
  ...rest
}: TextProps) {
  const { colors } = useTheme();
  const type = typography[variant];
  const color = toneColor(tone, colors);

  return (
    <RNText
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[
        {
          fontFamily: type.fontFamily,
          fontSize: type.size,
          lineHeight: type.lineHeight,
          color,
          textAlign: align,
          letterSpacing: 'tracking' in type ? type.tracking : undefined,
          textTransform: 'uppercase' in type && type.uppercase ? 'uppercase' : undefined,
        },
        style,
      ]}
      {...rest}
    />
  );
}

function toneColor(tone: TextTone, colors: ThemeColors): string {
  switch (tone) {
    case 'default':
      return colors.text;
    case 'muted':
      return colors.textMuted;
    case 'faint':
      return colors.textFaint;
    case 'accent':
      return colors.accent;
    case 'success':
      return colors.success;
    case 'warning':
      return colors.warning;
    case 'danger':
      return colors.danger;
  }
}
