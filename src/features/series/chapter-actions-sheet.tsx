import { StyleSheet, View } from 'react-native';

import { ArrowDown, ArrowUp, CircleStop, RotateCw, Trash2, type LucideIcon } from '@/ui/icons';
import { ListItem } from '@/ui/list-item';
import { Sheet } from '@/ui/sheet';
import { space } from '@/ui/tokens';

import {
  CHAPTER_ACTION_LABELS,
  chapterActionsFor,
  type ChapterAction,
  type ChapterAvailability,
} from './chapter-actions';

export interface ChapterActionsSheetProps {
  visible: boolean;
  chapterTitle: string;
  availability: ChapterAvailability;
  onAction: (action: ChapterAction) => void;
  onClose: () => void;
}

const ICONS: Readonly<Record<ChapterAction, LucideIcon>> = {
  'move-up': ArrowUp,
  'move-down': ArrowDown,
  're-generate': RotateCw,
  stop: CircleStop,
  delete: Trash2,
};

const SUBTITLES: Partial<Record<ChapterAction, string>> = {
  're-generate': 'Narrates the chapter again',
  stop: 'Finished audio is kept',
  delete: 'Removes its text and audio',
};

/** Long-press menu for a chapter. It lists the same actions the row's accessibility actions expose. */
export function ChapterActionsSheet({
  visible,
  chapterTitle,
  availability,
  onAction,
  onClose,
}: ChapterActionsSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} title={chapterTitle} snapPoints={['50%']}>
      <View style={styles.list}>
        {chapterActionsFor(availability).map((action) => (
          <ListItem
            key={action}
            title={CHAPTER_ACTION_LABELS[action]}
            subtitle={SUBTITLES[action]}
            leading={ICONS[action]}
            onPress={() => onAction(action)}
          />
        ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: space.xs,
  },
});
