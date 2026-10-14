/*
 * Jest stand-in for react-native-background-actions. Jest uses it for every test that imports the
 * library, so no test reaches the native module. The library ships no mock of its own.
 */
const library = {
  start: jest.fn((_task: () => Promise<void>, _options: unknown) => Promise.resolve()),
  stop: jest.fn(() => Promise.resolve()),
  updateNotification: jest.fn((_options: unknown) => Promise.resolve()),
  isRunning: jest.fn(() => false),
};

export default library;
