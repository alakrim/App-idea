import { Pressable, StyleSheet, View, type AccessibilityActionEvent } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import { formatClock } from '@/features/player/format';
import { IconButton } from '@/ui/icon-button';
import { Pencil, Trash2 } from '@/ui/icons';
import { Text } from '@/ui/text';
import { useTheme } from '@/ui/theme';
import { iconSize, iconStrokeWidth, minTouchTarget, radius, space } from '@/ui/tokens';

import type { BookmarkItem } from './bookmark-data';

const EDIT_NOTE_ACTION = 'editNote';
const DELETE_ACTION = 'delete';
const DELETE_PANEL_WIDTH = space.xxxl + space.xl;

export interface BookmarkRowProps {
  bookmark: BookmarkItem;
  onOpen: () => void;
  onEditNote: () => void;
  onDelete: () => void;
}

/**
 * One bookmark: its time, the sentence and the note. Swiping left reveals Delete, and a tap confirms
 * it, as in Vocab. Screen readers get Edit note and Delete as accessibility actions.
 */
export function BookmarkRow({ bookmark, onOpen, onEditNote, onDelete }: BookmarkRowProps) {
  const { colors } = useTheme();
  const clock = formatClock(bookmark.positionMs);
  const spokenNote = bookmark.note ?? 'No note';

  return (
    <View
      accessibilityActions={[
        { name: EDIT_NOTE_ACTION, label: 'Edit note' },
        { name: DELETE_ACTION, label: 'Delete bookmark' },
      ]}
      onAccessibilityAction={(event: AccessibilityActionEvent) => {
        const { actionName } = event.nativeEvent;
        if (actionName === EDIT_NOTE_ACTION) onEditNote();
        if (actionName === DELETE_ACTION) onDelete();
      }}
    >
      <ReanimatedSwipeable
        overshootRight={false}
        friction={2}
        renderRightActions={() => (
          <Pressable
            onPress={onDelete}
            accessibilityRole="button"
            accessibilityLabel="Delete bookmark"
            style={[styles.deletePanel, { backgroundColor: colors.danger }]}
          >
            <Trash2 size={iconSize.md} strokeWidth={iconStrokeWidth} color={colors.onAccent} />
            <Text variant="caption" style={{ color: colors.onAccent }}>
              Delete
            </Text>
          </Pressable>
        )}
      >
        <View style={[styles.row, { backgroundColor: colors.surface }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Bookmark at ${clock}. ${bookmark.snippet}. ${spokenNote}`}
            accessibilityHint="Opens this sentence"
            onPress={onOpen}
            style={styles.open}
          >
            <Text variant="micro" tone="muted" style={styles.clock} importantForAccessibility="no">
              {clock}
            </Text>
            <Text variant="body" numberOfLines={2} importantForAccessibility="no">
              {bookmark.snippet}
            </Text>
            <Text
              variant="caption"
              tone={bookmark.note === null ? 'faint' : 'muted'}
              numberOfLines={2}
              importantForAccessibility="no"
            >
              {bookmark.note ?? 'Add a note'}
            </Text>
          </Pressable>
          <IconButton
            label={`Edit note for bookmark at ${clock}`}
            icon={Pencil}
            onPress={onEditNote}
          />
        </View>
      </ReanimatedSwipeable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
  },
  open: {
    flex: 1,
    gap: space.xs,
    minHeight: minTouchTarget,
    justifyContent: 'center',
  },
  clock: {
    fontVariant: ['tabular-nums'],
  },
  deletePanel: {
    width: DELETE_PANEL_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xxs,
  },
});
