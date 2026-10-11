import { router } from 'expo-router';

import { OnboardingFlow } from '@/features/settings/onboarding/onboarding-flow';

/** First-run onboarding. The tab layout sends new users here until onboarding is marked done. */
export default function OnboardingScreen() {
  return <OnboardingFlow onFinish={() => router.replace('/')} />;
}
