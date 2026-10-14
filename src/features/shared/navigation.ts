import { router } from 'expo-router';

/** Goes back when there is a screen to return to, and otherwise opens the library. */
export function goBackOrHome(): void {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/');
  }
}
