import { Stack, useLocalSearchParams } from 'expo-router';

import { ChapterScreen } from '@/features/chapter/chapter-screen';
import { parseSentenceParam } from '@/features/chapter/sentence-focus';

export default function ChapterRoute() {
  const { chapterId, sentence } = useLocalSearchParams<{ chapterId: string; sentence?: string }>();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ChapterScreen chapterId={chapterId} focusSentence={parseSentenceParam(sentence)} />
    </>
  );
}
