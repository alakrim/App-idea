import { useMemo, useState } from 'react';

import { useDb } from '@/db/hooks';
import { SettingsPage } from '@/features/settings/settings-page';
import { loadUsageSummary } from '@/features/settings/usage-query';
import { UsageView } from '@/features/settings/usage-view';

export default function UsageScreen() {
  const db = useDb();
  const [now] = useState(() => Date.now());
  const summary = useMemo(() => loadUsageSummary(db, now), [db, now]);

  return (
    <SettingsPage title="Usage and costs">
      <UsageView summary={summary} />
    </SettingsPage>
  );
}
