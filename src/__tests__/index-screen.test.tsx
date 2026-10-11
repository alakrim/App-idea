import { render, screen } from '@testing-library/react-native';
import { DefaultTheme, ThemeProvider } from 'expo-router';

import IndexScreen from '../../app/index';

describe('IndexScreen', () => {
  it('renders the Lectio title as a header', async () => {
    await render(
      <ThemeProvider value={DefaultTheme}>
        <IndexScreen />
      </ThemeProvider>,
    );

    expect(screen.getByRole('header', { name: 'Lectio' })).toBeOnTheScreen();
  });
});
