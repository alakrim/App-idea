import { router, Stack, useLocalSearchParams } from 'expo-router';
import { BookOpen, Plus } from 'lucide-react-native';

import { EmptyState } from '@/ui/empty-state';
import { Screen } from '@/ui/screen';

export default function SeriesScreen() {
  const { seriesId } = useLocalSearchParams<{ seriesId: string }>();

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'Series' }} />
      <Screen edges={['bottom']} scrollable={false}>
        <EmptyState
          icon={BookOpen}
          title="No chapters yet"
          description="Chapters you add to this series appear here, ready to listen to."
          action={{
            label: 'Add chapter',
            icon: Plus,
            onPress: () => router.push({ pathname: '/chapter/new', params: { seriesId } }),
          }}
        />
      </Screen>
    </>
  );
}
