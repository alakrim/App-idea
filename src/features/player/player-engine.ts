import { Platform } from 'react-native';

import type { AudioEngine } from '@/audio/engine';
import { createFakeEngine } from '@/audio/fake-engine';
import type { createNativeAudioEngine as CreateNativeAudioEngine } from '@/audio/native-engine';

/**
 * The engine the app plays through. Devices get the native engine. The web preview has no native
 * audio, so it runs the fake engine on its virtual clock. The native module is required lazily so
 * the web bundle never evaluates it.
 */
export function createDefaultEngine(): AudioEngine {
  if (Platform.OS === 'web') {
    return createFakeEngine();
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createNativeAudioEngine } = require('@/audio/native-engine') as {
    createNativeAudioEngine: typeof CreateNativeAudioEngine;
  };
  return createNativeAudioEngine();
}
