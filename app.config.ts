import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Lectio',
  slug: 'lectio',
  version: '0.1.0',
  scheme: 'lectio',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './assets/images/icon.png',
  ios: {
    bundleIdentifier: 'app.lectio',
    icon: './assets/expo.icon',
  },
  android: {
    package: 'app.lectio',
    adaptiveIcon: {
      backgroundColor: '#0D0E12',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    // Lectio never records, photographs, draws over other apps or uses biometrics. Libraries declare
    // these by default; block them so the installed app asks for nothing it does not use.
    blockedPermissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.CAMERA',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.USE_BIOMETRIC',
      'android.permission.USE_FINGERPRINT',
    ],
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#0D0E12',
        image: './assets/images/splash-icon.png',
        imageWidth: 76,
      },
    ],
    ['expo-sqlite', { enableFTS: true }],
    ['expo-secure-store', { faceIDPermission: false }],
    ['expo-image-picker', { cameraPermission: false, microphonePermission: false }],
    [
      'expo-audio',
      {
        enableBackgroundPlayback: true,
        microphonePermission: false,
      },
    ],
    'expo-font',
    // Ambience beds (ADR-0002). Voice owns the media session via expo-audio.
    ['react-native-audio-api', { iosBackgroundMode: true, androidForegroundService: false }],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  // Build identity for the Diagnostics screen. CI or a local build sets GIT_SHA; 'dev' otherwise.
  extra: {
    gitSha: process.env.GIT_SHA ?? 'dev',
  },
};

export default config;
