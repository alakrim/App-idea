import { Trash } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Skeleton } from '@/ui/skeleton';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { fontFamily, iconSize, iconStrokeWidth, minTouchTarget, radius, space } from '@/ui/tokens';

import type { VocabCard as VocabCardData } from './vocab-data';

export interface ExplanationStatus {
  pending: boolean;
  failure: string | null;
}

export interface VocabCardProps {
  card: VocabCardData;
  status: ExplanationStatus;
  onDelete: () => void;
  onOpenSource: () => void;
  onRetry: () => void;
}

const DELETE_ACTION = 'delete';
/** Width of the revealed delete panel. */
const DELETE_PANEL_WIDTH = 88;

/**
 * One saved item. Swiping left reveals Delete, and a tap confirms it, so a stray swipe cannot
 * remove an item. The same action is also offered to screen readers as an accessibility action.
 */
export function VocabCard({ card, status, onDelete, onOpenSource, onRetry }: VocabCardProps) {
  const { colors } = useTheme();
  const { item, sentence } = card;
  const hasExplanation = item.explanation !== null;

  return (
    <View
      accessibilityActions={[{ name: DELETE_ACTION, label: `Delete ${item.term}` }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === DELETE_ACTION) onDelete();
      }}
    >
      <ReanimatedSwipeable
        overshootRight={false}
        friction={2}
        renderRightActions={() => (
          <Pressable
            onPress={onDelete}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${item.term}`}
            style={[styles.deletePanel, { backgroundColor: colors.danger }]}
          >
            <Trash size={iconSize.md} strokeWidth={iconStrokeWidth} color={colors.onAccent} />
            <Text variant="caption" style={{ color: colors.onAccent }}>
              Delete
            </Text>
          </Pressable>
        )}
      >
        <Card
          accessibilityLabel={`${item.term}. ${item.translation ?? 'No translation yet'}`}
          style={styles.card}
        >
          <Text variant="heading">{item.term}</Text>
          {item.translation ? <Text variant="body">{item.translation}</Text> : null}
          {hasExplanation ? (
            <Text variant="caption" tone="muted">
              {item.explanation}
            </Text>
          ) : null}
          {!hasExplanation && status.pending ? (
            <View style={styles.pending} accessibilityLabel="Getting the explanation">
              <Skeleton height={12} width="90%" />
              <Text variant="caption" tone="faint">
                Getting the explanation…
              </Text>
            </View>
          ) : null}
          {!hasExplanation && !status.pending ? (
            <View style={styles.retry}>
              <Text variant="caption" tone={status.failure ? 'danger' : 'faint'}>
                {status.failure ?? 'No explanation yet.'}
              </Text>
              <Button
                label="Retry explanation"
                variant="ghost"
                size="md"
                onPress={onRetry}
                accessibilityHint={`Asks again for an explanation of ${item.term}`}
              />
            </View>
          ) : null}
          {sentence ? (
            <Pressable
              onPress={onOpenSource}
              accessibilityRole="link"
              accessibilityLabel="Open the sentence in its chapter"
              style={({ pressed }) => [
                styles.source,
                { borderLeftColor: colors.accent },
                pressed && styles.pressed,
              ]}
            >
              <Text
                variant="body"
                style={[
                  styles.sourceText,
                  { color: colors.textMuted, fontFamily: fontFamily.literata.italic },
                ]}
              >
                {sentence}
              </Text>
            </Pressable>
          ) : null}
        </Card>
      </ReanimatedSwipeable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm },
  pending: { gap: space.xs },
  retry: { gap: space.xs, alignItems: 'flex-start' },
  source: {
    borderLeftWidth: space.xxs,
    paddingLeft: space.md,
    paddingVertical: space.xs,
    minHeight: minTouchTarget,
    justifyContent: 'center',
  },
  sourceText: { fontSize: 15, lineHeight: 22 },
  pressed: { opacity: 0.85 },
  deletePanel: {
    width: DELETE_PANEL_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    borderRadius: radius.md,
    marginLeft: space.sm,
  },
});
