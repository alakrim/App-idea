/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Unit-test stand-in for react-native-reanimated. The real package needs its worklets runtime,
 * which Jest cannot load. Motion is verified on device; these tests check behaviour and output.
 * Use with: jest.mock('react-native-reanimated', () => require('./helpers/reanimated-stub'));
 */
const RN = require('react-native');

const layoutAnimation = { duration: () => layoutAnimation, delay: () => layoutAnimation };

module.exports = {
  __esModule: true,
  default: { View: RN.View, ScrollView: RN.ScrollView, FlatList: RN.FlatList, Text: RN.Text },
  useSharedValue: (initial: unknown) => ({ value: initial }),
  useAnimatedStyle: () => ({}),
  useAnimatedScrollHandler: () => () => undefined,
  useReducedMotion: () => false,
  withSpring: (value: number) => value,
  withTiming: (value: number) => value,
  withRepeat: (value: number) => value,
  cancelAnimation: () => undefined,
  interpolate: () => 0,
  Extrapolation: { CLAMP: 'clamp' },
  Easing: { bezier: () => () => 0, linear: (value: number) => value },
  FadeIn: layoutAnimation,
  FadeInUp: layoutAnimation,
  FadeOut: layoutAnimation,
};
