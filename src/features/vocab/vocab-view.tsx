import { BookA, Search } from 'lucide-react-native';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/ui/button';
import { EmptyState } from '@/ui/empty-state';
import { Screen } from '@/ui/screen';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import {
  gutter,
  hairline,
  iconSize,
  iconStrokeWidth,
  minTouchTarget,
  radius,
  space,
} from '@/ui/tokens';

import { VocabCard, type ExplanationStatus } from './vocab-card';

import type { VocabLanguageGroup } from './vocab-data';

export interface VocabViewProps {
  groups: readonly VocabLanguageGroup[];
  query: string;
  /** Saved items in total, ignoring the search. Decides between the empty state and no-match. */
  total: number;
  onQueryChange: (query: string) => void;
  onStartReview: () => void;
  onOpenLibrary: () => void;
  onOpenSource: (chapterId: string, sentenceIdx: number) => void;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
  explanationOf: (id: string) => ExplanationStatus;
}

/** The Vocab tab: search, a review entry point, and saved items grouped by language and series. */
export function VocabView(props: VocabViewProps) {
  if (props.total === 0) {
    return (
      <Screen title="Vocab" scrollable={false}>
        <EmptyState
          icon={BookA}
          title="Save words while you listen"
          description="Tap a word in the synced text to keep it here, with its context and translation."
          action={{
            label: 'Browse your library',
            onPress: props.onOpenLibrary,
            variant: 'secondary',
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen title="Vocab" scrollable={false}>
      <Toolbar
        query={props.query}
        onQueryChange={props.onQueryChange}
        onStartReview={props.onStartReview}
        total={props.total}
      />
      {props.groups.length === 0 ? (
        <NoMatches query={props.query} />
      ) : (
        <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
          {props.groups.map((group) => (
            <LanguageSection key={group.lang} group={group} {...props} />
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}

interface ToolbarProps {
  query: string;
  total: number;
  onQueryChange: (query: string) => void;
  onStartReview: () => void;
}

function Toolbar({ query, total, onQueryChange, onStartReview }: ToolbarProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.toolbar}>
      <View
        style={[styles.search, { borderColor: colors.border, backgroundColor: colors.surface }]}
      >
        <Search size={iconSize.sm} strokeWidth={iconStrokeWidth} color={colors.textFaint} />
        <TextInput
          value={query}
          onChangeText={onQueryChange}
          placeholder="Search saved words"
          placeholderTextColor={colors.textFaint}
          accessibilityLabel="Search saved words"
          autoCorrect={false}
          style={[styles.searchInput, { color: colors.text }]}
        />
      </View>
      <Button
        label={`Review (${total})`}
        variant="secondary"
        size="md"
        onPress={onStartReview}
        accessibilityHint="Starts a flashcard review of every saved word"
      />
    </View>
  );
}

function NoMatches({ query }: { query: string }) {
  return (
    <View style={styles.noMatches}>
      <Text variant="body" tone="muted" align="center">
        {`No saved words match "${query.trim()}".`}
      </Text>
    </View>
  );
}

type SectionProps = VocabViewProps & { group: VocabLanguageGroup };

function LanguageSection({ group, ...props }: SectionProps) {
  return (
    <View style={styles.section}>
      <Text variant="micro" tone="muted" accessibilityRole="header">
        {group.label}
      </Text>
      {group.series.map((series) => (
        <View key={series.seriesId} style={styles.series}>
          <Text variant="caption" tone="muted">
            {series.title}
          </Text>
          {series.cards.map((card) => (
            <VocabCard
              key={card.item.id}
              card={card}
              status={props.explanationOf(card.item.id)}
              onDelete={() => props.onDelete(card.item.id)}
              onRetry={() => props.onRetry(card.item.id)}
              onOpenSource={() => props.onOpenSource(card.item.chapterId, card.item.sentenceIdx)}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: { gap: space.sm, paddingHorizontal: gutter, paddingBottom: space.sm },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: minTouchTarget,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: hairline,
  },
  searchInput: { flex: 1, paddingVertical: space.sm, fontSize: 16 },
  list: { gap: space.xl, paddingHorizontal: gutter, paddingBottom: space.xxxl },
  section: { gap: space.md },
  series: { gap: space.sm },
  noMatches: { paddingTop: space.xxl },
});
