/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Module stand-ins shared by the feature tests. Each test file calls jest.mock() with these so the
 * mocks are hoisted above its imports, as Jest requires.
 */
export const reanimatedStub = () => require('./reanimated-stub');
export const lucideStub = () => new Proxy({}, { get: () => () => null });
export const expoSqliteStub = () => require('./fake-expo-sqlite');
export const expoImageStub = () => ({ Image: () => null });
/** Renders the sheet's children only while it is open, as the real sheet does. */
export const bottomSheetStub = () => {
  const React = require('react');
  const RN = require('react-native');
  const Sheet = ({ index, children }: { index: number; children: unknown }) =>
    index >= 0 ? React.createElement(RN.View, null, children) : null;
  return {
    __esModule: true,
    default: Sheet,
    BottomSheetBackdrop: () => null,
    BottomSheetView: ({ children }: { children: unknown }) =>
      React.createElement(RN.View, null, children),
  };
};
export const expoRouterStub = () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
});
