import { useCallback, useRef, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { AmbienceCue, Chapter, Job, PipelineError, Series, Stage } from '@/core/domain';
import type { ChapterProgress } from '@/features/pipeline/facade';
import { formatDuration, formatUsd, formatWordCount } from '@/features/shared/format';
import { useNow } from '@/features/shared/use-now';
import { Badge, type BadgeTone } from '@/ui/badge';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { ErrorState } from '@/ui/error-state';
import { IconButton } from '@/ui/icon-button';
import { ChevronLeft, Play } from '@/ui/icons';
import { useMotion } from '@/ui/motion';
import { SegmentedControl } from '@/ui/segmented-control';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { gutter, hairline, space } from '@/ui/tokens';

import { AmbienceList } from './ambience-list';
import { isTranslated, type ReadingParagraph } from './chapter-data';
import { rowStateOf, statusLine } from './chapter-status';
import { READING_MODES, ReadingText, type ReadingMode } from './reading-text';
import { StageStepper } from './stage-stepper';
import { stepStates } from './stage-steps';
import { useSentenceFocus } from './use-sentence-focus';
import { useSentenceScroll } from './use-sentence-scroll';

const STATE_BADGE: Record<ReturnType<typeof rowStateOf>, { label: string; tone: BadgeTone }> = {
  draft: { label: 'Not processed', tone: 'neutral' },
  processing: { label: 'Processing', tone: 'accent' },
  ready: { label: 'Ready', tone: 'success' },
  failed: { label: 'Stopped', tone: 'danger' },
};

/** How often the processing card refreshes its elapsed time. */
const LIVE_TICK_MS = 1000;

const STAGE_NAMES: Readonly<Record<Stage, string>> = {
  extract: 'Extract',
  clean: 'Clean',
  segment: 'Split',
  analyze: 'Analyze',
  translate: 'Translate',
  narrate: 'Narrate',
};

export interface ChapterViewProps {
  chapter: Chapter;
  series: Series | null;
  progress: ChapterProgress | null;
  failure: PipelineError | null;
  jobs: readonly Job[];
  paragraphs: readonly ReadingParagraph[];
  cues: readonly AmbienceCue[];
  onBack: () => void;
  onPlay: (chapterId: string) => void;
  onRetry: (chapterId: string) => void;
  onToggleCue: (cueId: string, enabled: boolean) => void;
  /** A sentence to scroll to and highlight, from a deep link. Null for none. */
  focusSentence?: number | null;
}

/** A chapter: its state and processing, the reading view with its modes, and the ambience cues. */
export function ChapterView({
  chapter,
  series,
  progress,
  failure,
  jobs,
  paragraphs,
  cues,
  onBack,
  onPlay,
  onRetry,
  onToggleCue,
  focusSentence = null,
}: ChapterViewProps) {
  const { colors } = useTheme();
  const { reduced } = useMotion();
  const [mode, setMode] = useState<ReadingMode>('translation');
  const scrollRef = useRef<ScrollView>(null);
  const scrollToY = useCallback((y: number, animated: boolean) => {
    scrollRef.current?.scrollTo({ y, animated });
  }, []);
  const scroll = useSentenceScroll({ focusSentence, paragraphs, reduced, scrollTo: scrollToY });
  const highlight = useSentenceFocus(focusSentence, reduced);
  const state = rowStateOf(chapter, progress);
  const now = useNow(LIVE_TICK_MS, state === 'processing');
  const badge = STATE_BADGE[state];
  const translated = isTranslated(paragraphs);
  const effectiveMode: ReadingMode = translated ? mode : 'original';
  const spent = jobs.reduce((sum, job) => sum + job.costUsd, 0);
  const steps = stepStates(progress?.stages ?? jobsAsStages(jobs));
  const words = chapter.wordCount;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={styles.bar}>
        <IconButton label="Back" icon={ChevronLeft} onPress={onBack} />
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          {series ? (
            <Text variant="micro" tone="accent" numberOfLines={1}>
              {series.title}
            </Text>
          ) : null}
          <Text variant="title" accessibilityRole="header" numberOfLines={3}>
            {chapter.title}
          </Text>
          <View style={styles.meta}>
            <Badge label={badge.label} tone={badge.tone} />
            {chapter.durationMs !== null ? (
              <Text variant="caption" tone="muted">
                {formatDuration(chapter.durationMs)}
              </Text>
            ) : null}
            {words !== null ? (
              <Text variant="caption" tone="muted">
                {formatWordCount(words)}
              </Text>
            ) : null}
          </View>
        </View>

        <Button
          label="Play chapter"
          icon={Play}
          size="lg"
          fullWidth
          disabled={state !== 'ready'}
          onPress={() => onPlay(chapter.id)}
        />

        {state === 'failed' ? (
          <ErrorState
            title="Processing stopped"
            message={failure?.message ?? statusLine(state, chapter, progress, failure, now)}
            retryLabel="Try again"
            onRetry={() => onRetry(chapter.id)}
          />
        ) : null}

        {state === 'processing' || jobs.length > 0 ? (
          <Section title="Processing" trailing={`${formatUsd(spent)} spent`}>
            <Card>
              <StageStepper steps={steps} />
              {state === 'processing' ? (
                <Text variant="caption" tone="muted" style={styles.live}>
                  {statusLine(state, chapter, progress, failure, now)}
                </Text>
              ) : null}
            </Card>
            <Card style={styles.flush}>
              {jobs
                .slice()
                .sort((a, b) => stageOrder(a.stage) - stageOrder(b.stage))
                .map((job, index) => (
                  <View
                    key={job.id}
                    style={[
                      styles.costRow,
                      index > 0
                        ? { borderTopWidth: hairline, borderTopColor: colors.border }
                        : null,
                    ]}
                  >
                    <Text variant="body">{STAGE_NAMES[job.stage]}</Text>
                    <Text variant="caption" tone="muted">
                      {job.costUsd > 0
                        ? formatUsd(job.costUsd)
                        : job.status === 'skipped'
                          ? 'Not needed'
                          : '—'}
                    </Text>
                  </View>
                ))}
            </Card>
          </Section>
        ) : null}

        {paragraphs.length > 0 ? (
          <Section
            title="Text"
            testID="chapter-text-section"
            onLayout={(event) => scroll.onSectionLayout(event.nativeEvent.layout.y)}
          >
            {translated ? (
              <SegmentedControl
                label="Reading mode"
                options={READING_MODES}
                value={effectiveMode}
                onChange={setMode}
              />
            ) : null}
            <View
              testID="chapter-reading-text"
              onLayout={(event: LayoutChangeEvent) =>
                scroll.onReadingLayout(event.nativeEvent.layout.y)
              }
            >
              <ReadingText
                paragraphs={paragraphs}
                mode={effectiveMode}
                sourceLang={chapter.sourceLang}
                highlight={highlight}
                onParagraphLayout={scroll.onParagraphLayout}
              />
            </View>
          </Section>
        ) : null}

        <Section title="Ambience" trailing={cues.length > 0 ? String(cues.length) : undefined}>
          <AmbienceList cues={cues} onToggle={onToggleCue} />
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function stageOrder(stage: Stage): number {
  return ['extract', 'clean', 'segment', 'analyze', 'translate', 'narrate'].indexOf(stage);
}

/** Once a chapter is no longer live, the stored jobs say where each stage ended. */
function jobsAsStages(jobs: readonly Job[]): ChapterProgress['stages'] {
  return jobs.map((job) => ({
    stage: job.stage,
    status: job.status,
    progress: job.progress,
    since: null,
    passages: null,
  }));
}

interface SectionProps {
  title: string;
  trailing?: string;
  children: ReactNode;
  onLayout?: (event: LayoutChangeEvent) => void;
  testID?: string;
}

function Section({ title, trailing, children, onLayout, testID }: SectionProps) {
  return (
    <View style={styles.section} onLayout={onLayout} testID={testID}>
      <View style={styles.sectionHead}>
        <Text variant="heading" accessibilityRole="header">
          {title}
        </Text>
        {trailing ? (
          <Text variant="caption" tone="muted">
            {trailing}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  bar: {
    flexDirection: 'row',
    paddingHorizontal: space.sm,
  },
  content: {
    paddingHorizontal: gutter,
    paddingTop: space.sm,
    paddingBottom: space.xxxl,
    gap: space.xl,
  },
  header: {
    gap: space.sm,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.md,
  },
  section: {
    gap: space.md,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  flush: {
    padding: 0,
    overflow: 'hidden',
  },
  live: {
    marginTop: space.md,
  },
  costRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
});
