import { screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { renderThemed } from '../../__tests__/helpers/render-themed';

import { PlaybackProvider } from './player-provider';
import { FullPlayer } from './full-player';
import { fixtureChapter, id, setupController } from './__fixtures__/playback-fixtures';

jest.mock('react-native-reanimated', () => require('../../__tests__/helpers/reanimated-stub'));
jest.mock('react-native-gesture-handler', () => require('./__fixtures__/gesture-stub'));
jest.mock('@gorhom/bottom-sheet', () => require('./__fixtures__/bottom-sheet-stub'));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn() }, Stack: { Screen: () => null } }));

it('debug', async () => {
  const setup = setupController([fixtureChapter(1, 1, 'ready')]);
  await setup.controller.playChapter(id(1));
  await renderThemed(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <PlaybackProvider controller={setup.controller}><FullPlayer /></PlaybackProvider>
    </SafeAreaProvider>,
  );
  console.log('BUTTONS', screen.queryAllByRole('button').map((e) => e.props.accessibilityLabel));
  console.log('ALL LABELS', screen.queryAllByLabelText(/./).map((e) => `${e.props.accessibilityRole}:${e.props.accessibilityLabel}`).slice(0, 60));
});
