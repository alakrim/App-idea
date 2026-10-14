/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories load react with require() */
/**
 * Unit-test stand-in for the Reanimated swipe row. It renders the delete panel inline, so a test can
 * press Delete without a gesture. Use it through jest.mock('react-native-gesture-handler/ReanimatedSwipeable').
 */
const React = require('react');
const { View } = require('react-native');

module.exports = {
  __esModule: true,
  default: ({
    children,
    renderRightActions,
  }: {
    children?: unknown;
    renderRightActions?: () => unknown;
  }) => React.createElement(View, null, children, renderRightActions ? renderRightActions() : null),
};
