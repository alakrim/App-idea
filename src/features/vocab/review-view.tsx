import { StyleSheet, View } from 'react-native';

import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { EmptyState } from '@/ui/empty-state';
import { IconButton } from '@/ui/icon-button';
import { BookA, X } from '@/ui/icons';
import { Screen } from '@/ui/screen';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { gutter, space } from '@/ui/tokens';

import { summarize, type ReviewState, type Verdict } from './review';

import type { ReviewCard } from './vocab-data';

export interface ReviewViewProps {
  /** The card on screen, or null when the session has ended or there was nothing to review. */
  card: ReviewCard | null;
  state: ReviewState;
  /** Cards in the session at its start. Zero means there was nothing to review. */
  started: number;
  onReveal: () => void;
  onGrade: (verdict: Verdict) => void;
  onClose: () => void;
  onBackToList: () => void;
}

/** Flashcards: the term in its sentence on the front, the explanation on the back. */
export function ReviewView(props: ReviewViewProps) {
  const { colors } = useTheme();
  const { state, card, started } = props;

  if (started === 0) {
    return (
      <Screen title="Review" scrollable={false}>
        <EmptyState
          icon={BookA}
          title="Nothing to review yet"
          description="Save a few words while you listen, then come back to test yourself."
          action={{ label: 'Back to Vocab', onPress: props.onBackToList, variant: 'secondary' }}
        />
      </Screen>
    );
  }

  const header = (
    <View style={styles.header}>
      <Text variant="caption" tone="muted">
        {card ? `${state.queue.length} left` : 'Session complete'}
      </Text>
      <IconButton label="Close review" icon={X} onPress={props.onClose} />
    </View>
  );

  if (card === null) {
    const { known, again } = summarize(state);
    return (
      <Screen title="Review" scrollable={false}>
        <View style={styles.body}>
          {header}
          <Card style={styles.centered}>
            <Text variant="title" align="center" accessibilityRole="header">
              Session complete
            </Text>
            <Text variant="body" tone="muted" align="center">
              {`Known ${known} · Again ${again}`}
            </Text>
            <Button label="Done" onPress={props.onClose} />
          </Card>
        </View>
      </Screen>
    );
  }

  return (
    <Screen title="Review" scrollable={false}>
      <View style={styles.body}>
        {header}
        <View style={styles.stage}>
          <Card style={styles.face} accessibilityLabel={`Flashcard for ${card.term}`}>
            <Text variant="heading" accessibilityRole="header">
              {card.term}
            </Text>
            {card.sentence ? (
              <Text variant="reading" tone="muted">
                {card.sentence}
              </Text>
            ) : null}
            {state.revealed ? (
              <View style={[styles.answer, { borderTopColor: colors.border }]}>
                {card.translation ? <Text variant="bodyStrong">{card.translation}</Text> : null}
                {card.explanation ? (
                  <Text variant="body" tone="muted">
                    {card.explanation}
                  </Text>
                ) : (
                  <Text variant="caption" tone="faint">
                    No explanation yet.
                  </Text>
                )}
              </View>
            ) : null}
          </Card>
        </View>
        {state.revealed ? (
          <View style={styles.grades}>
            <View style={styles.grade}>
              <Button
                label="Again"
                variant="secondary"
                fullWidth
                onPress={() => props.onGrade('again')}
              />
            </View>
            <View style={styles.grade}>
              <Button label="Known" fullWidth onPress={() => props.onGrade('known')} />
            </View>
          </View>
        ) : (
          <Button label="Show answer" fullWidth onPress={props.onReveal} />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, gap: space.lg, padding: gutter },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  centered: { gap: space.md, alignItems: 'center' },
  stage: { flex: 1, justifyContent: 'center' },
  face: { gap: space.md },
  answer: { gap: space.sm, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth },
  grades: { flexDirection: 'row', gap: space.md },
  grade: { flex: 1 },
});
