import { router, Stack, useLocalSearchParams } from 'expo-router';
import { FileText, Link } from 'lucide-react-native';

import { Card } from '@/ui/card';
import { ErrorState } from '@/ui/error-state';
import { ListItem } from '@/ui/list-item';
import { Screen } from '@/ui/screen';

export default function NewChapterScreen() {
  const { seriesId } = useLocalSearchParams<{ seriesId?: string }>();
  const goBack = () => router.back();

  if (!seriesId) {
    return (
      <>
        <Stack.Screen
          options={{ headerShown: true, title: 'New chapter', presentation: 'modal' }}
        />
        <Screen edges={['bottom']} scrollable={false}>
          <ErrorState
            title="No series selected"
            message="Open this from a series so the chapter has somewhere to go."
            onRetry={goBack}
            retryLabel="Go back"
          />
        </Screen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'New chapter', presentation: 'modal' }} />
      <Screen edges={['bottom']}>
        <Card style={{ padding: 0 }}>
          <ListItem title="From a web link" subtitle="Paste a URL to an article" leading={Link} />
          <ListItem title="From a PDF" subtitle="Pick a file from your device" leading={FileText} />
        </Card>
      </Screen>
    </>
  );
}
