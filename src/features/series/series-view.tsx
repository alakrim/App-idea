import { LinearGradient } from 'expo-linear-gradient';
import { BookOpen, ChevronLeft, Ellipsis, Play, Plus } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { PipelineError, Series } from '@/core/domain';
import type { ChapterProgress } from '@/features/pipeline/facade';
import { withAlpha } from '@/features/shared/color';
import { NEUTRAL_TINT } from '@/features/shared/cover-tint';
import { formatSeriesSummary } from '@/features/shared/format';
import { languagePairLabel } from '@/features/shared/languages';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { CoverImage } from '@/ui/cover-image';
import { EmptyState } from '@/ui/empty-state';
import { IconButton } from '@/ui/icon-button';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { gutter, hairline, radius, space } from '@/ui/tokens';

import { ChapterRow } from './chapter-row';
import { COVER_PICKER_WIDTH } from './cover-picker';

import type { ChapterRecord, PlayTarget } from './series-data';

const HERO_HEIGHT = 400;
const COVER_COLLAPSE_RANGE = [0, 160] as const;
const TITLE_REVEAL_RANGE = [160, 230] as const;

export interface SeriesChapterItem {
  record: ChapterRecord;
  progress: ChapterProgress | null;
  /** The live error when there is one, else the error stored with the failed job. */
  failure: PipelineError | null;
}

export interface SeriesViewProps {
  series: Series;
  chapters: readonly SeriesChapterItem[];
  /** Estimated OCR cost per scanned chapter, keyed by chapter id. */
  ocrPrices: Readonly<Record<string, number>>;
  playTarget: PlayTarget | null;
  onBack: () => void;
  onMenu: () => void;
  onPlay: (chapterId: string) => void;
  onAddChapter: () => void;
  onOpenChapter: (chapterId: string) => void;
  onChapterMenu: (chapterId: string) => void;
  onRetry: (chapterId: string) => void;
  onOcr: (chapterId: string) => void;
}

/**
 * The series screen. The cover shrinks and the title moves into the top bar as the list scrolls.
 * Everything here is driven by props, so the same view serves the live screen and the dev gallery.
 */
export function SeriesView(props: SeriesViewProps) {
  const { series, chapters, playTarget, onBack, onMenu, onPlay, onAddChapter } = props;
  const { colors } = useTheme();
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const coverStyle = useAnimatedStyle(() => {
    const scale = interpolate(scrollY.value, COVER_COLLAPSE_RANGE, [1, 0.8], Extrapolation.CLAMP);
    const opacity = interpolate(scrollY.value, COVER_COLLAPSE_RANGE, [1, 0.4], Extrapolation.CLAMP);
    return { transform: [{ scale }], opacity };
  });
  const washStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, COVER_COLLAPSE_RANGE, [1, 0], Extrapolation.CLAMP),
  }));
  const barStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, TITLE_REVEAL_RANGE, [0, 1], Extrapolation.CLAMP),
  }));

  const tint = series.coverTint ?? NEUTRAL_TINT;
  const pair = languagePairLabel(series.sourceLang, series.targetLang);
  const summary = formatSeriesSummary(
    chapters.length,
    chapters.reduce((sum, item) => sum + (item.record.chapter.durationMs ?? 0), 0),
  );
  const count = chapters.length;

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={[styles.bar, { borderBottomColor: colors.border }]}>
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }, barStyle]}
        />
        <IconButton label="Back to library" icon={ChevronLeft} onPress={onBack} />
        <Animated.View
          style={[styles.barTitle, barStyle]}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          <Text variant="heading" numberOfLines={1} align="center">
            {series.title}
          </Text>
        </Animated.View>
        <IconButton label="Series actions" icon={Ellipsis} onPress={onMenu} />
      </View>

      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, washStyle]}>
            <LinearGradient
              colors={[withAlpha(tint, 0.55), withAlpha(tint, 0.18), colors.bg]}
              locations={[0, 0.6, 1]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
          <Animated.View style={[styles.coverShadow, coverStyle]}>
            <CoverImage uri={series.coverUri} title={series.title} style={styles.cover} />
          </Animated.View>
          <Text
            variant="display"
            align="center"
            numberOfLines={2}
            accessibilityRole="header"
            style={styles.title}
          >
            {series.title}
          </Text>
          <View style={styles.meta}>
            {pair ? <Badge label={pair} tone="accent" /> : null}
            <Text variant="caption" tone="muted">
              {summary}
            </Text>
          </View>
        </View>

        <View style={styles.actions}>
          <View style={styles.primary}>
            <Button
              label={playTarget?.resume ? 'Continue' : 'Play'}
              icon={Play}
              size="lg"
              fullWidth
              disabled={playTarget === null}
              accessibilityHint={playTarget === null ? 'Process a chapter first' : undefined}
              onPress={() => {
                if (playTarget) onPlay(playTarget.chapterId);
              }}
            />
          </View>
          <Button
            label="Add chapter"
            icon={Plus}
            variant="secondary"
            size="lg"
            onPress={onAddChapter}
          />
        </View>

        {count === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No chapters yet"
            description="Add a link, a PDF or pasted text. You see the cost before anything is spent."
            action={{ label: 'Add your first chapter', icon: Plus, onPress: onAddChapter }}
          />
        ) : (
          <View style={styles.list}>
            <View style={styles.sectionRow}>
              <Text variant="heading" accessibilityRole="header">
                Chapters
              </Text>
              <Text variant="caption" tone="muted">
                {String(count)}
              </Text>
            </View>
            <Card style={styles.flush}>
              {chapters.map((item, index) => (
                <ChapterRow
                  key={item.record.chapter.id}
                  number={index + 1}
                  chapter={item.record.chapter}
                  progress={item.progress}
                  failure={item.failure}
                  ocrUsd={props.ocrPrices[item.record.chapter.id] ?? null}
                  divided={index > 0}
                  onOpen={props.onOpenChapter}
                  onPlay={onPlay}
                  onMenu={props.onChapterMenu}
                  onRetry={props.onRetry}
                  onOcr={props.onOcr}
                />
              ))}
            </Card>
          </View>
        )}
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.sm,
    borderBottomWidth: hairline,
  },
  barTitle: {
    position: 'absolute',
    left: space.xxxl,
    right: space.xxxl,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  content: {
    paddingBottom: space.xxxl,
  },
  hero: {
    alignItems: 'center',
    paddingTop: space.lg,
    paddingBottom: space.xl,
    gap: space.md,
    paddingHorizontal: gutter,
    minHeight: HERO_HEIGHT - space.xl,
    overflow: 'hidden',
  },
  coverShadow: {
    borderRadius: radius.md,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: space.lg,
    shadowOffset: { width: 0, height: space.sm },
    elevation: space.md,
    marginBottom: space.sm,
  },
  cover: {
    width: COVER_PICKER_WIDTH,
  },
  title: {
    maxWidth: 320,
  },
  meta: {
    alignItems: 'center',
    gap: space.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: space.md,
    paddingHorizontal: gutter,
  },
  primary: {
    flex: 1,
  },
  list: {
    paddingHorizontal: gutter,
    paddingTop: space.xxl,
    gap: space.md,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  flush: {
    padding: 0,
    overflow: 'hidden',
  },
});
