import { TriangleAlert } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Button } from './button';
import { Text } from './text';
import { useTheme } from './theme';
import { hairline, iconStrokeWidth, illustration, radius, space } from './tokens';

export interface ErrorStateProps {
  /** What happened, in plain words. */
  title?: string;
  /** What to do next. */
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}

/** Failure state: says what happened and offers the next step. Announced assertively. */
export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try again',
}: ErrorStateProps) {
  const { colors } = useTheme();

  return (
    <View accessibilityLiveRegion="assertive" accessibilityRole="alert" style={styles.container}>
      <View
        style={[
          styles.glyph,
          { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
        ]}
      >
        <TriangleAlert
          size={illustration.glyphIconSize}
          strokeWidth={iconStrokeWidth}
          color={colors.danger}
        />
      </View>
      <View style={styles.copy}>
        <Text variant="title" align="center" accessibilityRole="header">
          {title}
        </Text>
        <Text variant="body" tone="muted" align="center">
          {message}
        </Text>
      </View>
      {onRetry ? (
        <Button label={retryLabel} onPress={onRetry} variant="secondary" size="lg" />
      ) : null}
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
