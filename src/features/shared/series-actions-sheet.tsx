import { Pencil, Trash2 } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { ListItem } from '@/ui/list-item';
import { Sheet } from '@/ui/sheet';
import { space } from '@/ui/tokens';

export interface SeriesActionsSheetProps {
  visible: boolean;
  seriesTitle: string;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

/** Long-press (library) and overflow (series) menu: Edit and Delete for one series. */
export function SeriesActionsSheet({
  visible,
  seriesTitle,
  onEdit,
  onDelete,
  onClose,
}: SeriesActionsSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} title={seriesTitle} snapPoints={['30%']}>
      <View style={styles.list}>
        <ListItem title="Edit series" subtitle="Name, cover and languages" leading={Pencil} onPress={onEdit} />
        <ListItem title="Delete series" subtitle="Removes its chapters and audio" leading={Trash2} onPress={onDelete} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: space.xs,
  },
});
