import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import type { MixerContext } from '@/audio/ambience-mixer';
import { INSTALLED_BEDS, type InstalledBed } from '@/audio/ambience-pack';
import { isProcessing, notificationPermissionStatus } from '@/services/background';
import { webViewRenderQueue } from '@/services/pipeline/webview-bridge';

import { globalLanguageEnv } from './checks-language';

import type { BackgroundReadings } from './checks-background';
import type { StorageSizes } from './checks-storage';
import type { DiagnosticsDeps } from './run-all';

/** expo-sqlite keeps the app database in its SQLite folder under the documents directory. */
const DATABASE_FILE = 'lectio.db';

/** The audio context the player's mixer uses. It is loaded only on a device, like the native engine. */
function createDeviceAudioContext(): MixerContext {
  if (Platform.OS === 'web') throw new Error('Audio probes need a device.');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const audio = require('react-native-audio-api') as { AudioContext: new () => MixerContext };
  return new audio.AudioContext();
}

/** The processing service's readings. Null where the platform has no service (every platform but Android). */
async function readBackground(): Promise<BackgroundReadings | null> {
  if (Platform.OS !== 'android') return null;
  const [processing, notifications] = await Promise.all([
    isProcessing(),
    notificationPermissionStatus(),
  ]);
  return { processing, notifications };
}

function readStorageSizes(): StorageSizes {
  let databaseBytes: number | null = null;
  try {
    databaseBytes = new File(Paths.document, 'SQLite', DATABASE_FILE).size;
  } catch {
    databaseBytes = null;
  }
  let freeBytes: number | null = null;
  try {
    freeBytes = Paths.availableDiskSpace;
  } catch {
    freeBytes = null;
  }
  return { databaseBytes, freeBytes };
}

/**
 * The device side of the diagnostics: the database, the render queue, the audio context and the
 * language engine. The bridge comes from the screen, because it needs a mounted WebView.
 */
export function deviceDiagnosticsDeps(
  db: DiagnosticsDeps['db'],
  bridge: DiagnosticsDeps['bridge'],
  beds: readonly InstalledBed[] = [...INSTALLED_BEDS.values()],
): DiagnosticsDeps {
  return {
    db,
    language: globalLanguageEnv(),
    render: {
      render: (url, signal) => webViewRenderQueue.render(url, signal),
    },
    bridge,
    audio: {
      createContext: createDeviceAudioContext,
      beds,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      // The native media session is not exposed to the app yet. The probe reports it as skipped.
      hasLockScreenSession: () => null,
    },
    storage: readStorageSizes,
    background: { read: readBackground },
  };
}
