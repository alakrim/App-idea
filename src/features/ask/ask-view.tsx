import { useRef } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import type { QaMessage } from '@/core/domain';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { EmptyState } from '@/ui/empty-state';
import { IconButton } from '@/ui/icon-button';
import { ArrowUp, MessagesSquare, Sparkles } from '@/ui/icons';
import { Screen } from '@/ui/screen';
import { Skeleton } from '@/ui/skeleton';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import {
  gutter,
  hairline,
  iconSize,
  iconStrokeWidth,
  minTouchTarget,
  opacity,
  radius,
  space,
} from '@/ui/tokens';

import { AnswerCard } from './answer-card';
import { NO_POSITION_MESSAGE } from './ask-service';
import { SpoilerShield } from './spoiler-shield';

import type { AskSeriesData, AskSeriesOption } from './ask-data';
import type { AskErrorCopy } from './ask-errors';

/** A question that is waiting for its answer, and the failure it hit, if any. */
export interface AskFailure extends AskErrorCopy {
  readonly question: string;
}

export interface AskViewProps {
  options: readonly AskSeriesOption[];
  selectedId: string | null;
  data: AskSeriesData | null;
  draft: string;
  /** The question in flight, or null when idle. */
  sending: string | null;
  failure: AskFailure | null;
  onDraftChange: (text: string) => void;
  onSelectSeries: (seriesId: string) => void;
  onSend: () => void;
  onAsk: (question: string) => void;
  onOpenChapter: (chapterId: string) => void;
  onOpenLibrary: () => void;
  onOpenSettings: () => void;
  onRetry: () => void;
}

const QUESTION_MAX_LENGTH = 500;

/** Presentational Ask screen. Every render state is decided by its props. */
export function AskView(props: AskViewProps) {
  const { options, data } = props;
  const { colors } = useTheme();

  if (options.length === 0) {
    return (
      <Screen title="Ask" scrollable={false}>
        <EmptyState
          icon={MessagesSquare}
          title="Ask about anything you've already heard"
          description="Answers only use the chapters you have reached, so nothing spoils what is still ahead."
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
    <Screen title="Ask" scrollable={false}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <SeriesChips
          options={options}
          selectedId={props.selectedId}
          onSelect={props.onSelectSeries}
        />
        {data?.cutoff ? <SpoilerShield cutoff={data.cutoff} /> : null}
      </View>
      {data === null ? <ThreadSkeleton /> : null}
      {data !== null && data.cutoff === null ? (
        <NotStartedCard onOpenLibrary={props.onOpenLibrary} />
      ) : null}
      {data !== null && data.cutoff !== null ? (
        <>
          <Thread
            data={data}
            sending={props.sending}
            failure={props.failure}
            onAsk={props.onAsk}
            onOpenChapter={props.onOpenChapter}
            onOpenSettings={props.onOpenSettings}
            onRetry={props.onRetry}
            onOpenLibrary={props.onOpenLibrary}
          />
          <Composer
            draft={props.draft}
            busy={props.sending !== null}
            onChange={props.onDraftChange}
            onSend={props.onSend}
          />
        </>
      ) : null}
    </Screen>
  );
}

interface SeriesChipsProps {
  options: readonly AskSeriesOption[];
  selectedId: string | null;
  onSelect: (seriesId: string) => void;
}

function SeriesChips({ options, selectedId, onSelect }: SeriesChipsProps) {
  const { colors } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.chipScroll}
      contentContainerStyle={styles.chipRow}
      accessibilityRole="radiogroup"
      accessibilityLabel="Series to ask about"
    >
      {options.map((option) => {
        const selected = option.id === selectedId;
        return (
          <Pressable
            key={option.id}
            onPress={() => onSelect(option.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.title}
            style={({ pressed }) => [
              styles.seriesChip,
              {
                borderColor: selected ? colors.textMuted : colors.border,
                backgroundColor: selected ? colors.surfaceRaised : colors.surface,
              },
              pressed && styles.pressed,
            ]}
          >
            <Text variant="caption" style={{ color: colors.text }}>
              {option.title}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function ThreadSkeleton() {
  return (
    <View style={styles.threadPad} accessibilityLabel="Loading the conversation">
      <Skeleton height={96} radius="lg" />
      <Skeleton height={48} radius="lg" width="70%" />
    </View>
  );
}

function NotStartedCard({ onOpenLibrary }: { onOpenLibrary: () => void }) {
  return (
    <View style={styles.threadPad}>
      <Card style={styles.centered}>
        <Text variant="heading" align="center" accessibilityRole="header">
          Nothing heard yet
        </Text>
        <Text variant="body" tone="muted" align="center">
          {NO_POSITION_MESSAGE}
        </Text>
        <Button label="Open library" variant="secondary" onPress={onOpenLibrary} />
      </Card>
    </View>
  );
}

interface ThreadProps {
  data: AskSeriesData;
  sending: string | null;
  failure: AskFailure | null;
  onAsk: (question: string) => void;
  onOpenChapter: (chapterId: string) => void;
  onOpenSettings: () => void;
  onRetry: () => void;
  onOpenLibrary: () => void;
}

function Thread({
  data,
  sending,
  failure,
  onAsk,
  onOpenChapter,
  onOpenSettings,
  onRetry,
  onOpenLibrary,
}: ThreadProps) {
  const scroller = useRef<ScrollView>(null);
  const isEmpty = data.thread.length === 0 && sending === null;

  return (
    <ScrollView
      ref={scroller}
      style={styles.thread}
      contentContainerStyle={styles.threadContent}
      keyboardShouldPersistTaps="handled"
      onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}
    >
      {isEmpty ? (
        <Suggestions questions={data.suggestions} onAsk={onAsk} />
      ) : (
        data.thread.map((message) => (
          <MessageRow
            key={message.id}
            message={message}
            data={data}
            onOpenChapter={onOpenChapter}
          />
        ))
      )}
      {sending !== null ? (
        <>
          <UserBubble text={sending} />
          <Card style={styles.pending} accessibilityLabel="Reading your notes">
            <Text variant="caption" tone="muted">
              Reading your notes
            </Text>
            <Skeleton height={12} width="90%" />
            <Skeleton height={12} width="64%" />
          </Card>
        </>
      ) : null}
      {failure !== null ? (
        <FailureCard
          failure={failure}
          onOpenSettings={onOpenSettings}
          onOpenLibrary={onOpenLibrary}
          onRetry={onRetry}
        />
      ) : null}
    </ScrollView>
  );
}

function MessageRow({
  message,
  data,
  onOpenChapter,
}: {
  message: QaMessage;
  data: AskSeriesData;
  onOpenChapter: (chapterId: string) => void;
}) {
  if (message.role === 'user') return <UserBubble text={message.content} />;
  return (
    <AnswerCard text={message.content} chapters={data.chapters} onOpenChapter={onOpenChapter} />
  );
}

function UserBubble({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.userRow}>
      <View style={[styles.userBubble, { backgroundColor: colors.surfaceRaised }]}>
        <Text variant="body">{text}</Text>
      </View>
    </View>
  );
}

function Suggestions({
  questions,
  onAsk,
}: {
  questions: readonly string[];
  onAsk: (question: string) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.suggestions}>
      <View style={styles.suggestionsHeader}>
        <Sparkles size={iconSize.sm} strokeWidth={iconStrokeWidth} color={colors.textMuted} />
        <Text variant="micro" tone="muted">
          Try asking
        </Text>
      </View>
      {questions.map((question) => (
        <Pressable
          key={question}
          onPress={() => onAsk(question)}
          accessibilityRole="button"
          accessibilityLabel={`Ask: ${question}`}
          style={({ pressed }) => [
            styles.suggestion,
            { borderColor: colors.border, backgroundColor: colors.surface },
            pressed && styles.pressed,
          ]}
        >
          <Text variant="body">{question}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function FailureCard({
  failure,
  onOpenSettings,
  onOpenLibrary,
  onRetry,
}: {
  failure: AskFailure;
  onOpenSettings: () => void;
  onOpenLibrary: () => void;
  onRetry: () => void;
}) {
  const onAction =
    failure.action === 'settings'
      ? onOpenSettings
      : failure.action === 'library'
        ? onOpenLibrary
        : onRetry;
  return (
    <View accessibilityLiveRegion="polite">
      <Card style={styles.failure}>
        <Text variant="heading" accessibilityRole="header">
          {failure.title}
        </Text>
        <Text variant="body" tone="muted">
          {failure.message}
        </Text>
        <Button label={failure.actionLabel} variant="secondary" size="md" onPress={onAction} />
      </Card>
    </View>
  );
}

interface ComposerProps {
  draft: string;
  busy: boolean;
  onChange: (text: string) => void;
  onSend: () => void;
}

function Composer({ draft, busy, onChange, onSend }: ComposerProps) {
  const { colors } = useTheme();
  const canSend = draft.trim().length > 0 && !busy;
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View
        style={[styles.composer, { borderColor: colors.border, backgroundColor: colors.surface }]}
      >
        <TextInput
          value={draft}
          onChangeText={onChange}
          placeholder="Ask about the story so far"
          placeholderTextColor={colors.textFaint}
          multiline
          maxLength={QUESTION_MAX_LENGTH}
          accessibilityLabel="Your question"
          style={[styles.input, { color: colors.text }]}
        />
        <IconButton
          label="Send question"
          icon={ArrowUp}
          variant="surface"
          disabled={!canSend}
          onPress={onSend}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.sm, paddingBottom: space.md, borderBottomWidth: hairline },
  /* A horizontal ScrollView grows by default, which would push the composer off the screen. */
  chipScroll: { flexGrow: 0 },
  chipRow: { gap: space.sm, paddingVertical: space.xs },
  seriesChip: {
    minHeight: minTouchTarget,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: hairline,
  },
  pressed: { opacity: opacity.pressed },
  threadPad: { gap: space.md, paddingTop: space.lg },
  centered: { gap: space.md, alignItems: 'center' },
  thread: { flex: 1, minHeight: 0 },
  threadContent: { gap: space.md, paddingVertical: space.lg, paddingHorizontal: gutter },
  userRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  userBubble: {
    maxWidth: '82%',
    borderRadius: radius.lg,
    borderBottomRightRadius: radius.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  pending: { gap: space.sm },
  failure: { gap: space.sm },
  suggestions: { gap: space.sm, paddingTop: space.xl },
  suggestionsHeader: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  suggestion: {
    minHeight: minTouchTarget,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: hairline,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    margin: gutter,
    paddingLeft: space.lg,
    paddingRight: space.xs,
    paddingVertical: space.xs,
    borderRadius: radius.xl,
    borderWidth: hairline,
  },
  input: { flex: 1, maxHeight: 120, paddingVertical: space.sm, fontSize: 16 },
});
