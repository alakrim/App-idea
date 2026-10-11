import { StyleSheet, View } from 'react-native';

import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { fontFamily, space } from '@/ui/tokens';

import type { ReadingParagraph, ReadingSentence } from './chapter-data';

export type ReadingMode = 'translation' | 'original' | 'both';

export const READING_MODES = [
  { value: 'translation', label: 'Translation' },
  { value: 'original', label: 'Original' },
  { value: 'both', label: 'Both' },
] as const satisfies readonly { value: ReadingMode; label: string }[];

/** Languages written without spaces between words. Sentences join without a space for them. */
const UNSPACED_LANGUAGES = /^(zh|ja|th)/i;

export interface ReadingTextProps {
  paragraphs: readonly ReadingParagraph[];
  mode: ReadingMode;
  /** Source language tag, which decides how sentences join. */
  sourceLang: string | null;
}

/**
 * The chapter text in Literata. "Both" is the learner view: each translated sentence sits above its
 * original in the muted tone, so the two stay paired.
 */
export function ReadingText({ paragraphs, mode, sourceLang }: ReadingTextProps) {
  const joiner = sourceLang && UNSPACED_LANGUAGES.test(sourceLang) ? '' : ' ';

  return (
    <View style={styles.column}>
      {paragraphs.map((paragraph) => (
        <ParagraphBlock key={paragraph.idx} paragraph={paragraph} mode={mode} joiner={joiner} />
      ))}
    </View>
  );
}

interface ParagraphBlockProps {
  paragraph: ReadingParagraph;
  mode: ReadingMode;
  joiner: string;
}

function ParagraphBlock({ paragraph, mode, joiner }: ParagraphBlockProps) {
  const { colors } = useTheme();
  const heading = paragraph.kind === 'heading';
  const quote = paragraph.kind === 'quote';
  const textStyle = quote ? styles.quote : undefined;

  if (mode === 'both') {
    return (
      <View style={styles.paragraph}>
        {paragraph.sentences.map((sentence) => (
          <BilingualSentence key={sentence.idx} sentence={sentence} quote={quote} />
        ))}
      </View>
    );
  }

  const text = paragraph.sentences
    .map((sentence) => (mode === 'translation' ? (sentence.translated ?? sentence.text) : sentence.text))
    .join(joiner);
  return (
    <Text
      variant={heading ? 'heading' : 'reading'}
      tone={quote ? 'muted' : 'default'}
      style={[styles.paragraph, textStyle, { color: quote ? colors.textMuted : colors.text }]}
      accessibilityRole={heading ? 'header' : 'text'}
    >
      {text}
    </Text>
  );
}

interface BilingualSentenceProps {
  sentence: ReadingSentence;
  quote: boolean;
}

function BilingualSentence({ sentence, quote }: BilingualSentenceProps) {
  const textStyle = quote ? styles.quote : undefined;
  return (
    <View style={styles.pair} accessibilityLabel={sentence.translated ? `${sentence.translated}. Original: ${sentence.text}` : sentence.text}>
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
