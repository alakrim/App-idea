import { useFonts } from 'expo-font';
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider as NavigationThemeProvider,
  type ErrorBoundaryProps,
} from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useMemo, type ComponentProps } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { DbProvider } from '@/app-shell/db-provider';
import { FatalError, formatErrorDetails } from '@/app-shell/fatal-error';
import { OpenRouterProvider } from '@/app-shell/openrouter-provider';
import { useSettings } from '@/features/settings/settings-store';
import { fontAssets } from '@/ui/fonts';
import { ThemeProvider, useTheme } from '@/ui/theme';
import { ToastProvider } from '@/ui/toast';
import { fontFamily, type ThemeScheme } from '@/ui/tokens';

type NavigationTheme = NonNullable<ComponentProps<typeof NavigationThemeProvider>['value']>;

// Keep the native splash up until fonts are ready and the library has opened. DbProvider hides it.
SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const { settings, patch } = useSettings();
  // A font failure falls back to the system font. The app stays usable.
  const fontsReady = fontsLoaded || fontError !== null;

  if (!fontsReady) {
    return null;
  }

  return (
    <ThemeProvider mode={settings.theme} onModeChange={(theme) => patch({ theme })}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <DbProvider>
          <OpenRouterProvider>
            <ToastProvider>
              <RootNavigator />
            </ToastProvider>
          </OpenRouterProvider>
        </DbProvider>
      </GestureHandlerRootView>
    </ThemeProvider>
  );
}

/** Last-resort screen for errors that escape the layout. It sits outside every provider, so it brings its own. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const { settings } = useSettings();
  return (
    <ThemeProvider mode={settings.theme}>
      <FatalError
        title="Something went wrong"
        message="Lectio hit an unexpected error. Try again. If it keeps happening, copy the details and send them to us."
        details={formatErrorDetails('rendering the app', error)}
        onRetry={() => {
          void retry();
        }}
      />
    </ThemeProvider>
  );
}

function RootNavigator() {
  const { colors, scheme } = useTheme();
  const navigationTheme = useNavigationTheme(scheme);

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.accent,
          headerShadowVisible: false,
          headerTitleStyle: { color: colors.text, fontFamily: fontFamily.inter.semibold },
        }}
      />
    </NavigationThemeProvider>
  );
}

function useNavigationTheme(scheme: ThemeScheme): NavigationTheme {
  const { colors } = useTheme();

  return useMemo<NavigationTheme>(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.accent,
        background: colors.bg,
        card: colors.surface,
        text: colors.text,
        border: colors.border,
        notification: colors.accent,
      },
    };
  }, [scheme, colors]);
}
