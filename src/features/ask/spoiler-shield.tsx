import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ShieldCheck } from '@/ui/icons';
import { Sheet } from '@/ui/sheet';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { hairline, iconSize, iconStrokeWidth, minTouchTarget, radius, space } from '@/ui/tokens';

import type { AskCutoff } from './ask-data';

export interface SpoilerShieldProps {
  cutoff: AskCutoff;
}

/** Whole-number percentage for the badge, never above 100. */
export function percentOf(share: number): number {
  return Math.min(100, Math.max(0, Math.round(share * 100)));
}

/** What the shield promises, in plain words. Chapter 1 has no earlier chapters to name. */
export function explanationFor(cutoff: AskCutoff): string {
  const reached =
    cutoff.chapterNumber > 1
      ? `chapters 1 to ${cutoff.chapterNumber - 1} in full, and chapter ${cutoff.chapterNumber} up to where you stopped`
      : `chapter 1 up to where you stopped`;
  return `Answers use only what you have reached: ${reached}. Chapters after ${cutoff.chapterNumber} are never read, so they cannot leak into an answer.`;
}

/** The header badge showing how far answers can reach. Tapping it explains the cutoff. */
export function SpoilerShield({ cutoff }: SpoilerShieldProps) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const percent = percentOf(cutoff.reachedShare);
  const summary = `Up to Ch. ${cutoff.chapterNumber} · ${percent}%`;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Spoiler shield: answers reach chapter ${cutoff.chapterNumber} of ${cutoff.chapterCount}, ${percent} percent. Tap to learn more.`}
        style={({ pressed }) => [
          styles.badge,
          { borderColor: colors.border, backgroundColor: colors.surface },
          pressed && styles.pressed,
        ]}
      >
        <ShieldCheck
          size={iconSize.sm}
          strokeWidth={iconStrokeWidth}
          color={colors.textMuted}
          accessibilityElementsHidden
        />
        <Text variant="caption" style={{ color: colors.text }}>
          {summary}
        </Text>
      </Pressable>

      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title="Spoiler shield"
        snapPoints={['46%']}
      >
        <View style={styles.sheet}>
          <Text variant="body" tone="muted">
            {explanationFor(cutoff)}
          </Text>
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  badge: {
    minHeight: minTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    alignSelf: 'flex-start',
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: hairline,
  },
  pressed: { opacity: 0.85 },
  sheet: { gap: space.md, paddingHorizontal: space.lg, paddingBottom: space.xl },
});
