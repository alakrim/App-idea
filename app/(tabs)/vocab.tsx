import { VocabActionsProvider } from '@/features/vocab/vocab-provider';
import { VocabScreen } from '@/features/vocab/vocab-screen';

export default function VocabRoute() {
  return (
    <VocabActionsProvider>
      <VocabScreen />
    </VocabActionsProvider>
  );
}
