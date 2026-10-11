import { deviceFrom, gitShaFrom, reactNativeVersionFrom } from './environment';

describe('environment readout', () => {
  it('uses the git sha the build injected, and dev when there is none', () => {
    expect(gitShaFrom({ gitSha: 'f00ba12' })).toBe('f00ba12');
    expect(gitShaFrom({ gitSha: '' })).toBe('dev');
    expect(gitShaFrom(undefined)).toBe('dev');
  });

  it('formats the React Native version, with any prerelease tag', () => {
    expect(reactNativeVersionFrom({ reactNativeVersion: { major: 0, minor: 86, patch: 3 } })).toBe(
      '0.86.3',
    );
    expect(
      reactNativeVersionFrom({
        reactNativeVersion: { major: 0, minor: 87, patch: 0, prerelease: 'rc.1' },
      }),
    ).toBe('0.87.0-rc.1');
    expect(reactNativeVersionFrom({})).toBe('unknown');
  });

  it('reads the Android brand, model, release and API level', () => {
    expect(
      deviceFrom({ Brand: 'google', Model: 'Pixel 8', Release: '15', Version: 35 }, 'android'),
    ).toEqual({ model: 'google Pixel 8', osVersion: '15 · API 35' });
  });

  it('reads the iOS model and version, and leaves the model null when none is reported', () => {
    expect(deviceFrom({ osVersion: '18.2' }, 'ios')).toEqual({ model: null, osVersion: '18.2' });
  });
});
