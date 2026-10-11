import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type { JsonValue } from './probe';

export interface EnvironmentInfo {
  appVersion: string;
  gitSha: string;
  reactNative: string;
  expo: string | null;
  platform: string;
  osVersion: string;
  deviceModel: string | null;
  hermes: boolean;
  dev: boolean;
  [key: string]: JsonValue;
}

/** The git sha the build was made from. app.config.ts sets it from GIT_SHA, and 'dev' otherwise. */
export function gitShaFrom(extra: unknown): string {
  if (typeof extra === 'object' && extra !== null && 'gitSha' in extra) {
    const sha = (extra as { gitSha: unknown }).gitSha;
    if (typeof sha === 'string' && sha !== '') return sha;
  }
  return 'dev';
}

/** The React Native version from Platform.constants, such as "0.86.3". */
export function reactNativeVersionFrom(constants: unknown): string {
  const version = (constants as { reactNativeVersion?: Record<string, unknown> } | null)
    ?.reactNativeVersion;
  if (!version || typeof version.major !== 'number') return 'unknown';
  const base = `${version.major}.${String(version.minor)}.${String(version.patch)}`;
  return typeof version.prerelease === 'string' && version.prerelease !== ''
    ? `${base}-${version.prerelease}`
    : base;
}

/** The device model and OS version, from Platform.constants where the platform reports them. */
export function deviceFrom(
  constants: unknown,
  os: string,
): { model: string | null; osVersion: string } {
  const fields = (constants ?? {}) as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === 'string' && value !== '' ? value : null);
  if (os === 'android') {
    const brand = text(fields.Brand);
    const model = text(fields.Model);
    return {
      model: brand && model ? `${brand} ${model}` : model,
      osVersion: [
        text(fields.Release),
        typeof fields.Version === 'number' ? `API ${fields.Version}` : null,
      ]
        .filter((part): part is string => part !== null)
        .join(' · '),
    };
  }
  return {
    model: text(fields.model) ?? text(fields.Model),
    osVersion: text(fields.osVersion) ?? String(Platform.Version),
  };
}

export function readEnvironment(): EnvironmentInfo {
  const expoConfig = Constants.expoConfig;
  const device = deviceFrom(Platform.constants, Platform.OS);
  return {
    appVersion: expoConfig?.version ?? 'unknown',
    gitSha: gitShaFrom(expoConfig?.extra),
    reactNative: reactNativeVersionFrom(Platform.constants),
    expo: Constants.expoVersion ?? null,
    platform: Platform.OS,
    osVersion: device.osVersion,
    deviceModel: device.model,
    hermes: 'HermesInternal' in globalThis,
    dev: __DEV__,
  };
}
