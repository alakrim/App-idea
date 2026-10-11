import { setStringAsync } from 'expo-clipboard';
import { router } from 'expo-router';
import {
  AudioLines,
  ChevronDown,
  CloudRain,
  Gauge,
  Headphones,
  Repeat1,
} from 'lucide-react-native';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Sentence } from '@/core/domain';
import { CoverImage } from '@/ui/cover-image';
import { EmptyState } from '@/ui/empty-state';
import { ErrorState } from '@/ui/error-state';
import { IconButton } from '@/ui/icon-button';
import { useMotion } from '@/ui/motion';
import { Skeleton } from '@/ui/skeleton';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { useToast } from '@/ui/toast';
import { gutter, space } from '@/ui/tokens';

import { activeAmbienceNames } from './ambience-names';
import { AmbienceSheet } from './ambience-sheet';
import { PlayerBackdrop } from './backdrop';
import { Chip } from './chip';
import { formatRate } from './format';
import { PLAYER } from './layout';
import { usePlayback, usePlaybackContent, usePlayerState } from './player-provider';
import { Scrubber } from './scrubber';
import { SentenceSheet } from './sentence-sheet';
import { SleepChip, SleepSheet } from './sleep-timer';
import { SpeedSheet } from './speed-sheet';
import { SyncedTextPane, displayText } from './synced-text-pane';
import { Transport } from './transport';
import { useVocabActions } from './vocab-actions';

type OpenSheet = 'speed' | 'sleep' | 'ambience' | null;

const COVER_MIN_HEIGHT = 120;
const COVER_MAX_HEIGHT = PLAYER.coverMaxHeight;
const COVER_PRESSED_SCALE = 0.94;
const COVER_HEIGHT_PADDING = space.xl;

/** The full player. It renders every state the content can be in: empty, loading, ready and failed. */
export function FullPlayer() {
  const nowPlaying = usePlayerState((state) => state.nowPlaying);
  const contentStatus = usePlaybackContent((content) => content.status);

  if (nowPlaying === null && contentStatus === 'idle') {
    return <EmptyPlayer />;
  }
  if (contentStatus === 'loading' || (contentStatus === 'idle' && nowPlaying !== null)) {
    return <LoadingPlayer title={nowPlaying?.title ?? ''} />;
  }
  if (contentStatus === 'unavailable') {
    return <UnavailablePlayer />;
  }
  if (contentStatus === 'error') {
    return <FailedPlayer />;
  }
  return <ReadyPlayer />;
}

/** Close button, and the "Now playing" label that sits over every state. */
function TopBar() {
  return (
    <View style={styles.topBar}>
      <IconButton label="Close player" icon={ChevronDown} onPress={() => router.back()} />
      <Text variant="micro" tone="muted">
        Now playing
      </Text>
      <View style={styles.topBarSpacer} />
    </View>
  );
}

function PlayerFrame({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
      <TopBar />
      {children}
    </View>
  );
}

function EmptyPlayer() {
  return (
    <PlayerFrame>
      <EmptyState
        icon={Headphones}
        title="Nothing playing"
        description="Pick a chapter from your library to start listening."
        action={{ label: 'Go to Library', onPress: () => router.navigate('/') }}
      />
    </PlayerFrame>
  );
}

function LoadingPlayer({ title }: { title: string }) {
  return (
    <PlayerFrame>
      <View style={styles.loading} accessibilityLabel={`Loading ${title || 'chapter'}`}>
        <Skeleton height={COVER_MAX_HEIGHT} width={(COVER_MAX_HEIGHT * 2) / 3} radius="md" />
        <Skeleton height={space.xl} width="70%" />
        <Skeleton height={space.md} width="40%" />
      </View>
    </PlayerFrame>
  );
}

function UnavailablePlayer() {
  return (
    <PlayerFrame>
      <EmptyState
        icon={AudioLines}
        title="Not narrated yet"
        description="This chapter has no audio yet. Process it from the Library, then come back to listen."
        action={{ label: 'Back to Library', onPress: () => router.navigate('/') }}
      />
    </PlayerFrame>
  );
}

function FailedPlayer() {
  const controller = usePlayback();
  const chapterId = usePlaybackContent((content) => content.chapterId);
  return (
    <PlayerFrame>
      <ErrorState
        title="Couldn't start this chapter"
        message="Check your connection and try again. Your place is saved."
        retryLabel="Try again"
        onRetry={() => {
          if (chapterId) void controller.playChapter(chapterId);
        }}
      />
    </PlayerFrame>
  );
}

function ReadyPlayer() {
  const { colors } = useTheme();
  const { reduced, springTo } = useMotion();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const controller = usePlayback();
  const vocab = useVocabActions();
  const toast = useToast();
  const [sheet, setSheet] = useState<OpenSheet>(null);
  const [actionSentence, setActionSentence] = useState<Sentence | null>(null);
  const [centerHeight, setCenterHeight] = useState(0);

  const title = usePlayerState((state) => state.nowPlaying?.title ?? '');
  const seriesTitle = usePlayerState((state) => state.nowPlaying?.seriesTitle ?? '');
  const coverUri = usePlayerState((state) => state.nowPlaying?.coverUri ?? null);
  const playState = usePlayerState((state) => state.state);
  const positionMs = usePlayerState((state) => state.positionMs);
  const sentenceIdx = usePlayerState((state) => state.sentenceIdx);
  const rate = usePlayerState((state) => state.rate);
  const timeline = usePlaybackContent((content) => content.timeline);
  const sentences = usePlaybackContent((content) => content.sentences);
  const paragraphs = usePlaybackContent((content) => content.paragraphs);
  const cues = usePlaybackContent((content) => content.cues);
  const coverTint = usePlaybackContent((content) => content.coverTint);
  const loopIdx = usePlaybackContent((content) => content.loopSentenceIdx);
  const ambience = usePlaybackContent((content) => content.ambience);

  const durationMs = timeline?.totalDurationMs ?? 0;
  const availableCount = timeline?.sentenceCount ?? 0;
  const busy = playState === 'loading' || playState === 'buffering';
  const playing = playState === 'playing';

  const tickMs = useMemo(
    () =>
      timeline
        ? Array.from({ length: timeline.sentenceCount }, (_, idx) =>
            timeline.sentenceToPosition(idx),
          )
        : [],
    [timeline],
  );
  const activeNames = useMemo(() => activeAmbienceNames(cues, sentenceIdx), [cues, sentenceIdx]);

  const coverHeight = Math.min(
    COVER_MAX_HEIGHT,
    Math.max(COVER_MIN_HEIGHT, centerHeight - COVER_HEIGHT_PADDING),
  );
  const coverWidth = (coverHeight * 2) / 3;

  const coverScale = useSharedValue(1);
  useEffect(() => {
    coverScale.value = springTo(playing ? 1 : COVER_PRESSED_SCALE, 'gentle');
  }, [playing, coverScale, springTo]);
  const coverStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduced ? 1 : coverScale.value }],
  }));

  const ambienceLabel = !ambience.enabled
    ? 'Ambience off'
    : activeNames.length > 0
      ? activeNames.join(' · ')
      : 'Ambience';

  const closeSheet = () => setSheet(null);
  const repeat = (sentence: Sentence) => {
    controller.setLoopSentence(sentence.idx);
    setActionSentence(null);
  };
  const copy = (sentence: Sentence) => {
    void setStringAsync(displayText(sentence));
    toast.show({ message: 'Sentence copied', tone: 'success' });
    setActionSentence(null);
  };
  const saveVocab = (sentence: Sentence) => {
    vocab.onSaveVocab({ chapterId: sentence.chapterId, idx: sentence.idx }, displayText(sentence));
    toast.show({ message: 'Saved to Vocab' });
    setActionSentence(null);
  };

  const panelOpenHeight = windowHeight * PLAYER.paneHeightRatio;
  const peekHeight = PLAYER.peekHeight + insets.bottom;

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <PlayerBackdrop uri={coverUri} title={title} tint={coverTint} />
      <View style={[styles.column, { paddingTop: insets.top, paddingBottom: peekHeight }]}>
        <TopBar />

        <View
          style={styles.center}
          onLayout={(event) => setCenterHeight(event.nativeEvent.layout.height)}
        >
          <Animated.View style={[styles.coverWrap, coverStyle]}>
            <CoverImage
              uri={coverUri}
              title={title}
              style={{ width: coverWidth, height: coverHeight }}
              testID="player-cover"
            />
          </Animated.View>
          <View style={styles.meta}>
            <Text variant="micro" tone="muted" align="center" numberOfLines={1}>
              {seriesTitle}
            </Text>
            <Text variant="title" align="center" numberOfLines={2}>
              {title}
            </Text>
            <Chip
              label={ambienceLabel}
              accessibilityLabel={`Ambience, ${ambienceLabel}`}
              hint="Opens the ambience settings"
              icon={CloudRain}
              active={ambience.enabled && activeNames.length > 0}
              onPress={() => setSheet('ambience')}
              testID="ambience-chip"
            />
          </View>
        </View>

        <View style={styles.controls}>
          <View style={styles.inset}>
            <Scrubber
              positionMs={positionMs}
              durationMs={durationMs}
              tickMs={tickMs}
              onSeek={(ms) => controller.seekToMs(ms)}
            />
          </View>
          <Transport
            playing={playing}
            busy={busy}
            onTogglePlay={() => controller.player.togglePlay()}
            onSkip={(deltaMs) => controller.seekBy(deltaMs)}
            onSentence={(direction) => controller.stepSentence(direction)}
          />
          <View style={[styles.inset, styles.chips]}>
            <Chip
              label={formatRate(rate)}
              accessibilityLabel={`Speed ${formatRate(rate)}`}
              hint="Opens speed settings"
              icon={Gauge}
              onPress={() => setSheet('speed')}
              testID="speed-chip"
            />
            <SleepChip onPress={() => setSheet('sleep')} />
            {loopIdx !== null ? (
              <Chip
                label="Repeat sentence"
                icon={Repeat1}
                active
                hint="Stops repeating the sentence"
                onPress={() => controller.setLoopSentence(null)}
              />
            ) : null}
          </View>
        </View>
      </View>

      <SyncedTextPane
        paragraphs={paragraphs}
        sentences={sentences}
        availableCount={availableCount}
        currentIdx={sentenceIdx}
        loopIdx={loopIdx}
        openHeight={panelOpenHeight}
        peekHeight={peekHeight}
        onSeekSentence={(idx) => controller.seekToSentence(idx)}
        onLongPressSentence={(idx) => {
          const sentence = sentences[idx];
          if (sentence) setActionSentence(sentence);
        }}
      />

      <SpeedSheet visible={sheet === 'speed'} onClose={closeSheet} />
      <SleepSheet visible={sheet === 'sleep'} onClose={closeSheet} />
      <AmbienceSheet
        visible={sheet === 'ambience'}
        onClose={closeSheet}
        activeNames={activeNames}
      />
      <SentenceSheet
        sentence={actionSentence}
        onClose={() => setActionSentence(null)}
        onRepeat={repeat}
        onCopy={copy}
        onSaveVocab={saveVocab}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  column: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: gutter,
  },
  topBarSpacer: {
    width: 44,
    height: 44,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.lg,
    paddingHorizontal: gutter,
  },
  coverWrap: {
    alignItems: 'center',
  },
  meta: {
    alignItems: 'center',
    gap: space.xs,
    maxWidth: '100%',
  },
  controls: {
    gap: space.lg,
    paddingBottom: space.lg,
  },
  inset: {
    paddingHorizontal: gutter,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: space.sm,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
  },
});
