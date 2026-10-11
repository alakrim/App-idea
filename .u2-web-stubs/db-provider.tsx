// TEMPORARY web-export stub (U2 screenshots only). SQLite does not run on web.
import { DbContext } from '@/db/hooks';
import { DEFAULT_SETTINGS } from '@/core/defaults';
import { settingsStore } from '@/features/settings/settings-store';
import type { ReactNode } from 'react';

// A chainable no-op database: reads come back empty, writes do nothing.
const chain: unknown = new Proxy(function () {}, {
  get: (_t, prop) => {
    if (prop === 'then') return undefined;
    if (prop === 'all' || prop === 'values') return () => [];
    if (prop === 'get') return () => undefined;
    if (prop === 'run') return () => ({ changes: 0 });
    return chain;
  },
  apply: () => chain,
});

// Screenshots show the signed-in app, so onboarding counts as done.
settingsStore.useSettingsState.setState({
  settings: { ...DEFAULT_SETTINGS, onboardingDone: true, contentNoticeAccepted: true },
  hydrated: true,
});

export function DbProvider({ children }: { children: ReactNode }) {
  return <DbContext.Provider value={chain as never}>{children}</DbContext.Provider>;
}
export { useDb } from '@/db/hooks';
