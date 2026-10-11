import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { scaleAlpha } from '@/features/shared/color';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { fontFamily, radius, space } from '@/ui/tokens';

import type { ReadingParagraph, ReadingSentence } from './chapter-data';

export type ReadingMode = 'translation' | 'original' | 'both';

export const READING_MODES = [
  { value: 'translation', label: 'Translation' },
  { value: 'original', label: 'Original' },
  { value: 'both', label: 'Both' },
] as const satisfies readonly { value: ReadingMode; label: string }[];

/** Languages written without spaces between words. Sentences join without a space for them. */
const UNSPACED_LANGUAGES = /^(zh|ja|th)/i;

/** A sentence to highlight, and how strong its highlight is now (1 at the start, 0 when gone). */
export interface SentenceHighlight {
  sentenceIdx: number;
  strength: number;
}

export interface ReadingTextProps {
  paragraphs: readonly ReadingParagraph[];
  mode: ReadingMode;
  /** Source language tag, which decides how sentences join. */
  sourceLang: string | null;
  highlight?: SentenceHighlight | null;
  /** Reports where each paragraph starts, relative to this text, so the chapter can scroll to it. */
  onParagraphLayout?: (paragraphIdx: number, y: number) => void;
}

/**
 * The chapter text in Literata. "Both" is the learner view: each translated sentence sits above its
 * original in the muted tone, so the two stay paired.
 */
export function ReadingText({
  paragraphs,
  mode,
  sourceLang,
  highlight = null,
  onParagraphLayout,
}: ReadingTextProps) {
  const joiner = sourceLang && UNSPACED_LANGUAGES.test(sourceLang) ? '' : ' ';

  return (
    <View style={styles.column}>
      {paragraphs.map((paragraph) => (
        <ParagraphBlock
          key={paragraph.idx}
          paragraph={paragraph}
          mode={mode}
          joiner={joiner}
          highlight={highlight}
          onParagraphLayout={onParagraphLayout}
        />
      ))}
    </View>
  );
}

interface ParagraphBlockProps {
  paragraph: ReadingParagraph;
  mode: ReadingMode;
  joiner: string;
  highlight: SentenceHighlight | null;
  onParagraphLayout?: (paragraphIdx: number, y: number) => void;
}

function ParagraphBlock({
  paragraph,
  mode,
  joiner,
  highlight,
  onParagraphLayout,
}: ParagraphBlockProps) {
  const { colors } = useTheme();
  const heading = paragraph.kind === 'heading';
  const quote = paragraph.kind === 'quote';
  const textStyle = quote ? styles.quote : undefined;
  const onLayout = onParagraphLayout
    ? (event: LayoutChangeEvent) => onParagraphLayout(paragraph.idx, event.nativeEvent.layout.y)
    : undefined;

  if (mode === 'both') {
    return (
      <View style={styles.paragraph} onLayout={onLayout} testID={`paragraph-${paragraph.idx}`}>
        {paragraph.sentences.map((sentence) => (
          <BilingualSentence
            key={sentence.idx}
            sentence={sentence}
            quote={quote}
            highlight={highlight}
          />
        ))}
      </View>
    );
  }

  const shown = (sentence: ReadingSentence) =>
    mode === 'translation' ? (sentence.translated ?? sentence.text) : sentence.text;
  const lastIdx = paragraph.sentences.length - 1;

  return (
    <View onLayout={onLayout} testID={`paragraph-${paragraph.idx}`}>
      <Text
        variant={heading ? 'heading' : 'reading'}
        tone={quote ? 'muted' : 'default'}
        style={[styles.paragraph, textStyle, { color: quote ? colors.textMuted : colors.text }]}
        accessibilityRole={heading ? 'header' : 'text'}
      >
        {paragraph.sentences.map((sentence, index) => (
          <Text
            key={sentence.idx}
            style={
              highlight?.sentenceIdx === sentence.idx
                ? { backgroundColor: scaleAlpha(colors.accentSoft, highlight.strength) }
                : undefined
            }
          >
            {shown(sentence)}
            {index < lastIdx ? joiner : ''}
          </Text>
        ))}
      </Text>
    </View>
  );
}

interface BilingualSentenceProps {
  sentence: ReadingSentence;
  quote: boolean;
  highlight: SentenceHighlight | null;
}

function BilingualSentence({ sentence, quote, highlight }: BilingualSentenceProps) {
  const { colors } = useTheme();
  const textStyle = quote ? styles.quote : undefined;
  const highlighted = highlight?.sentenceIdx === sentence.idx;
  return (
    <View
      style={[
        styles.pair,
        highlighted
          ? {
              backgroundColor: scaleAlpha(colors.accentSoft, highlight.strength),
              borderRadius: radius.sm,
            }
          : null,
      ]}
      accessibilityLabel={
        sentence.translated ? `${sentence.translated}. Original: ${sentence.text}` : sentence.text
      }
    >
      <Text variant="reading" style={textStyle}>
        {sentence.translated ?? sentence.text}
      </Text>
      {sentence.translated ? (
        <Text variant="body" tone="muted" importantForAccessibility="no">
          {sentence.text}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  column: {
    gap: space.lg,
  },
  paragraph: {
    gap: space.sm,
  },
  pair: {
    gap: space.xxs,
    paddingBottom: space.sm,
  },
  quote: {
    fontFamily: fontFamily.literata.italic,
    paddingLeft: space.lg,
  },
});
