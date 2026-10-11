import { StyleSheet, View } from 'react-native';

import type { LucideIcon } from '@/ui/icons';

import { Button, type ButtonVariant } from './button';
import { Text } from './text';
import { useTheme } from './theme';
import { hairline, iconStrokeWidth, illustration, radius, space } from './tokens';

import type { ReactNode } from 'react';

export interface EmptyStateAction {
  label: string;
  onPress: () => void;
  icon?: LucideIcon;
  variant?: ButtonVariant;
}

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: EmptyStateAction;
  children?: ReactNode;
}

/** Designed empty state: a framed glyph, one clear sentence of copy and at most one CTA. */
export function EmptyState({ icon: Icon, title, description, action, children }: EmptyStateProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <View style={styles.illustration}>
        <View style={[styles.halo, { backgroundColor: colors.accentSoft }]} />
        <View
          style={[
            styles.glyph,
            { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
          ]}
        >
          <Icon
            size={illustration.glyphIconSize}
            strokeWidth={iconStrokeWidth}
            color={colors.accent}
          />
        </View>
      </View>
      <View style={styles.copy}>
        <Text variant="title" align="center" accessibilityRole="header">
          {title}
        </Text>
        <Text variant="body" tone="muted" align="center">
          {description}
        </Text>
      </View>
      {action ? (
        <Button
          label={action.label}
          onPress={action.onPress}
          icon={action.icon}
          variant={action.variant ?? 'primary'}
          size="lg"
        />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xl,
    paddingHorizontal: space.xl,
    paddingVertical: space.xxl,
  },
  illustration: {
    width: illustration.haloSize,
    height: illustration.haloSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    borderRadius: radius.pill,
  },
  glyph: {
    width: illustration.glyphSize,
    height: illustration.glyphSize,
    borderRadius: radius.pill,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    alignItems: 'center',
    gap: space.sm,
    maxWidth: illustration.maxCopyWidth,
  },
});
