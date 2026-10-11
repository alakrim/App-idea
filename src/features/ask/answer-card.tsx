import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/ui/card';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { hairline, minTouchTarget, radius, space } from '@/ui/tokens';

import { citedChapterNumbers, splitAnswer } from './citations';

import type { AskChapter } from './ask-data';

export interface AnswerCardProps {
  text: string;
  /** Chapters the answer may cite, by display number. A cite with no match renders as plain text. */
  chapters: readonly AskChapter[];
  onOpenChapter: (chapterId: string) => void;
}

/** An assistant answer in Literata, with its "(Ch. N)" citations as tappable chips at the end. */
export function AnswerCard({ text, chapters, onOpenChapter }: AnswerCardProps) {
  const { colors } = useTheme();
  const cited = citedChapterNumbers(text);
  const byNumber = new Map(chapters.map((chapter) => [chapter.number, chapter]));

  return (
    <Card style={styles.card}>
      <Text variant="reading" style={{ color: colors.text }}>
        {prose(text)}
      </Text>
      {cited.length > 0 ? (
        <View style={styles.chips}>
          {cited.map((number) => {
            const chapter = byNumber.get(number);
            return (
              <Pressable
                key={number}
                disabled={!chapter}
                onPress={() => {
                  if (chapter) onOpenChapter(chapter.chapterId);
                }}
                accessibilityRole="link"
                accessibilityLabel={
                  chapter ? `Open chapter ${number}, ${chapter.title}` : `Chapter ${number}`
                }
                style={({ pressed }) => [
                  styles.chip,
                  { borderColor: colors.border, backgroundColor: colors.accentSoft },
                  pressed && styles.pressed,
                ]}
              >
                <Text variant="caption" style={{ color: colors.accent }}>
                  {`Ch. ${number}`}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </Card>
  );
}

/** The answer's prose with the inline markers removed. The chips carry the citations. */
function prose(text: string): string {
  return splitAnswer(text)
    .filter((part) => part.kind === 'text')
    .map((part) => part.text)
    .join('')
    .replace(/[ \t]+([.,;:!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    minHeight: minTouchTarget,
    minWidth: minTouchTarget,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: hairline,
  },
  pressed: { opacity: 0.85 },
});
