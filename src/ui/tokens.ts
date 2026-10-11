/**
 * Design tokens for the "Night Library" design system.
 * Source of truth: docs/specs/design-system.md. Every colour, spacing, radius, type size and motion
 * value used by src/ui and the app comes from this file. Do not inline literals elsewhere.
 */

export type ThemeScheme = 'dark' | 'light';

export interface ThemeColors {
  bg: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
  success: string;
  warning: string;
  danger: string;
  scrim: string;
  /** Sheen drawn under skeleton shimmer. */
  shimmer: string;
}

export const palette: Record<ThemeScheme, ThemeColors> = {
  dark: {
    bg: '#0D0E12',
    surface: '#15171D',
    surfaceRaised: '#1D2028',
    border: '#2A2E38',
    text: '#ECE8E1',
    textMuted: '#9A968E',
    textFaint: '#5E5B55',
    accent: '#E8A84A',
    accentSoft: 'rgba(232,168,74,0.14)',
    onAccent: '#1A1206',
    success: '#6BBF8A',
    warning: '#E3B341',
    danger: '#E5676B',
    scrim: 'rgba(0,0,0,0.6)',
    shimmer: 'rgba(255,255,255,0.06)',
  },
  light: {
    bg: '#F7F4EE',
    surface: '#FFFFFF',
    surfaceRaised: '#FBF8F2',
    border: '#E6E0D4',
    text: '#1A1814',
    textMuted: '#6B655B',
    textFaint: '#A39C90',
    accent: '#965E10',
    accentSoft: 'rgba(150,94,16,0.10)',
    onAccent: '#FFFFFF',
    success: '#2F8A55',
    warning: '#9A6B00',
    danger: '#C0392B',
    scrim: 'rgba(0,0,0,0.35)',
    shimmer: 'rgba(255,255,255,0.6)',
  },
};

/**
 * Generated cover backgrounds for series without artwork. Each pair is a deep ink-to-ink gradient
 * so monograms stay legible in both themes. The index is chosen deterministically from the title.
 */
export const coverGradients: readonly (readonly [string, string])[] = [
  ['#2B3A55', '#111827'],
  ['#5B3A29', '#1A120C'],
  ['#2F4F4F', '#0F1A1A'],
  ['#4A2C4A', '#140D16'],
  ['#3D4A2B', '#12170B'],
  ['#55402A', '#16110A'],
];
export const coverMonogramColor = '#ECE8E1';
/** Monogram font size as a fraction of the cover's width. */
export const coverMonogramRatio = 0.36;
/** Monogram line height as a multiple of its font size. */
export const coverMonogramLineRatio = 1.2;

export const space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/** Screen gutter. */
export const gutter = space.lg;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;
export type RadiusToken = keyof typeof radius;

/** Hairlines use the border colour and a 1px top highlight on raised surfaces. */
export const hairline = 1;
export const topHighlight = 'rgba(255,255,255,0.04)';

/** WCAG floor for touch targets on iOS and Android. */
export const minTouchTarget = 44;
export const tabBarHeight = 56;

export const fontFamily = {
  inter: {
    regular: 'Inter_400Regular',
    medium: 'Inter_500Medium',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
  },
  literata: {
    regular: 'Literata_400Regular',
    medium: 'Literata_500Medium',
    italic: 'Literata_400Regular_Italic',
  },
} as const;

export interface TypeStyle {
  size: number;
  lineHeight: number;
  fontFamily: string;
  tracking?: number;
  uppercase?: boolean;
}

export const typography = {
  display: { size: 32, lineHeight: 38, fontFamily: fontFamily.inter.bold },
  title: { size: 24, lineHeight: 30, fontFamily: fontFamily.inter.semibold },
  heading: { size: 18, lineHeight: 24, fontFamily: fontFamily.inter.semibold },
  body: { size: 16, lineHeight: 24, fontFamily: fontFamily.inter.regular },
  bodyStrong: { size: 16, lineHeight: 24, fontFamily: fontFamily.inter.semibold },
  caption: { size: 13, lineHeight: 18, fontFamily: fontFamily.inter.medium },
  micro: {
    size: 11,
    lineHeight: 14,
    fontFamily: fontFamily.inter.semibold,
    tracking: 0.6,
    uppercase: true,
  },
  reading: { size: 19, lineHeight: 30, fontFamily: fontFamily.literata.regular },
} as const satisfies Record<string, TypeStyle>;
export type TextVariant = keyof typeof typography;

/** Respect the OS font scale, but never beyond this multiplier. */
export const maxFontScale = 1.35;

export const iconSize = { sm: 20, md: 24 } as const;

/** Empty and error state illustration geometry. */
export const illustration = {
  haloSize: 136,
  glyphSize: 96,
  glyphIconSize: 40,
  maxCopyWidth: 320,
} as const;

/** Largest cover shown on the full player. */
export const playerCoverMaxWidth = 320;
export const iconStrokeWidth = 1.75;

export const springs = {
  snappy: { damping: 20, stiffness: 300 },
  gentle: { damping: 18, stiffness: 160 },
} as const;
export type SpringToken = keyof typeof springs;

export const durations = {
  micro: 120,
  standard: 220,
  emphasized: 360,
} as const;

/** Easing.bezier(0.2, 0, 0, 1) control points. */
export const easingCurve = [0.2, 0, 0, 1] as const;

/** Press feedback scale for primary and pressable surfaces. */
export const pressScale = 0.97;

export const opacity = {
  disabled: 0.45,
  pressed: 0.85,
  /** Tint over the blur on the tab bar and other glass surfaces. */
  glass: 0.85,
} as const;

export const glass = {
  blurIntensity: 60,
} as const;

export const progressRing = {
  size: 32,
  strokeWidth: 3,
} as const;

export const transparent = 'transparent';
