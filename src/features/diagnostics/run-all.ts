import type { MixerContext } from '@/audio/ambience-mixer';
import type { InstalledBed } from '@/audio/ambience-pack';
import type { Db } from '@/db/types';

import { checkBedDecode, checkDuckingRamps, checkLockScreenSession } from './checks-audio';
import {
  checkRegexFeatures,
  checkLegacyDecoders,
  checkSentenceSegmentation,
  type LanguageEnv,
} from './checks-language';
import { checkPipelineQueue } from './checks-pipeline';
import {
  checkFts5Trigram,
  checkSqliteVersion,
  checkStorageSizes,
  type StorageSizes,
} from './checks-storage';
import {
  checkRenderRoundTrip,
  checkBridgeSize,
  BRIDGE_SIZES,
  type BridgeDeps,
  type RenderDeps,
} from './checks-webview';
import { runProbe } from './probe';

import type { ProbeOutcome, ProbeResult, ProbeSpec } from './probe';

/** Everything the probes touch on the device. The screen builds it; tests pass fakes. */
export interface DiagnosticsDeps {
  db: Db;
  language: LanguageEnv;
  render: RenderDeps;
  bridge: BridgeDeps;
  audio: {
    createContext(): MixerContext;
    beds: readonly InstalledBed[];
    sleep(ms: number): Promise<void>;
    hasLockScreenSession(): boolean | null;
  };
  storage: () => StorageSizes;
}

interface ProbeDef {
  spec: ProbeSpec;
  run: (deps: DiagnosticsDeps) => ProbeOutcome | Promise<ProbeOutcome>;
}

const SHORT = 5_000;
const WEBVIEW = 30_000;
const AUDIO = 20_000;

/** The probes in the order the screen runs them. Each one has its own timeout. */
export const PROBES: readonly ProbeDef[] = [
  {
    spec: {
      id: 'intl-segmenter',
      group: 'language',
      label: 'Sentence splitting (en, zh, ja)',
      timeoutMs: SHORT,
    },
    run: (deps) => checkSentenceSegmentation(deps.language),
  },
  {
    spec: {
      id: 'text-decoder',
      group: 'language',
      label: 'Legacy text decoders',
      timeoutMs: SHORT,
    },
    run: (deps) => checkLegacyDecoders(deps.language),
  },
  {
    spec: {
      id: 'regex',
      group: 'language',
      label: 'Regex lookbehind and Unicode letters',
      timeoutMs: SHORT,
    },
    run: () => checkRegexFeatures(),
  },
  {
    spec: {
      id: 'webview-round-trip',
      group: 'webview',
      label: 'WebView render round trip',
      timeoutMs: WEBVIEW,
    },
    run: (deps) => checkRenderRoundTrip(deps.render),
  },
  ...BRIDGE_SIZES.map((size): ProbeDef => ({
    spec: {
      id: size.id,
      group: 'webview',
      label: `Bridge message, ${size.bytes / 1_000_000} MB back`,
      timeoutMs: WEBVIEW,
    },
    run: (deps) => checkBridgeSize(deps.bridge, size.bytes),
  })),
  {
    spec: { id: 'sqlite-version', group: 'storage', label: 'SQLite version', timeoutMs: SHORT },
    run: (deps) => checkSqliteVersion(deps.db),
  },
  {
    spec: { id: 'fts5-trigram', group: 'storage', label: 'FTS5 trigram search', timeoutMs: SHORT },
    run: (deps) => checkFts5Trigram(deps.db),
  },
  {
    spec: {
      id: 'storage-sizes',
      group: 'storage',
      label: 'Database size and free space',
      timeoutMs: SHORT,
    },
    run: (deps) => checkStorageSizes(deps.storage()),
  },
  {
    spec: { id: 'bed-decode', group: 'audio', label: 'Base-pack beds decode', timeoutMs: AUDIO },
    run: (deps) => checkBedDecode(deps.audio),
  },
  {
    spec: {
      id: 'ducking-ramps',
      group: 'audio',
      label: 'Ducking ramps on the audio clock',
      timeoutMs: AUDIO,
    },
    run: (deps) => checkDuckingRamps(deps.audio),
  },
  {
    spec: { id: 'lock-screen', group: 'audio', label: 'Lock-screen session', timeoutMs: SHORT },
    run: (deps) => checkLockScreenSession(deps.audio.hasLockScreenSession()),
  },
  {
    spec: {
      id: 'pipeline-queue',
      group: 'pipeline',
      label: 'Queue and recent job errors',
      timeoutMs: SHORT,
    },
    run: (deps) => checkPipelineQueue(deps.db),
  },
];

/**
 * Runs every probe in order, one at a time, so the audio and WebView probes never overlap. Each
 * result is reported as soon as it is known.
 */
export async function runDiagnostics(
  deps: DiagnosticsDeps,
  probes: readonly ProbeDef[] = PROBES,
  onResult: (result: ProbeResult) => void = () => undefined,
): Promise<ProbeResult[]> {
  const results: ProbeResult[] = [];
  for (const probe of probes) {
    const result = await runProbe(probe.spec, () => probe.run(deps));
    results.push(result);
    onResult(result);
  }
  return results;
}
