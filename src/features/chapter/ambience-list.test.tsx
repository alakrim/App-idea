import { screen } from '@testing-library/react-native';

import { AmbienceList } from './ambience-list';
import { renderThemed } from '../../__tests__/helpers/render-themed';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('../../__tests__/helpers/reanimated-stub'));
jest.mock('@/ui/icons', () => new Proxy({}, { get: () => () => null }));

describe('AmbienceList empty state', () => {
  it('says no clear setting was found once the chapter has been analysed', async () => {
    await renderThemed(<AmbienceList cues={[]} analysed onToggle={() => undefined} />);

    expect(screen.getByText('No ambience: no clear setting found')).toBeOnTheScreen();
  });

  it('keeps the plain copy before the chapter has been analysed', async () => {
    await renderThemed(<AmbienceList cues={[]} analysed={false} onToggle={() => undefined} />);

    expect(
      screen.getByText('No ambience in this chapter. Its voice plays on its own.'),
    ).toBeOnTheScreen();
    expect(screen.queryByText('No ambience: no clear setting found')).toBeNull();
  });
});
