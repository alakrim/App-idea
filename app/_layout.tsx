import { useFonts } from 'expo-font';
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider as NavigationThemeProvider,
} from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, type ComponentProps } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { fontAssets } from '@/ui/fonts';
import { ThemeProvider, useTheme } from '@/ui/theme';
import { ToastProvider } from '@/ui/toast';
import { fontFamily, type ThemeScheme } from '@/ui/tokens';

type NavigationTheme = NonNullable<ComponentProps<typeof NavigationThemeProvider>['value']>;

// Keep the native splash up until fonts are ready. Failing to hold it is harmless.
SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const ready = fontsLoaded || fontError !== null;

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [ready]);

  if (!ready) {
    return null;
  }

  // A font failure falls back to the system font. The app stays usable.
  return (
    <ThemeProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <RootNavigator />
      </GestureHandlerRootView>
    </ThemeProvider>
  );
}

function RootNavigator() {
  const { colors, scheme } = useTheme();
  const navigationTheme = useNavigationTheme(scheme);

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <ToastProvider>
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
      </ToastProvider>
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
