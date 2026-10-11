import { ArrowDown, ArrowUp, RotateCw, Trash2 } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { ListItem } from '@/ui/list-item';
import { Sheet } from '@/ui/sheet';
import { space } from '@/ui/tokens';

export interface ChapterActionsSheetProps {
  visible: boolean;
  chapterTitle: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  /** Re-narration needs a processed chapter. */
  canRenarrate: boolean;
  onMove: (direction: 'up' | 'down') => void;
  onRenarrate: () => void;
  onDelete: () => void;
  onClose: () => void;
}

/** Long-press menu for a chapter: reorder, re-generate the audio, or delete. */
export function ChapterActionsSheet({
  visible,
  chapterTitle,
  canMoveUp,
  canMoveDown,
  canRenarrate,
  onMove,
  onRenarrate,
  onDelete,
  onClose,
}: ChapterActionsSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} title={chapterTitle} snapPoints={['50%']}>
      <View style={styles.list}>
        {canMoveUp ? (
          <ListItem title="Move up" leading={ArrowUp} onPress={() => onMove('up')} />
        ) : null}
        {canMoveDown ? (
          <ListItem title="Move down" leading={ArrowDown} onPress={() => onMove('down')} />
        ) : null}
        {canRenarrate ? (
          <ListItem
            title="Re-generate audio"
            subtitle="Narrates the chapter again"
            leading={RotateCw}
            onPress={onRenarrate}
          />
        ) : null}
        <ListItem title="Delete chapter" subtitle="Removes its text and audio" leading={Trash2} onPress={onDelete} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: space.xs,
  },
});
