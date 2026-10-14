/*
 * The app's foreground state, from React Native's AppState. The background runner starts the service
 * only in the foreground, and resumes it when the app returns.
 */
import { AppState } from 'react-native';

import type { AppForegroundPort } from '@/services/pipeline/background-runner';

export function createAppForeground(): AppForegroundPort {
  return {
    isActive: () => AppState.currentState === 'active',
    subscribe(listener) {
      const subscription = AppState.addEventListener('change', (state) => {
        listener(state === 'active');
      });
      return () => {
        subscription.remove();
      };
    },
  };
}
