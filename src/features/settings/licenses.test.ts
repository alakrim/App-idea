import { parseAmbienceLicenses, soundTitle } from './licenses';

describe('ambience licence list', () => {
  it('turns each in-house sound into a title, with no credit line', () => {
    const entries = parseAmbienceLicenses([
      { id: 'base_space_hum', license: 'Proprietary (generated in-house)' },
    ]);
    expect(entries).toEqual([
      {
        id: 'base_space_hum',
        title: 'Space Hum',
        license: 'Proprietary (generated in-house)',
        credit: null,
      },
    ]);
    expect(soundTitle('base_rain')).toBe('Rain');
  });

  it('writes the CC BY credit line from the title, author, licence and source page', () => {
    const [entry] = parseAmbienceLicenses([
      {
        id: 'ocean_waves',
        license: 'CC BY 3.0',
        author: 'RorySmith',
        title: 'Brighton Beach - Strong sea waves',
        source: 'https://archive.org/details/aporee_27515_31722',
      },
    ]);
    expect(entry?.credit).toBe(
      '"Brighton Beach - Strong sea waves" by RorySmith. Licence: CC BY 3.0. Source: https://archive.org/details/aporee_27515_31722',
    );
  });

  it('gives a public domain sampled sound no credit line', () => {
    const [entry] = parseAmbienceLicenses([
      {
        id: 'jungle_insects',
        license: 'Public Domain Mark 1.0',
        author: 'matthias.feuersenger',
        title: 'Coastal Forest',
        source: 'https://archive.org/details/aporee_54114_61850',
      },
    ]);
    expect(entry?.credit).toBeNull();
  });

  it('skips a malformed entry and keeps the valid ones', () => {
    const entries = parseAmbienceLicenses([
      { id: 'base_rain' },
      { id: 'base_wind', license: 'CC0' },
    ]);
    expect(entries.map((entry) => entry.id)).toEqual(['base_wind']);
  });

  it('renders nothing for a file that is not a list', () => {
    expect(parseAmbienceLicenses({ not: 'a list' })).toEqual([]);
  });
});
