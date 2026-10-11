/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Unit-test stand-in for react-native-gesture-handler. Gesture callbacks run on device only; in
 * Jest the builder chains and the detector just render their children.
 */
const RN = require('react-native');
const React = require('react');

const chain: Record<string, unknown> = new Proxy(
  {},
  {
    get: (_target, property) => (property === 'then' ? undefined : () => chain),
  },
);

module.exports = {
  __esModule: true,
  Gesture: { Pan: () => chain, Tap: () => chain },
  GestureDetector: ({ children }: { children: unknown }) =>
    React.createElement(RN.View, null, children),
  GestureHandlerRootView: ({ children }: { children: unknown }) =>
    React.createElement(RN.View, null, children),
};
