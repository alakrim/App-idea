import { Switch, StyleSheet, View } from 'react-native';

import { getCategory } from '@/core/analysis/ambience-taxonomy';
import type { AmbienceCue } from '@/core/domain';
import { AMBIENCE_ICONS } from '@/features/shared/ambience-display';
import { ambienceLabel } from '@/features/shared/ambience-labels';
import { Card } from '@/ui/card';
import { Sparkles } from '@/ui/icons';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { hairline, iconSize, iconStrokeWidth, minTouchTarget, radius, space } from '@/ui/tokens';

import { cueRangeLabel } from './ambience-range';

export interface AmbienceListProps {
  cues: readonly AmbienceCue[];
<<<<<<< HEAD
  /** True once the chapter has been analysed. Decides the copy of the empty state. */
  analysed: boolean;
=======
  /** Sentences in the whole chapter, to say where each cue sits. */
  sentenceCount: number;
>>>>>>> 54b3d2e
  onToggle: (cueId: string, enabled: boolean) => void;
}

/** The ambience cues of a chapter. Each switch persists straight away. */
<<<<<<< HEAD
export function AmbienceList({ cues, analysed, onToggle }: AmbienceListProps) {
=======
export function AmbienceList({ cues, sentenceCount, onToggle }: AmbienceListProps) {
>>>>>>> 54b3d2e
  if (cues.length === 0) {
    return (
      <Text variant="caption" tone="muted">
        {analysed
          ? 'No ambience: no clear setting found'
          : 'No ambience in this chapter. Its voice plays on its own.'}
      </Text>
    );
  }
  return (
    <Card style={styles.flush}>
      {cues.map((cue, index) => (
        <CueRow
          key={cue.id}
          cue={cue}
          sentenceCount={sentenceCount}
          divided={index > 0}
          onToggle={onToggle}
        />
      ))}
    </Card>
  );
}

interface CueRowProps {
  cue: AmbienceCue;
  sentenceCount: number;
  divided: boolean;
  onToggle: (cueId: string, enabled: boolean) => void;
}

function CueRow({ cue, sentenceCount, divided, onToggle }: CueRowProps) {
  const { colors } = useTheme();
  const category = getCategory(cue.category);
  const Icon = category ? AMBIENCE_ICONS[category.icon] : Sparkles;
  const label = ambienceLabel(cue.category);
  const range = cueRangeLabel(cue, sentenceCount);

  return (
    <View
      style={[
        styles.row,
        divided ? { borderTopWidth: hairline, borderTopColor: colors.border } : null,
      ]}
    >
      <View style={[styles.icon, { backgroundColor: colors.accentSoft }]}>
        <Icon size={iconSize.sm} strokeWidth={iconStrokeWidth} color={colors.accent} />
      </View>
      <View style={styles.copy}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {label}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {range}
        </Text>
        <Text variant="caption" tone="faint" numberOfLines={2}>
          {cue.reason}
        </Text>
      </View>
      <Switch
        accessibilityLabel={`Ambience: ${label}, ${range}`}
        accessibilityHint={cue.reason}
        accessibilityRole="switch"
        value={cue.enabled}
        onValueChange={(enabled) => onToggle(cue.id, enabled)}
        trackColor={{ false: colors.boundary, true: colors.accent }}
        thumbColor={colors.text}
        ios_backgroundColor={colors.border}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flush: {
    padding: 0,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: minTouchTarget,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  icon: {
    width: minTouchTarget,
    height: minTouchTarget,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    gap: space.xxs,
  },
});
