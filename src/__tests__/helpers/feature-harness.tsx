import { render, type RenderOptions } from '@testing-library/react-native';

import { DbContext } from '@/db/hooks';
import { PipelineContext, type PipelineFacade } from '@/features/pipeline/facade';
import { ThemeProvider } from '@/ui/theme';
import { ToastProvider } from '@/ui/toast';

import type { Db } from '@/db/types';
import type { ReactElement } from 'react';

/** Renders a feature screen inside the providers it reads: theme, toasts, the open DB and the pipeline. */
export async function renderWithApp(
  ui: ReactElement,
  { db, pipeline, ...options }: { db: Db; pipeline: PipelineFacade } & RenderOptions,
) {
  return await render(
    <ThemeProvider initialMode="dark">
      <DbContext.Provider value={db}>
        <PipelineContext.Provider value={pipeline}>
          <ToastProvider>{ui}</ToastProvider>
        </PipelineContext.Provider>
      </DbContext.Provider>
    </ThemeProvider>,
    options,
  );
}
