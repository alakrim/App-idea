import { setStringAsync } from 'expo-clipboard';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Sentence } from '@/core/domain';
import { findBookmark, findBookmarkById } from '@/features/bookmarks/bookmark-data';
import { BookmarkNoteSheet } from '@/features/bookmarks/bookmark-note-sheet';
import { BookmarksSheet } from '@/features/bookmarks/bookmarks-sheet';
import { ambienceIconOf } from '@/features/shared/ambience-display';
import { goBackOrHome } from '@/features/shared/navigation';
import { useVocabActions } from '@/features/vocab/vocab-actions';
import { CoverImage } from '@/ui/cover-image';
import { EmptyState } from '@/ui/empty-state';
import { ErrorState } from '@/ui/error-state';
import { IconButton } from '@/ui/icon-button';
import {
  AudioLines,
  Bookmark,
  ChevronDown,
  CloudRain,
  Gauge,
  Headphones,
  Repeat1,
} from '@/ui/icons';
import { useMotion } from '@/ui/motion';
import { Skeleton } from '@/ui/skeleton';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { useToast } from '@/ui/toast';
import { gutter, minTouchTarget, space } from '@/ui/tokens';

import { activeAmbience } from './ambience-names';
import { AmbienceSheet } from './ambience-sheet';
import { PlayerBackdrop } from './backdrop';
import { Chip } from './chip';
import { formatRate } from './format';
import { PLAYER } from './layout';
import { usePlayback, usePlaybackContent, usePlayerState } from './player-provider';
import { PlayerScrubber } from './scrubber';
import { SentenceSheet } from './sentence-sheet';
import { SleepChip, SleepSheet } from './sleep-timer';
import { SpeedSheet } from './speed-sheet';
import { SyncedTextPane, displayText, type SentenceAction } from './synced-text-pane';
import { Transport } from './transport';
import { useNarratingAhead } from './use-narrating-ahead';

type OpenSheet = 'speed' | 'sleep' | 'ambience' | 'bookmarks' | null;

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

interface TopBarProps {
  label?: string;
  /** An action at the right end, such as Bookmarks. Empty states leave it out. */
  trailing?: ReactNode;
}

/** Close button, with an optional label. The label is left out where it would contradict the state. */
function TopBar({ label = 'Now playing', trailing }: TopBarProps) {
  return (
    <View style={styles.topBar}>
      <IconButton label="Close player" icon={ChevronDown} onPress={goBackOrHome} />
      <Text variant="micro" tone="muted">
        {label}
      </Text>
      {trailing ?? <View style={styles.topBarSpacer} />}
    </View>
  );
}

function PlayerFrame({ children, label }: { children: ReactNode; label?: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
      <TopBar label={label} />
      {children}
    </View>
  );
}

function EmptyPlayer() {
  return (
    <PlayerFrame label="">
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

/** The copy names what failed. None of it blames the connection: playback reads files on this phone. */
const FAILURE_COPY = {
  load: {
    title: "Couldn't open this chapter",
    message: 'Its narration could not be read from this phone. Your place is saved.',
  },
  playback: {
    title: 'Playback stopped',
    message: 'The audio player hit a problem. Your place is saved.',
  },
} as const;

function FailedPlayer() {
  const controller = usePlayback();
  const chapterId = usePlaybackContent((content) => content.chapterId);
  const failure = usePlaybackContent((content) => content.failure);
  const copy = FAILURE_COPY[failure ?? 'load'];
  return (
    <PlayerFrame>
      <ErrorState
        title={copy.title}
        message={copy.message}
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
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [centerHeight, setCenterHeight] = useState(0);

  // The full player does not subscribe to the position: the scrubber and the text pane that need
  // it do, so the rest of the screen only re-renders when the sentence or the play state changes.
  const title = usePlayerState((state) => state.nowPlaying?.title ?? '');
  const seriesTitle = usePlayerState((state) => state.nowPlaying?.seriesTitle ?? '');
  const seriesId = usePlaybackContent((content) => content.seriesId);
  const coverUri = usePlayerState((state) => state.nowPlaying?.coverUri ?? null);
  const playState = usePlayerState((state) => state.state);
  const sentenceIdx = usePlayerState((state) => state.sentenceIdx);
  const rate = usePlayerState((state) => state.rate);
  const timeline = usePlaybackContent((content) => content.timeline);
  const sentences = usePlaybackContent((content) => content.sentences);
  const paragraphs = usePlaybackContent((content) => content.paragraphs);
  const cues = usePlaybackContent((content) => content.cues);
  const coverTint = usePlaybackContent((content) => content.coverTint);
  const loopIdx = usePlaybackContent((content) => content.loopSentenceIdx);
  const ambience = usePlaybackContent((content) => content.ambience);
  const narrationPaused = usePlaybackContent((content) => content.narrationPaused);
  const chapterId = usePlaybackContent((content) => content.chapterId);
  const bookmarks = usePlaybackContent((content) => content.bookmarks);

  const availableCount = timeline?.sentenceCount ?? 0;
  const narratingAhead = useNarratingAhead();
  const busy = (playState === 'loading' || playState === 'buffering') && !narratingAhead;
  const playing = playState === 'playing' || narratingAhead;
  /** Out of audio while processing is stopped: calm copy, not a spinner (P1-5). */
  const showPaused = narrationPaused && playState === 'buffering';

  const activeCues = useMemo(() => activeAmbience(cues, sentenceIdx), [cues, sentenceIdx]);
  const activeNames = activeCues.map((entry) => entry.label);

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
  const repeat = useCallback(
    (sentence: Sentence) => {
      controller.setLoopSentence(sentence.idx);
      setActionSentence(null);
    },
    [controller],
  );
  const copy = useCallback(
    (sentence: Sentence) => {
      setStringAsync(displayText(sentence))
        .then(() => toast.show({ message: 'Sentence copied', tone: 'success' }))
        .catch(() => toast.show({ message: 'Could not copy the sentence', tone: 'danger' }));
      setActionSentence(null);
    },
    [toast],
  );
  /** Saves the sentence. The toast confirms only a save that happened. */
  const saveVocab = useCallback(
    (sentence: Sentence) => {
      if (seriesId === null) return;
      const input = {
        seriesId,
        chapterId: sentence.chapterId,
        sentenceIdx: sentence.idx,
        text: displayText(sentence),
      };
      try {
        if (vocab.hasSaved(input)) {
          toast.show({ message: 'Already in Vocab' });
        } else {
          vocab.saveToVocab(input);
          toast.show({ message: 'Saved to Vocab' });
        }
      } catch {
        toast.show({ message: 'Nothing to save in this sentence', tone: 'danger' });
        return;
      }
      setActionSentence(null);
    },
    [seriesId, vocab, toast],
  );

  const bookmarked = findBookmark(bookmarks, chapterId, sentenceIdx) !== null;
  const actionBookmarked =
    actionSentence !== null && findBookmark(bookmarks, chapterId, actionSentence.idx) !== null;

  /**
   * Bookmarks or un-bookmarks a sentence. A new bookmark says so and offers a note, which is the
   * moment a listener usually wants one; removing it just confirms.
   */
  const toggleBookmark = useCallback(
    (idx: number) => {
      const result = controller.toggleBookmark(idx);
      if (result === null) return;
      if (result.kind === 'removed') {
        toast.show({ message: 'Bookmark removed' });
        return;
      }
      const bookmarkId = result.bookmark.id;
      toast.show({
        message: 'Bookmarked',
        tone: 'success',
        action: { label: 'Add note', onPress: () => setNoteFor(bookmarkId) },
      });
    },
    [controller, toast],
  );

  const seekSentence = useCallback((idx: number) => controller.seekToSentence(idx), [controller]);
  const openSentenceActions = useCallback(
    (idx: number) => {
      const sentence = sentences[idx];
      if (sentence) setActionSentence(sentence);
    },
    [sentences],
  );
  /** The same actions as the long press, for screen readers: repeat, copy and save to Vocab. */
  const runSentenceAction = useCallback(
    (idx: number, action: SentenceAction) => {
      const sentence = sentences[idx];
      if (!sentence) return;
      if (action === 'repeat') controller.setLoopSentence(idx);
      else if (action === 'copy') copy(sentence);
      else saveVocab(sentence);
    },
    [controller, sentences, copy, saveVocab],
  );

  const panelOpenHeight = windowHeight * PLAYER.paneHeightRatio;
  const peekHeight = PLAYER.peekHeight + insets.bottom;

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <PlayerBackdrop uri={coverUri} title={title} tint={coverTint} />
      <View style={[styles.column, { paddingTop: insets.top, paddingBottom: peekHeight }]}>
        <TopBar
          trailing={
            <IconButton label="Bookmarks" icon={Bookmark} onPress={() => setSheet('bookmarks')} />
          }
        />

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
              icon={activeCues[0] ? ambienceIconOf(activeCues[0].id) : CloudRain}
              value={ambience.enabled && activeNames.length > 0 ? 'On' : 'Off'}
              onPress={() => setSheet('ambience')}
              testID="ambience-chip"
            />
          </View>
        </View>

        <View style={styles.controls}>
          <View style={styles.inset}>
            <PlayerScrubber />
          </View>
          <Transport
            playing={playing}
            busy={busy}
            narratingAhead={narratingAhead}
            bookmarked={bookmarked}
            onTogglePlay={() => controller.player.togglePlay()}
            onSkip={(deltaMs) => controller.seekBy(deltaMs)}
            onSentence={(direction) => controller.stepSentence(direction)}
            onBookmark={() => toggleBookmark(sentenceIdx)}
          />
          {showPaused ? (
            <View style={styles.inset}>
              <Text variant="caption" tone="muted" align="center" accessibilityLiveRegion="polite">
                Narration paused. More audio will appear when processing continues.
              </Text>
            </View>
          ) : null}
          <View style={[styles.inset, styles.chips]}>
            <Chip
              label={formatRate(rate)}
              accessibilityLabel={`Speed ${formatRate(rate)}`}
              hint="Opens speed settings"
              icon={Gauge}
              value={formatRate(rate)}
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
        onSeekSentence={seekSentence}
        onLongPressSentence={openSentenceActions}
        onSentenceAction={runSentenceAction}
      />

      <SpeedSheet visible={sheet === 'speed'} onClose={closeSheet} />
      <SleepSheet visible={sheet === 'sleep'} onClose={closeSheet} />
      <AmbienceSheet
        visible={sheet === 'ambience'}
        onClose={closeSheet}
        activeNames={activeNames}
      />
      <BookmarksSheet
        visible={sheet === 'bookmarks'}
        groups={bookmarks}
        onClose={closeSheet}
        onOpen={(openChapterId, idx) => {
          closeSheet();
          controller.jumpToSentence(openChapterId, idx);
        }}
        onEditNote={(bookmark) => {
          closeSheet();
          setNoteFor(bookmark.id);
        }}
        onDelete={(bookmarkId) => controller.deleteBookmark(bookmarkId)}
      />
      <BookmarkNoteSheet
        bookmark={noteFor === null ? null : findBookmarkById(bookmarks, noteFor)}
        onClose={() => setNoteFor(null)}
        onSave={(bookmarkId, note) => {
          controller.saveBookmarkNote(bookmarkId, note);
          setNoteFor(null);
        }}
      />
      <SentenceSheet
        sentence={actionSentence}
        onClose={() => setActionSentence(null)}
        onRepeat={repeat}
        onCopy={copy}
        onSaveVocab={saveVocab}
        bookmarked={actionBookmarked}
        onBookmark={(sentence) => {
          toggleBookmark(sentence.idx);
          setActionSentence(null);
        }}
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
    width: minTouchTarget,
    height: minTouchTarget,
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
