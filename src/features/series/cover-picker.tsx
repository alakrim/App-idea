import { ImagePlus, LoaderCircle } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { CoverImage } from '@/ui/cover-image';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { iconSize, iconStrokeWidth, illustration, radius, space } from '@/ui/tokens';
import { usePressScale } from '@/ui/use-press-scale';

/** The picker is 168 pt wide, a 2:3 card that matches the shelf. */
export const COVER_PICKER_WIDTH = 168;

export interface CoverPickerProps {
  title: string;
  coverUri: string | null;
  busy: boolean;
  onPress: () => void;
}

/**
 * The series cover, as a 2:3 card. Without a cover it shows an image prompt while the name is empty,
 * and the generated monogram once there is a name. The overlay button opens the picker.
 */
export function CoverPicker({ title, coverUri, busy, onPress }: CoverPickerProps) {
  const { colors } = useTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressScale();
  const hasName = title.trim() !== '';
  const label = coverUri ? 'Change cover' : 'Add cover';

  return (
    <Animated.View style={[styles.frame, animatedStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={busy ? 'Reading the cover image' : label}
        accessibilityHint="Opens your photo library"
        accessibilityState={{ busy }}
        disabled={busy}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={styles.fill}
      >
        {coverUri || hasName ? (
          <CoverImage uri={coverUri} title={title.trim() || 'New series'} style={styles.fill} />
        ) : (
          <View
            style={[
              styles.prompt,
              { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
            ]}
          >
            <View style={[styles.halo, { backgroundColor: colors.accentSoft }]}>
              <ImagePlus size={iconSize.md} strokeWidth={iconStrokeWidth} color={colors.accent} />
            </View>
            <Text variant="caption" tone="muted" align="center">
              Your cover appears here
            </Text>
          </View>
        )}
        <View style={styles.overlay} pointerEvents="none">
          <View style={[styles.pill, { backgroundColor: colors.scrim }]}>
            {busy ? (
              <LoaderCircle size={iconSize.sm} strokeWidth={iconStrokeWidth} color={colors.text} />
            ) : (
              <ImagePlus size={iconSize.sm} strokeWidth={iconStrokeWidth} color={colors.text} />
            )}
            <Text variant="caption" style={{ color: colors.text }}>
              {busy ? 'Reading cover' : label}
            </Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: COVER_PICKER_WIDTH,
    aspectRatio: 2 / 3,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  fill: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  prompt: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  halo: {
    width: illustration.glyphIconSize + space.xl,
    height: illustration.glyphIconSize + space.xl,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: space.md,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: space.xl,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
  },
});
