import { router } from 'expo-router';
import { BookA } from 'lucide-react-native';

import { EmptyState } from '@/ui/empty-state';
import { Screen } from '@/ui/screen';

export default function VocabScreen() {
  return (
    <Screen title="Vocab" scrollable={false}>
      <EmptyState
        icon={BookA}
        title="Save words while you listen"
        description="Tap a word in the synced text to keep it here, with its context and translation."
        action={{
          label: 'Browse your library',
          onPress: () => router.navigate('/'),
          variant: 'secondary',
        }}
      />
    </Screen>
  );
}
