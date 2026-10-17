import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/ui/empty-state';
import { Bookmark } from '@/ui/icons';
import { Sheet } from '@/ui/sheet';
import { Text } from '@/ui/text';
import { space } from '@/ui/tokens';

import { countBookmarks, type BookmarkGroup, type BookmarkItem } from './bookmark-data';
import { BookmarkRow } from './bookmark-row';

export interface BookmarksSheetProps {
  visible: boolean;
  /** The series' bookmarks, grouped by chapter. */
  groups: readonly BookmarkGroup[];
  onClose: () => void;
  onOpen: (chapterId: string, sentenceIdx: number) => void;
  onEditNote: (bookmark: BookmarkItem) => void;
  onDelete: (bookmarkId: string) => void;
}

/** Every bookmark of a series, by chapter. Tapping one opens its sentence. */
export function BookmarksSheet({
  visible,
  groups,
  onClose,
  onOpen,
  onEditNote,
  onDelete,
}: BookmarksSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Bookmarks" snapPoints={['85%']} scrollable>
      {countBookmarks(groups) === 0 ? (
        <EmptyState
          icon={Bookmark}
          title="No bookmarks yet"
          description="Bookmark a moment while you listen to come back to it here."
        />
      ) : (
        groups.map((group) => (
          <View key={group.chapterId} style={styles.group}>
            <Text variant="micro" tone="faint" accessibilityRole="header">
              {`Chapter ${group.chapterNumber} · ${group.chapterTitle}`}
            </Text>
            {group.bookmarks.map((bookmark) => (
              <BookmarkRow
                key={bookmark.id}
                bookmark={bookmark}
                onOpen={() => onOpen(group.chapterId, bookmark.sentenceIdx)}
                onEditNote={() => onEditNote(bookmark)}
                onDelete={() => onDelete(bookmark.id)}
              />
            ))}
          </View>
        ))
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: space.xs,
  },
});
