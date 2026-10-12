import { StyleSheet, View } from 'react-native';

import { SettingsSection } from '@/features/settings/settings-section';
import { Text } from '@/ui/text';
import { space } from '@/ui/tokens';

import { parseRecentChapters, type RecentChapter, type StageTiming } from './recent-chapters';

import type { ProbeResult } from './probe';

/** Labels for the run stages. An unknown stage shows its id. */
const STAGE_LABELS: Readonly<Record<string, string>> = {
  extract: 'Extract',
  segment: 'Segment',
  analyze: 'Analyze',
  translate: 'Translate',
  narrate: 'Narrate',
};

/** The "Recent chapters" block: one row per chapter, with each stage's status and time. */
export function RecentChaptersSection({ result }: { result: ProbeResult }) {
  const chapters = parseRecentChapters(result.values);
  return (
    <SettingsSection title="Recent chapters">
      {chapters.length === 0 ? (
        <View style={styles.row}>
          <Text variant="bodyStrong">No chapter has run yet</Text>
          <Text variant="caption" tone="muted">
            Stage times appear here after the first run.
          </Text>
        </View>
      ) : (
        chapters.map((chapter) => <ChapterRow key={chapter.chapterId} chapter={chapter} />)
      )}
    </SettingsSection>
  );
}

function ChapterRow({ chapter }: { chapter: RecentChapter }) {
  return (
    <View style={styles.row}>
      <Text variant="bodyStrong" numberOfLines={1}>
        {chapter.title.trim() === '' ? 'Untitled chapter' : chapter.title}
      </Text>
      <Text variant="caption" tone="muted">
        {`${chapter.segmentCount} passages · ${chapter.audioSeconds} s of audio · ${chapter.chapterStatus}`}
      </Text>
      <View style={styles.stages}>
        {chapter.stages.map((stage) => (
          <StageLine key={stage.stage} stage={stage} />
        ))}
      </View>
    </View>
  );
}

function StageLine({ stage }: { stage: StageTiming }) {
  return (
    <View style={styles.stageRow}>
      <Text variant="caption" tone="muted">
        {STAGE_LABELS[stage.stage] ?? stage.stage}
      </Text>
      <Text variant="caption" selectable>
        {stageText(stage)}
      </Text>
    </View>
  );
}

/** "done · 12.4 s", or the status alone when there is no time to show. */
export function stageText(stage: StageTiming): string {
  return stage.seconds === null ? stage.status : `${stage.status} · ${stage.seconds.toFixed(1)} s`;
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: space.xs,
  },
  stages: {
    gap: space.xxs,
    marginTop: space.xs,
  },
  stageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space.md,
  },
});
