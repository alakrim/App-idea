import {
  StyleSheet,
  Text as RNText,
  type StyleProp,
  type TextProps as RNTextProps,
  type TextStyle,
} from 'react-native';

import { useTheme } from './theme';
import { maxFontScale, typography, type TextVariant, type ThemeColors } from './tokens';

export type TextTone =
  'default' | 'muted' | 'faint' | 'accent' | 'onAccentSoft' | 'success' | 'warning' | 'danger';

export interface TextProps extends Omit<RNTextProps, 'style'> {
  variant?: TextVariant;
  tone?: TextTone;
  align?: TextStyle['textAlign'];
  style?: StyleProp<TextStyle>;
}

/**
 * Variant-driven text. Caps OS font scaling at the design system limit.
 *
 * Android's text layout throws ("FontSize should be a positive value") for a font size of 0 or less,
 * which kills the app. That happens with sizes computed from a layout that has not run yet. Text
 * with no positive size would be invisible anyway, so it is not rendered at all.
 */
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

  if (!hasRenderableFontSize(style)) {
    return null;
  }

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

/** False when the style sets a font size Android cannot lay out: zero, negative or not a number. */
export function hasRenderableFontSize(style: StyleProp<TextStyle>): boolean {
  const fontSize = StyleSheet.flatten(style)?.fontSize;
  return fontSize === undefined || (Number.isFinite(fontSize) && fontSize > 0);
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
    case 'onAccentSoft':
      return colors.accentOnSoft;
    case 'success':
      return colors.success;
    case 'warning':
      return colors.warning;
    case 'danger':
      return colors.danger;
  }
}
