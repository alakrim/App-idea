import { LinearGradient } from 'expo-linear-gradient';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text as RNText,
  View,
  type AccessibilityActionEvent,
  type FlatListProps,
  type ListRenderItemInfo,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import type { Paragraph, Sentence } from '@/core/domain';
import { ChevronDown, ChevronUp, Languages } from '@/ui/icons';
import { useMotion } from '@/ui/motion';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import {
  durations,
  fontFamily,
  gutter,
  hairline,
  iconSize,
  iconStrokeWidth,
  minTouchTarget,
  radius,
  space,
  transparent,
} from '@/ui/tokens';

import { useFollowPause } from './follow-pause';
import { PLAYER } from './layout';
import { useGlide } from './motion';

/** Velocity (px/s) past which a flick decides the snap, whatever the pane's position. */
const FLICK_VELOCITY = 500;
/** How long the list gets to lay out the rows an index jump could not reach. */
const FOLLOW_RETRY_MS = 120;

/** What a screen reader can ask of a sentence without a long press (P2-18). */
export type SentenceAction = 'repeat' | 'copy' | 'saveToVocab';

const SENTENCE_ACTIONS: readonly { name: SentenceAction; label: string }[] = [
  { name: 'repeat', label: 'Repeat sentence' },
  { name: 'copy', label: 'Copy sentence' },
  { name: 'saveToVocab', label: 'Save to Vocab' },
];

function isSentenceAction(name: string): name is SentenceAction {
  return SENTENCE_ACTIONS.some((action) => action.name === name);
}

export interface SyncedTextPaneProps {
  paragraphs: readonly Paragraph[];
  sentences: readonly Sentence[];
  /** Sentences the audio has reached. Later ones are shown but cannot be tapped yet. */
  availableCount: number;
  /** The sentence playing now, or -1 before the first one. */
  currentIdx: number;
  /** The sentence on repeat, if any. */
  loopIdx: number | null;
  /** Height when the pane is open. */
  openHeight: number;
  /** Visible height when the pane is closed, including the bottom inset. */
  peekHeight: number;
  onSeekSentence: (idx: number) => void;
  onLongPressSentence: (idx: number) => void;
  /** Runs a sentence action picked from the screen reader's actions. Omitted, no actions are offered. */
  onSentenceAction?: (idx: number, action: SentenceAction) => void;
}

interface ParagraphItem {
  key: string;
  paragraph: Paragraph;
  sentences: readonly Sentence[];
}

/** The sentence text the listener reads: the translation when there is one. */
export function displayText(sentence: Sentence): string {
  return sentence.translated ?? sentence.text;
}

/**
 * The chapter text as a pane you pull up from the bottom. Closed, it shows the sentence being read.
 * Open, it follows the narration and pauses following for 5 s after the listener scrolls by hand.
 * Tap a sentence to seek there; hold it for the sentence actions. Bilingual shows the original under
 * each translation. It is memoised: the player passes stable callbacks, so it does not re-render
 * with the position, only when the sentence in view changes (P2-10).
 */
export const SyncedTextPane = memo(function SyncedTextPane(props: SyncedTextPaneProps) {
  const {
    paragraphs,
    sentences,
    availableCount,
    currentIdx,
    loopIdx,
    openHeight,
    peekHeight,
    onSeekSentence,
    onLongPressSentence,
    onSentenceAction,
  } = props;
  const { colors } = useTheme();
  const { springTo } = useMotion();
  const collapsedOffset = openHeight - peekHeight;
  const [open, setOpen] = useState(false);
  const [bilingual, setBilingual] = useState(false);
  const offset = useSharedValue(collapsedOffset);
  const startOffset = useSharedValue(collapsedOffset);
  const listRef = useRef<FlatList<ParagraphItem>>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const follow = useFollowPause(PLAYER.autoScrollPauseMs);

  useEffect(
    () => () => {
      if (retryRef.current !== null) clearTimeout(retryRef.current);
    },
    [],
  );

  const snap = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      /* eslint-disable react-hooks/immutability */
      offset.value = springTo(nextOpen ? 0 : collapsedOffset, 'gentle');
      /* eslint-enable react-hooks/immutability */
    },
    [collapsedOffset, offset, springTo],
  );

  useEffect(() => {
    /* eslint-disable react-hooks/immutability */
    offset.value = open ? 0 : collapsedOffset;
    /* eslint-enable react-hooks/immutability */
  }, [collapsedOffset, offset, open]);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-8, 8])
        .onBegin(() => {
          /* eslint-disable react-hooks/immutability */
          startOffset.value = offset.value;
          /* eslint-enable react-hooks/immutability */
        })
        .onUpdate((event) => {
          /* eslint-disable react-hooks/immutability */
          offset.value = Math.min(
            collapsedOffset,
            Math.max(0, startOffset.value + event.translationY),
          );
          /* eslint-enable react-hooks/immutability */
        })
        .onEnd((event) => {
          const nextOpen =
            event.velocityY < -FLICK_VELOCITY
              ? true
              : event.velocityY > FLICK_VELOCITY
                ? false
                : offset.value < collapsedOffset / 2;
          runOnJS(snap)(nextOpen);
        }),
    [collapsedOffset, offset, startOffset, snap],
  );

  const paneStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));

  const paragraphOf = useMemo(() => {
    const map = new Map<number, number>();
    paragraphs.forEach((paragraph, index) => {
      for (let idx = paragraph.sentenceStart; idx < paragraph.sentenceEnd; idx += 1) {
        map.set(idx, index);
      }
    });
    return map;
  }, [paragraphs]);

  const items = useMemo<ParagraphItem[]>(
    () =>
      paragraphs.map((paragraph, index) => ({
        key: `${index}`,
        paragraph,
        sentences: sentences.slice(paragraph.sentenceStart, paragraph.sentenceEnd),
      })),
    [paragraphs, sentences],
  );

  // Follow the narration: keep the sentence at about a third of the way down the open pane.
  useEffect(() => {
    if (!open || follow.paused || currentIdx < 0) return;
    const index = paragraphOf.get(currentIdx);
    if (index === undefined) return;
    listRef.current?.scrollToIndex({
      index,
      viewPosition: PLAYER.followAnchor,
      animated: true,
    });
  }, [currentIdx, follow.paused, open, paragraphOf]);

  /**
   * A jump to a row the list has not measured yet fails. Move to the estimated offset first, which
   * brings the row into the measured range, then try the jump again (P2-12). Without this the
   * text stopped following after a long seek.
   */
  const onScrollToIndexFailed: FlatListProps<ParagraphItem>['onScrollToIndexFailed'] = (info) => {
    listRef.current?.scrollToOffset({
      offset: info.averageItemLength * info.index,
      animated: false,
    });
    if (retryRef.current !== null) clearTimeout(retryRef.current);
    retryRef.current = setTimeout(() => {
      retryRef.current = null;
      listRef.current?.scrollToIndex({
        index: info.index,
        viewPosition: PLAYER.followAnchor,
        animated: true,
      });
    }, FOLLOW_RETRY_MS);
  };

  const renderItem = ({ item }: ListRenderItemInfo<ParagraphItem>) => (
    <ParagraphView
      paragraph={item.paragraph}
      sentences={item.sentences}
      currentIdx={currentIdx}
      loopIdx={loopIdx}
      availableCount={availableCount}
      bilingual={bilingual}
      onSeek={onSeekSentence}
      onLongPress={onLongPressSentence}
      onAction={onSentenceAction}
    />
  );

  const current = sentences[currentIdx];

  return (
    <Animated.View
      style={[
        styles.pane,
        { height: openHeight, backgroundColor: colors.surfaceRaised, borderColor: colors.border },
        paneStyle,
      ]}
    >
      <GestureDetector gesture={gesture}>
        <View style={styles.header}>
          <View style={[styles.grabber, { backgroundColor: colors.textFaint }]} />
          <View style={styles.headerRow}>
            <Text variant="micro" tone="muted" style={styles.headerTitle}>
              Read along
            </Text>
            {open ? (
              <Pressable
                accessibilityRole="switch"
                accessibilityLabel="Bilingual text"
                accessibilityHint="Shows each sentence's original under its translation"
                accessibilityState={{ checked: bilingual }}
                onPress={() => setBilingual((value) => !value)}
                style={[
                  styles.bilingual,
                  {
                    backgroundColor: bilingual ? colors.accentSoft : colors.surface,
                    borderColor: bilingual ? colors.accent : colors.border,
                  },
                ]}
              >
                <Languages
                  size={iconSize.sm}
                  strokeWidth={iconStrokeWidth}
                  color={bilingual ? colors.accent : colors.textMuted}
                />
                <Text variant="caption" tone={bilingual ? 'accent' : 'muted'}>
                  Bilingual
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={open ? 'Close text' : 'Open text'}
              onPress={() => snap(!open)}
              hitSlop={space.sm}
              style={styles.toggle}
            >
              {open ? (
                <ChevronDown size={iconSize.md} strokeWidth={iconStrokeWidth} color={colors.text} />
              ) : (
                <ChevronUp size={iconSize.md} strokeWidth={iconStrokeWidth} color={colors.text} />
              )}
            </Pressable>
          </View>
          {open ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open text"
              onPress={() => snap(true)}
              style={styles.peek}
            >
              <Text variant="reading" numberOfLines={1} tone={current ? 'default' : 'muted'}>
                {current ? displayText(current) : 'Start listening to read along.'}
              </Text>
            </Pressable>
          )}
        </View>
      </GestureDetector>
      <View style={styles.listWrap}>
        <FlatList
          ref={listRef}
          testID="synced-text-list"
          data={items}
          renderItem={renderItem}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          accessibilityElementsHidden={!open}
          importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
          onScrollBeginDrag={follow.pause}
          onScrollToIndexFailed={onScrollToIndexFailed}
          scrollEnabled={open}
        />
        <LinearGradient
          pointerEvents="none"
          colors={[colors.surfaceRaised, transparent]}
          style={styles.listFade}
        />
      </View>
    </Animated.View>
  );
});

interface SentenceProps {
  sentence: Sentence;
  currentIdx: number;
  loopIdx: number | null;
  availableCount: number;
  onSeek: (idx: number) => void;
  onLongPress: (idx: number) => void;
  onAction?: (idx: number, action: SentenceAction) => void;
}

interface ParagraphViewProps extends Omit<SentenceProps, 'sentence'> {
  paragraph: Paragraph;
  sentences: readonly Sentence[];
  bilingual: boolean;
}

/** The screen-reader actions for a sentence, or none when the pane has no action handler. */
function sentenceAccessibility(onAction: SentenceProps['onAction'], idx: number) {
  if (!onAction) return {};
  return {
    accessibilityActions: SENTENCE_ACTIONS,
    onAccessibilityAction: (event: AccessibilityActionEvent) => {
      const { actionName: name } = event.nativeEvent;
      if (isSentenceAction(name)) onAction(idx, name);
    },
  };
}

function ParagraphView(props: ParagraphViewProps) {
  const { paragraph, sentences, bilingual, ...sentenceProps } = props;
  const kindStyle = paragraph.kind === 'quote' ? styles.quote : null;

  if (bilingual) {
    return (
      <View style={styles.paragraph}>
        {paragraph.kind === 'heading' ? (
          <Text variant="heading" accessibilityRole="header">
            {sentences.map(displayText).join(' ')}
          </Text>
        ) : (
          sentences.map((sentence) => (
            <SentenceBlock key={sentence.idx} sentence={sentence} {...sentenceProps} />
          ))
        )}
      </View>
    );
  }

  if (paragraph.kind === 'heading') {
    return (
      <Text variant="heading" accessibilityRole="header" style={styles.paragraph}>
        {sentences.map(displayText).join(' ')}
      </Text>
    );
  }

  return (
    <Text variant="reading" style={[styles.paragraph, kindStyle]}>
      {sentences.map((sentence) => (
        <SentenceSpan key={sentence.idx} sentence={sentence} {...sentenceProps} />
      ))}
    </Text>
  );
}

/** One sentence inside running prose: a nested span, so the paragraph still wraps like text. */
function SentenceSpan({
  sentence,
  currentIdx,
  loopIdx,
  availableCount,
  onSeek,
  onLongPress,
  onAction,
}: SentenceProps) {
  const { colors } = useTheme();
  const isCurrent = sentence.idx === currentIdx;
  const isLoop = sentence.idx === loopIdx;
  const available = sentence.idx < availableCount;
  return (
    <RNText
      accessibilityRole="button"
      {...sentenceAccessibility(onAction, sentence.idx)}
      onPress={available ? () => onSeek(sentence.idx) : undefined}
      onLongPress={() => onLongPress(sentence.idx)}
      style={[
        isCurrent ? { backgroundColor: colors.accentSoft } : null,
        available ? null : { color: colors.textFaint },
        isLoop ? { textDecorationLine: 'underline', textDecorationColor: colors.accent } : null,
      ]}
    >
      {`${displayText(sentence)} `}
    </RNText>
  );
}

/** One sentence in bilingual mode: translation, then the original in muted text, on a block. */
function SentenceBlock({
  sentence,
  currentIdx,
  loopIdx,
  availableCount,
  onSeek,
  onLongPress,
  onAction,
}: SentenceProps) {
  const { colors } = useTheme();
  const isCurrent = sentence.idx === currentIdx;
  const isLoop = sentence.idx === loopIdx;
  const available = sentence.idx < availableCount;
  const highlight = useGlide(isCurrent ? 1 : 0, durations.standard);
  const highlightStyle = useAnimatedStyle(() => ({ opacity: highlight.value }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={displayText(sentence)}
      accessibilityState={{ selected: isCurrent }}
      {...sentenceAccessibility(onAction, sentence.idx)}
      onPress={available ? () => onSeek(sentence.idx) : undefined}
      onLongPress={() => onLongPress(sentence.idx)}
      style={styles.block}
    >
      <Animated.View
        pointerEvents="none"
        style={[styles.blockHighlight, { backgroundColor: colors.accentSoft }, highlightStyle]}
      />
      <Text
        variant="reading"
        style={[
          available ? null : { color: colors.textFaint },
          isLoop ? { textDecorationLine: 'underline', textDecorationColor: colors.accent } : null,
        ]}
      >
        {displayText(sentence)}
      </Text>
      {sentence.translated !== null ? (
        <Text variant="body" tone="muted">
          {sentence.text}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pane: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: hairline,
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: gutter,
    paddingTop: space.sm,
    paddingBottom: space.xs,
    gap: space.xs,
  },
  grabber: {
    alignSelf: 'center',
    width: space.xxxl,
    height: space.xs,
    borderRadius: radius.pill,
    opacity: 0.5,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: minTouchTarget,
  },
  headerTitle: {
    flex: 1,
  },
  bilingual: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: minTouchTarget,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: hairline,
  },
  toggle: {
    width: minTouchTarget,
    height: minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  peek: {
    minHeight: minTouchTarget,
    justifyContent: 'center',
  },
  listWrap: {
    flex: 1,
  },
  listFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: space.xl,
  },
  list: {
    paddingHorizontal: gutter,
    paddingTop: space.md,
    paddingBottom: space.xxxl,
    gap: space.lg,
  },
  paragraph: {
    gap: space.xs,
  },
  quote: {
    fontFamily: fontFamily.literata.italic,
  },
  block: {
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    marginHorizontal: -space.sm,
    borderRadius: radius.md,
    gap: space.xxs,
    overflow: 'hidden',
  },
  blockHighlight: {
    ...StyleSheet.absoluteFill,
    borderRadius: radius.md,
  },
});
