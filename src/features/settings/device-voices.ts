import * as Speech from 'expo-speech';

export interface DeviceVoice {
  identifier: string;
  name: string;
  language: string;
}

/** Voices the phone can speak with, offline and free. An empty list means none are installed. */
export async function loadDeviceVoices(): Promise<DeviceVoice[]> {
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    return voices.map((voice) => ({
      identifier: voice.identifier,
      name: voice.name,
      language: voice.language,
    }));
  } catch {
    return [];
  }
}
