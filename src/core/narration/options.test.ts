import { ModelIdSchema } from '../settings';
import {
  FREE_NARRATOR_DAILY_LIMIT_MESSAGE,
  FREE_NARRATOR_MODEL_ID,
  GEMINI_NARRATOR_MODEL_ID,
  isLanguageSupported,
  KOKORO_MODEL_ID,
  NARRATOR_OPTIONS,
  optionFor,
  segmentMaxCharsFor,
  type NarratorId,
} from './options';

/** Voice lists in the shape the live catalogue returns them (ADR-0003, L1 brief). */
const KOKORO_VOICES = [
  'af_heart',
  'af_alloy',
  'am_adam',
  'bf_emma',
  'if_sara',
  'pf_dora',
  'zf_xiaobei',
  'jf_alpha',
];
const GEMINI_VOICES = ['Zephyr', 'Puck', 'Charon', 'Kore'];

function option(id: NarratorId) {
  const found = NARRATOR_OPTIONS.find((entry) => entry.id === id);
  if (!found) throw new Error(`no narrator ${id}`);
  return found;
}

describe('NARRATOR_OPTIONS catalogue', () => {
  it('offers exactly the three narrators, best first', () => {
    expect(NARRATOR_OPTIONS.map((entry) => entry.id)).toEqual(['best', 'budget', 'free']);
    expect(NARRATOR_OPTIONS.map((entry) => entry.modelId)).toEqual([
      GEMINI_NARRATOR_MODEL_ID,
      KOKORO_MODEL_ID,
      FREE_NARRATOR_MODEL_ID,
    ]);
  });

  it('gives every narrator valid model ids, labels and copy', () => {
    for (const entry of NARRATOR_OPTIONS) {
      expect(ModelIdSchema.safeParse(entry.modelId).success).toBe(true);
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.tagline.length).toBeGreaterThan(0);
      expect(entry.notes.length).toBeGreaterThan(0);
    }
    expect(new Set(NARRATOR_OPTIONS.map((entry) => entry.modelId)).size).toBe(3);
  });

  it('sizes every segment under the 4,000-character speech guard', () => {
    expect(option('best').segmentMaxChars).toBe(600);
    expect(option('budget').segmentMaxChars).toBe(600);
    expect(option('free').segmentMaxChars).toBe(1_800);
    for (const entry of NARRATOR_OPTIONS) {
      expect(entry.segmentMaxChars).toBeLessThan(4_000);
    }
  });

  it('allows style notes for Gemini only', () => {
    expect(NARRATOR_OPTIONS.filter((entry) => entry.supportsStyle).map((e) => e.id)).toEqual([
      'best',
    ]);
  });

  it('states the daily limit in the message the narrator shows', () => {
    expect(FREE_NARRATOR_DAILY_LIMIT_MESSAGE).toContain("free narrator's daily limit");
    expect(FREE_NARRATOR_DAILY_LIMIT_MESSAGE).toContain('Budget narrator (about $0.03 per hour)');
  });
});

describe('optionFor', () => {
  it('finds the narrator for its model id, and nothing for other speech models', () => {
    expect(optionFor(KOKORO_MODEL_ID)?.id).toBe('budget');
    expect(optionFor(FREE_NARRATOR_MODEL_ID)?.id).toBe('free');
    expect(optionFor('elevenlabs/eleven-v3')).toBeNull();
  });
});

describe('isLanguageSupported', () => {
  it('supports every language for the multilingual narrators', () => {
    for (const lang of ['en', 'ja', 'pt-PT', 'zh-Hant', 'ar']) {
      expect(isLanguageSupported(option('best'), lang)).toBe(true);
      expect(isLanguageSupported(option('free'), lang)).toBe(true);
    }
  });

  it('derives Kokoro languages from its voice-letter map, with no other languages', () => {
    const kokoro = option('budget');
    expect(kokoro.languages).toEqual(['en', 'es', 'fr', 'hi', 'it', 'ja', 'pt-BR', 'zh']);
    for (const lang of ['en', 'it', 'ja', 'zh-Hans', 'pt-PT']) {
      expect(isLanguageSupported(kokoro, lang)).toBe(true);
    }
    for (const lang of ['de', 'ko', 'ru']) {
      expect(isLanguageSupported(kokoro, lang)).toBe(false);
    }
  });
});

describe('defaultVoice', () => {
  it('defaults Gemini to Kore, and falls back to the first listed voice without it', () => {
    expect(option('best').defaultVoice('it', GEMINI_VOICES)).toBe('Kore');
    expect(option('best').defaultVoice('it', ['Puck', 'Charon'])).toBe('Puck');
    expect(option('best').defaultVoice('it', [])).toBe('Kore');
  });

  it('picks the Kokoro voice for each language from the live list', () => {
    const kokoro = option('budget');
    expect(kokoro.defaultVoice('en', KOKORO_VOICES)).toBe('af_heart');
    expect(kokoro.defaultVoice('it', KOKORO_VOICES)).toBe('if_sara');
    expect(kokoro.defaultVoice('pt-BR', KOKORO_VOICES)).toBe('pf_dora');
    expect(kokoro.defaultVoice('zh', KOKORO_VOICES)).toBe('zf_xiaobei');
    expect(kokoro.defaultVoice('ja', KOKORO_VOICES)).toBe('jf_alpha');
  });

  it('takes the first female English voice when af_heart is not listed', () => {
    expect(option('budget').defaultVoice('en', ['am_adam', 'af_alloy'])).toBe('af_alloy');
  });

  it('returns null for a Kokoro language it does not speak, once the list is known', () => {
    expect(option('budget').defaultVoice('de', KOKORO_VOICES)).toBeNull();
  });

  it('uses the static Kokoro voice while the list is unknown', () => {
    expect(option('budget').defaultVoice('it', [])).toBe('if_sara');
    expect(option('budget').defaultVoice('de', [])).toBeNull();
  });

  it('gives the free narrator no voice, because it lists none', () => {
    expect(option('free').defaultVoice('en', [])).toBeNull();
    expect(option('free').defaultVoice('en', ['nova'])).toBe('nova');
  });
});

describe('segmentMaxCharsFor', () => {
  it('uses each narrator size, and the default for any other speech model', () => {
    expect(segmentMaxCharsFor(FREE_NARRATOR_MODEL_ID)).toBe(1_800);
    expect(segmentMaxCharsFor(GEMINI_NARRATOR_MODEL_ID)).toBe(600);
    expect(segmentMaxCharsFor('elevenlabs/eleven-v3')).toBe(600);
  });
});
