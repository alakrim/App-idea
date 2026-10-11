import { router } from 'expo-router';
import { Library, Plus } from 'lucide-react-native';

import { EmptyState } from '@/ui/empty-state';
import { Screen } from '@/ui/screen';

export default function LibraryScreen() {
  return (
    <Screen title="Library" scrollable={false}>
      <EmptyState
        icon={Library}
        title="Your shelf is empty"
        description="Series hold your chapters. Start one, then add the first chapter from a link or a PDF."
        action={{
          label: 'New series',
          icon: Plus,
          onPress: () => router.push('/series/new'),
        }}
      />
    </Screen>
  );
}
