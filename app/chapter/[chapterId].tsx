import { Stack } from 'expo-router';
import { BookOpen } from 'lucide-react-native';

import { EmptyState } from '@/ui/empty-state';
import { Screen } from '@/ui/screen';

export default function ChapterScreen() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'Chapter' }} />
      <Screen edges={['bottom']} scrollable={false}>
        <EmptyState
          icon={BookOpen}
          title="Nothing to read yet"
          description="Extraction and narration progress show up here once the chapter is processed."
        />
      </Screen>
    </>
  );
}
