import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInUp, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMotion } from './motion';
import { Text } from './text';
import { useTheme } from './theme';
import { durations, gutter, hairline, radius, space } from './tokens';

export type ToastTone = 'neutral' | 'success' | 'danger';

export interface ToastAction {
  label: string;
  onPress: () => void;
}

export interface ToastInput {
  message: string;
  tone?: ToastTone;
  /** An optional button on the toast, such as "Connect OpenRouter". */
  action?: ToastAction;
}

interface ToastApi {
  show: (input: ToastInput) => void;
}

const TOAST_DURATION_MS = 3500;

const ToastContext = createContext<ToastApi | null>(null);

interface ActiveToast {
  id: number;
  message: string;
  tone: ToastTone;
  action: ToastAction | undefined;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ActiveToast | null>(null);
  const lastId = useRef(0);

  const show = useCallback(({ message, tone = 'neutral', action }: ToastInput) => {
    lastId.current += 1;
    setActive({ id: lastId.current, message, tone, action });
  }, []);

  useEffect(() => {
    if (!active) {
      return;
    }
    const timer = setTimeout(() => {
      setActive((current) => (current?.id === active.id ? null : current));
    }, TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [active]);

  const api = useMemo<ToastApi>(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {active ? (
        <ToastView
          key={active.id}
          message={active.message}
          tone={active.tone}
          action={active.action}
          onDismiss={() => setActive((current) => (current?.id === active.id ? null : current))}
        />
      ) : null}
    </ToastContext.Provider>
  );
}

/** Returns a `show` function. Must be used inside <ToastProvider>. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) {
    throw new Error('useToast() must be used inside <ToastProvider>.');
  }
  return api;
}

function ToastView({
  message,
  tone,
  action,
  onDismiss,
}: {
  message: string;
  tone: ToastTone;
  action: ToastAction | undefined;
  onDismiss: () => void;
}) {
  const { colors } = useTheme();
  const { reduced } = useMotion();
  const insets = useSafeAreaInsets();
  const toneColor = tone === 'neutral' ? colors.text : colors[tone];

  return (
    <View style={styles.layer}>
      <Animated.View
        accessibilityLiveRegion="polite"
        entering={reduced ? FadeIn.duration(0) : FadeInUp.duration(durations.standard)}
        exiting={FadeOut.duration(reduced ? 0 : durations.micro)}
        style={[
          styles.toast,
          {
            top: insets.top + space.sm,
            backgroundColor: colors.surfaceRaised,
            borderColor: colors.border,
          },
        ]}
      >
        <Text variant="bodyStrong" tone="default" style={{ color: toneColor }}>
          {message}
        </Text>
        {action ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={action.label}
            hitSlop={space.sm}
            onPress={() => {
              onDismiss();
              action.onPress();
            }}
            style={({ pressed }) => [styles.action, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text variant="bodyStrong" tone="accent">
              {action.label}
            </Text>
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    pointerEvents: 'box-none',
  },
  action: {
    alignSelf: 'flex-end',
    minHeight: 44,
    justifyContent: 'center',
    marginTop: space.xs,
  },
  toast: {
    position: 'absolute',
    left: gutter,
    right: gutter,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
  },
});
