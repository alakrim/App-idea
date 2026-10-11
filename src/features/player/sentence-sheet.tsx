import { StyleSheet, View } from 'react-native';

import type { Sentence } from '@/core/domain';
import { Button } from '@/ui/button';
import { BookmarkPlus, Copy, Repeat1 } from '@/ui/icons';
import { Sheet } from '@/ui/sheet';
import { Text } from '@/ui/text';
import { space } from '@/ui/tokens';

import { displayText } from './synced-text-pane';

export interface SentenceSheetProps {
  /** The long-pressed sentence, or null when the sheet is closed. */
  sentence: Sentence | null;
  onClose: () => void;
  onRepeat: (sentence: Sentence) => void;
  onCopy: (sentence: Sentence) => void;
  onSaveVocab: (sentence: Sentence) => void;
}

/** What a learner can do with one sentence: repeat it, copy it, or save it to Vocab. */
export function SentenceSheet({
  sentence,
  onClose,
  onRepeat,
  onCopy,
  onSaveVocab,
}: SentenceSheetProps) {
  return (
    <Sheet visible={sentence !== null} onClose={onClose} title="Sentence" snapPoints={['46%']}>
      {sentence ? (
        <View style={styles.body}>
          <Text variant="reading" testID="sentence-sheet-text">
            {displayText(sentence)}
          </Text>
          <Button
            label="Repeat sentence"
            icon={Repeat1}
            variant="secondary"
            fullWidth
            accessibilityHint="Plays this sentence again until you tap another one"
            onPress={() => onRepeat(sentence)}
          />
          <Button
            label="Copy"
            icon={Copy}
            variant="secondary"
            fullWidth
            onPress={() => onCopy(sentence)}
          />
          <Button
            label="Save to Vocab"
            icon={BookmarkPlus}
            variant="secondary"
            fullWidth
            onPress={() => onSaveVocab(sentence)}
          />
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: space.md,
  },
});
