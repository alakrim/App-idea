// The sampled ambience targets (brief SND1): one entry per taxonomy category that a real recording should
// cover. `queries` are free-text searches for the open sources; `keywords` are words a good title or
// description carries, used by curation-score.mjs. Category ids are never renamed (ADR-0005).

export const CURATION_TARGETS = [
  {
    category: 'forest_day_birds',
    queries: ['forest birdsong', 'woodland birds dawn chorus'],
    keywords: ['bird', 'birds', 'forest', 'woodland', 'dawn chorus'],
  },
  {
    category: 'jungle_insects',
    queries: ['jungle insects ambience', 'rainforest night insects'],
    keywords: ['jungle', 'rainforest', 'insect', 'cicada', 'tropical'],
  },
  {
    category: 'ocean_waves',
    queries: ['ocean waves beach ambience', 'sea waves shore'],
    keywords: ['ocean', 'wave', 'waves', 'sea', 'beach', 'shore', 'surf'],
  },
  {
    category: 'open_field_wind',
    queries: ['wind grass field ambience', 'wind meadow field recording'],
    keywords: ['wind', 'field', 'grass', 'meadow', 'prairie', 'moor'],
  },
  {
    category: 'city_street_day',
    queries: ['city street ambience daytime', 'traffic street field recording'],
    keywords: ['street', 'city', 'traffic', 'urban', 'town'],
  },
  {
    category: 'city_night',
    queries: ['city night ambience', 'night street ambience'],
    keywords: ['night', 'city', 'street', 'urban', 'night ambience'],
  },
  {
    category: 'market_crowd',
    queries: ['market crowd ambience', 'street market field recording'],
    keywords: ['market', 'bazaar', 'crowd', 'vendors', 'marketplace'],
  },
  {
    category: 'crowd_murmur',
    queries: ['crowd murmur ambience', 'people talking crowd room tone'],
    keywords: ['crowd', 'murmur', 'people', 'busy', 'chatter'],
  },
  {
    category: 'tavern_crowd',
    queries: ['tavern ambience', 'pub crowd ambience'],
    keywords: ['tavern', 'pub', 'inn', 'bar', 'crowd'],
  },
  {
    category: 'castle_hall',
    queries: ['castle hall ambience', 'stone hall reverb room tone'],
    keywords: ['castle', 'hall', 'stone', 'cathedral', 'reverb', 'church'],
  },
  {
    category: 'fireplace_crackle',
    queries: ['fireplace crackle', 'wood fire crackling ambience'],
    keywords: ['fire', 'fireplace', 'crackle', 'crackling', 'hearth'],
  },
  {
    category: 'cafe_soft',
    queries: ['cafe ambience', 'coffee shop ambience'],
    keywords: ['cafe', 'café', 'coffee', 'coffeehouse', 'restaurant'],
  },
  {
    category: 'horse_trot',
    queries: ['horse hooves trot', 'horse walking hooves field recording'],
    keywords: ['horse', 'hooves', 'hoof', 'trot', 'stable'],
  },
  {
    category: 'ship_deck',
    queries: ['ship deck ambience', 'boat deck sea wind creaks'],
    keywords: ['ship', 'deck', 'boat', 'sea', 'harbour', 'harbor', 'ferry'],
  },
  {
    category: 'battle_field',
    queries: ['battlefield ambience', 'distant battle field recording'],
    keywords: ['battle', 'battlefield', 'war', 'field', 'distant', 'artillery'],
  },
];
