import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/ui/button';
import { Sheet } from '@/ui/sheet';
import { Text } from '@/ui/text';
import { TextField } from '@/ui/text-field';
import { space } from '@/ui/tokens';

import { NOTE_MAX_LENGTH, normalizeNote } from './bookmark-format';

import type { BookmarkItem } from './bookmark-data';

export interface BookmarkNoteSheetProps {
  /** The bookmark whose note is edited, or null when the sheet is closed. */
  bookmark: BookmarkItem | null;
  onClose: () => void;
  onSave: (bookmarkId: string, note: string) => void;
}

/** Adds or edits the note of a bookmark. Keyed by bookmark, so each one starts from its own note. */
export function BookmarkNoteSheet({ bookmark, onClose, onSave }: BookmarkNoteSheetProps) {
  return (
    <Sheet visible={bookmark !== null} onClose={onClose} title="Bookmark note" snapPoints={['60%']}>
      {bookmark ? (
        <NoteForm
          key={bookmark.id}
          bookmark={bookmark}
          onSave={(note) => onSave(bookmark.id, note)}
        />
      ) : null}
    </Sheet>
  );
}

interface NoteFormProps {
  bookmark: BookmarkItem;
  onSave: (note: string) => void;
}

function NoteForm({ bookmark, onSave }: NoteFormProps) {
  const [draft, setDraft] = useState(bookmark.note ?? '');
  const check = normalizeNote(draft);
  return (
    <View style={styles.form}>
      <Text variant="caption" tone="muted" numberOfLines={2}>
        {bookmark.snippet}
      </Text>
      <TextField
        label="Note"
        value={draft}
        onChangeText={setDraft}
        multiline
        lines={4}
        placeholder="What do you want to remember?"
        error={check.ok ? undefined : `Keep the note under ${NOTE_MAX_LENGTH} characters.`}
      />
      <Button label="Save note" fullWidth disabled={!check.ok} onPress={() => onSave(draft)} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: space.md,
  },
});
