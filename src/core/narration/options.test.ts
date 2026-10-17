import { ModelIdSchema } from '../settings';
import {
  FREE_NARRATOR_DAILY_LIMIT_MESSAGE,
  FREE_NARRATOR_MODEL_ID,
  GEMINI_NARRATOR_MODEL_ID,
  isLanguageSupported,
  KOKORO_MODEL_ID,
  NARRATOR_OPTIONS,
  DEFAULT_NARRATE_CONCURRENCY,
  narrateConcurrencyFor,
  optionFor,
  segmentLimitsFor,
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

  it('sizes every curated segment under the 4,000-character speech guard', () => {
    for (const entry of NARRATOR_OPTIONS) {
      expect(segmentMaxCharsFor(entry.modelId)).toBeLessThan(4_000);
    }
  });

  it('limits paid segments to 40 seconds of speech, and the free narrator to 120', () => {
    expect(option('best').segmentMaxSeconds).toBe(40);
    expect(option('budget').segmentMaxSeconds).toBe(40);
    expect(option('free').segmentMaxSeconds).toBe(120);
  });

  it('starts every narrator with a 12-second first segment, so the first audio arrives quickly', () => {
    for (const entry of NARRATOR_OPTIONS) {
      expect(entry.firstMaxSeconds).toBe(12);
      expect(entry.firstMaxSeconds).toBeLessThanOrEqual(entry.segmentMaxSeconds);
    }
  });

  it('runs three requests at once for the paid narrators, and one for the rate-limited free one', () => {
    expect(option('best').narrateConcurrency).toBe(3);
    expect(option('budget').narrateConcurrency).toBe(3);
    expect(option('free').narrateConcurrency).toBe(1);
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

<<<<<<< HEAD
describe('segmentMaxCharsFor', () => {
  it('gives every Fish Audio model 1,800 characters, Free and paid alike', () => {
    expect(segmentMaxCharsFor(FREE_NARRATOR_MODEL_ID)).toBe(1_800);
    expect(segmentMaxCharsFor('fish-audio/drama-3')).toBe(1_800);
    expect(segmentMaxCharsFor('fish-audio/s2.1-pro')).toBe(1_800);
  });

  it('gives every other speech model the 600-character default', () => {
    expect(segmentMaxCharsFor(GEMINI_NARRATOR_MODEL_ID)).toBe(600);
    expect(segmentMaxCharsFor(KOKORO_MODEL_ID)).toBe(600);
    expect(segmentMaxCharsFor('elevenlabs/eleven-v3')).toBe(600);
=======
describe('segmentLimitsFor', () => {
  it('uses each narrator limits, and the defaults for any other speech model', () => {
    expect(segmentLimitsFor(FREE_NARRATOR_MODEL_ID)).toEqual({
      maxChars: 1_800,
      maxSeconds: 120,
      firstMaxSeconds: 12,
    });
    expect(segmentLimitsFor(GEMINI_NARRATOR_MODEL_ID)).toEqual({
      maxChars: 600,
      maxSeconds: 40,
      firstMaxSeconds: 12,
    });
    expect(segmentLimitsFor(KOKORO_MODEL_ID)).toEqual({
      maxChars: 600,
      maxSeconds: 40,
      firstMaxSeconds: 12,
    });
    expect(segmentLimitsFor('elevenlabs/eleven-v3')).toEqual({
      maxChars: 600,
      maxSeconds: 40,
      firstMaxSeconds: 12,
    });
  });
});

describe('narrateConcurrencyFor', () => {
  it('uses each narrator concurrency, and the default for any other speech model', () => {
    expect(narrateConcurrencyFor(GEMINI_NARRATOR_MODEL_ID)).toBe(3);
    expect(narrateConcurrencyFor(KOKORO_MODEL_ID)).toBe(3);
    expect(narrateConcurrencyFor(FREE_NARRATOR_MODEL_ID)).toBe(1);
    expect(narrateConcurrencyFor('elevenlabs/eleven-v3')).toBe(DEFAULT_NARRATE_CONCURRENCY);
    expect(DEFAULT_NARRATE_CONCURRENCY).toBe(2);
>>>>>>> 54b3d2e
  });
});

describe('narrators for models outside the three', () => {
  it('has no narrator option for a model that is not curated, so the language guard never applies', () => {
    expect(optionFor('fish-audio/drama-3')).toBeNull();
    expect(optionFor('bytedance-seed/seed-audio-1-0')).toBeNull();
  });
});
