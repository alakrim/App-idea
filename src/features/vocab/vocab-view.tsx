import { SectionList, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/ui/button';
import { EmptyState } from '@/ui/empty-state';
import { BookA, Search } from '@/ui/icons';
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
  typography,
} from '@/ui/tokens';

import { VocabCard, type ExplanationStatus } from './vocab-card';

import type { VocabLanguageGroup, VocabSeriesGroup } from './vocab-data';

type CardEntry = VocabSeriesGroup['cards'][number];

/** One series inside one language, so the list can be a SectionList with a header per series. */
interface VocabSection {
  key: string;
  languageLabel: string;
  title: string;
  data: CardEntry[];
}

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
          description="Press and hold a sentence while you listen, then choose Save to Vocab."
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
        <SectionList<CardEntry, VocabSection>
          sections={sectionsOf(props.groups)}
          keyExtractor={(card) => card.item.id}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHead}>
              <Text variant="micro" tone="muted" accessibilityRole="header">
                {section.languageLabel}
              </Text>
              <Text variant="caption" tone="muted">
                {section.title}
              </Text>
            </View>
          )}
          renderItem={({ item: card }) => (
            <VocabCard
              card={card}
              status={props.explanationOf(card.item.id)}
              onDelete={() => props.onDelete(card.item.id)}
              onRetry={() => props.onRetry(card.item.id)}
              onOpenSource={() => props.onOpenSource(card.item.chapterId, card.item.sentenceIdx)}
            />
          )}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          stickySectionHeadersEnabled={false}
        />
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
        <Search size={iconSize.sm} strokeWidth={iconStrokeWidth} color={colors.decorativeFaint} />
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

/** Flattens the language groups into one section per series, keeping the language as its label. */
function sectionsOf(groups: readonly VocabLanguageGroup[]): VocabSection[] {
  return groups.flatMap((group) =>
    group.series.map((series) => ({
      key: `${group.lang}:${series.seriesId}`,
      languageLabel: group.label,
      title: series.title,
      data: series.cards,
    })),
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
  searchInput: { flex: 1, paddingVertical: space.sm, fontSize: typography.body.size },
  list: { gap: space.md, paddingHorizontal: gutter, paddingBottom: space.xxxl },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space.sm,
    paddingTop: space.lg,
    paddingBottom: space.xs,
  },
  noMatches: { paddingTop: space.xxl },
});
