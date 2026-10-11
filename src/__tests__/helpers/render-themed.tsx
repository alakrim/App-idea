import { render, type RenderOptions } from '@testing-library/react-native';

import { ThemeProvider, type ThemeMode } from '@/ui/theme';
import { ToastProvider } from '@/ui/toast';

import type { ReactElement } from 'react';

/** Renders with the theme (and toast host) that every app screen expects. */
export function renderThemed(ui: ReactElement, options: { mode?: ThemeMode } & RenderOptions = {}) {
  const { mode = 'dark', ...renderOptions } = options;
  return render(
    <ThemeProvider initialMode={mode}>
      <ToastProvider>{ui}</ToastProvider>
    </ThemeProvider>,
    renderOptions,
  );
}
