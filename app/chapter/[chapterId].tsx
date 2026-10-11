import { Stack, useLocalSearchParams } from 'expo-router';

import { ChapterScreen } from '@/features/chapter/chapter-screen';

export default function ChapterRoute() {
  const { chapterId } = useLocalSearchParams<{ chapterId: string }>();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ChapterScreen chapterId={chapterId} />
    </>
  );
}
