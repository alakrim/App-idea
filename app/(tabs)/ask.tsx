import { router } from 'expo-router';
import { MessagesSquare } from 'lucide-react-native';

import { EmptyState } from '@/ui/empty-state';
import { Screen } from '@/ui/screen';

export default function AskScreen() {
  return (
    <Screen title="Ask" scrollable={false}>
      <EmptyState
        icon={MessagesSquare}
        title="Ask about anything you've already heard"
        description="Answers only use the chapters you have reached, so nothing spoils what is still ahead."
        action={{
          label: 'Browse your library',
          onPress: () => router.navigate('/'),
          variant: 'secondary',
        }}
      />
    </Screen>
  );
}
