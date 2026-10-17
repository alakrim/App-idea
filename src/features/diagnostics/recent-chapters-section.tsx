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
  const activity = activityText(stage);
  return (
    <View>
      <View style={styles.stageRow}>
        <Text variant="caption" tone="muted">
          {STAGE_LABELS[stage.stage] ?? stage.stage}
        </Text>
        <Text variant="caption" selectable>
          {stageText(stage)}
        </Text>
      </View>
      {activity === null ? null : (
        <Text variant="caption" tone="faint" selectable style={styles.activity}>
          {activity}
        </Text>
      )}
    </View>
  );
}

/** "done · 12.4 s", or the status alone when there is no time to show. */
export function stageText(stage: StageTiming): string {
  return stage.seconds === null ? stage.status : `${stage.status} · ${stage.seconds.toFixed(1)} s`;
}

/**
 * "last activity 14:02:11 · 2 stalls · 1 stale abort", or null for a stage that never moved. The
 * stall and stale-abort counts appear only when they are not zero.
 */
export function activityText(stage: StageTiming): string | null {
  if (stage.lastActivityAt === null) return null;
  const parts = [`last activity ${clockTime(stage.lastActivityAt)}`];
  if (stage.stallCount > 0) parts.push(countOf(stage.stallCount, 'stall', 'stalls'));
  if (stage.staleAbortCount > 0) {
    parts.push(countOf(stage.staleAbortCount, 'stale abort', 'stale aborts'));
  }
  return parts.join(' · ');
}

function countOf(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Local time of day, to the second: "14:02:11". */
function clockTime(epochMs: number): string {
  return new Date(epochMs).toTimeString().slice(0, 8);
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
  activity: {
    textAlign: 'right',
  },
});
