import { Stack } from 'expo-router';
import { type ReactNode } from 'react';

import { Screen } from '@/ui/screen';

export interface SettingsPageProps {
  /** Native header title. The back button comes from the stack. */
  title: string;
  children: ReactNode;
  /** Pages with lists bring their own scrolling and pass false. */
  scrollable?: boolean;
}

/**
 * A pushed settings page: native header with back, then the standard screen body. The header is
 * shown here rather than in the root stack, which hides headers for the tabs and modals.
 */
export function SettingsPage({ title, children, scrollable = true }: SettingsPageProps) {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title }} />
      <Screen edges={['bottom']} scrollable={scrollable}>
        {children}
      </Screen>
    </>
  );
}
