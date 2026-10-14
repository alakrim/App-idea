import { readFileSync } from 'fs';
import { join } from 'path';

import { getCategory } from '@/core/analysis/ambience-taxonomy';

import { INSTALLED_BEDS, resolveInstalledBed } from './ambience-pack';

const ROOT = join(__dirname, '..', '..');
const realManifest = require('../../assets/ambience/real/manifest.json') as {
  id: string;
  file: string;
  source: string;
  freesoundId: number;
  author: string;
  url: string;
}[];
const baseManifest = require('../../assets/ambience/base/manifest.json') as { id: string }[];
const ledger = require('../../assets/ambience/LICENSES.json') as {
  id: string;
  license: string;
  source: string;
  author: string;
}[];
const CC0 = 'http://creativecommons.org/publicdomain/zero/1.0/';

describe('installed beds', () => {
  it('installs every base-pack bed and every real bed in the manifests', () => {
    for (const row of [...baseManifest, ...realManifest]) {
      expect({ id: row.id, installed: INSTALLED_BEDS.has(row.id) }).toEqual({
        id: row.id,
        installed: true,
      });
    }
    expect(INSTALLED_BEDS.size).toBe(baseManifest.length + realManifest.length);
  });

  it('keeps the real beds on the Freesound source with their credit and page', () => {
    expect(realManifest).toHaveLength(12);
    for (const row of realManifest) {
      const bed = INSTALLED_BEDS.get(row.id);
      expect(bed?.meta).toMatchObject({
        source: 'freesound',
        freesoundId: row.freesoundId,
        author: row.author,
        url: row.url,
      });
    }
  });

  it('binds every real bed to a bed category of the taxonomy', () => {
    for (const row of realManifest) {
      expect({ id: row.id, kind: getCategory(row.id)?.kind }).toEqual({ id: row.id, kind: 'bed' });
    }
  });

  it('has a CC0 ledger row, with the sound page as the source, for every real bed', () => {
    for (const row of realManifest) {
      const entry = ledger.find((candidate) => candidate.id === row.id);
      expect(entry).toBeDefined();
      expect(entry?.license).toContain(CC0);
      expect(entry?.source).toBe(row.url);
      expect(entry?.author).toBe(row.author);
    }
  });

  it('requires every real bed in the bundle source, so Metro ships it', () => {
    const source = readFileSync(join(ROOT, 'src', 'audio', 'ambience-pack.ts'), 'utf8');
    for (const row of realManifest) {
      expect(source).toContain(`require('../../assets/ambience/real/${row.file}')`);
    }
  });
});

describe('resolveInstalledBed', () => {
  it('plays the real bed for the exact category', () => {
    expect(resolveInstalledBed('forest_night')?.id).toBe('forest_night');
    expect(resolveInstalledBed('waterfall')?.id).toBe('waterfall');
    expect(resolveInstalledBed('train_interior')?.id).toBe('train_interior');
  });

  it('falls back to a real bed on the chain before the base pack', () => {
    // jungle_insects has no real bed: forest_day_birds (real) comes before base_* on its chain.
    expect(resolveInstalledBed('jungle_insects')?.id).toBe('forest_day_birds');
    // ship_deck has no real bed and its chain ends at base_ocean (ocean_waves is unfilled, A4).
    expect(resolveInstalledBed('ship_deck')?.id).toBe('base_ocean');
  });

  it('keeps the base pack for categories with no real bed on their chain', () => {
    expect(resolveInstalledBed('qi_hum')?.id).toBe('base_space_hum');
    expect(resolveInstalledBed('fireplace_crackle')?.id).toBe('base_fire');
  });

  it('skips a category whose chain is null', () => {
    expect(resolveInstalledBed('spirit_whispers')).toBeNull();
    expect(resolveInstalledBed('tense_heartbeat')).toBeNull();
  });

  it('skips an unknown category without throwing', () => {
    expect(resolveInstalledBed('dragon_roar')).toBeNull();
  });

  describe('with a chapter era (A4)', () => {
    it('never plays a modern bed in a medieval (historic) chapter: a town gets the historic crowd, not the street', () => {
      expect(resolveInstalledBed('city_street_day', 'historic')?.id).not.toBe('city_street_day');
      expect(resolveInstalledBed('city_night', 'historic')?.id).not.toBe('city_night');
    });

    it('keeps a storm in a medieval chapter timeless: thunderstorm is unfilled, so the chain gives timeless rain', () => {
      const bed = resolveInstalledBed('thunderstorm', 'historic');
      expect(bed).not.toBeNull();
      expect(getCategory(bed?.id ?? '')?.era ?? 'timeless').toBe('timeless');
    });

    it('plays a modern bed in a modern chapter', () => {
      expect(resolveInstalledBed('train_interior', 'modern')?.id).toBe('train_interior');
    });
  });
});
