import { parseAmbienceLicenses, soundTitle } from './licenses';

describe('ambience licence list', () => {
  it('turns each base sound into a title and keeps its licence', () => {
    const entries = parseAmbienceLicenses([{ id: 'base_space_hum', license: 'Proprietary (generated in-house)' }]);
    expect(entries).toEqual([{ id: 'base_space_hum', title: 'Space Hum', license: 'Proprietary (generated in-house)' }]);
    expect(soundTitle('base_rain')).toBe('Rain');
  });

  it('skips a malformed entry and keeps the valid ones', () => {
    const entries = parseAmbienceLicenses([{ id: 'base_rain' }, { id: 'base_wind', license: 'CC0' }]);
    expect(entries.map((entry) => entry.id)).toEqual(['base_wind']);
  });

  it('renders nothing for a file that is not a list', () => {
    expect(parseAmbienceLicenses({ not: 'a list' })).toEqual([]);
  });
});
