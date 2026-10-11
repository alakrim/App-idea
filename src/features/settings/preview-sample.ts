import { stableHash } from '@/core/pipeline/hash';

/**
 * Voice previews speak one fixed sentence of about fifteen words. The sentence is chosen by the
 * language the user will hear, which is their default target language or else the UI language.
 * Languages without a sample fall back to English.
 */

export const PREVIEW_SAMPLES: Readonly<Record<string, string>> = {
  en: 'Once upon a time, the lamp burned low and the story began to breathe again.',
  it: "C'era una volta una lampada accesa, e la storia cominciò piano a respirare di nuovo.",
  pt: 'Era uma vez uma lâmpada acesa, e a história começou devagar a respirar outra vez.',
  es: 'Érase una vez una lámpara encendida, y la historia empezó a respirar otra vez despacio.',
  fr: "Il était une fois une lampe allumée, et l'histoire se remit doucement à respirer encore.",
  de: 'Es war einmal eine brennende Lampe, und die Geschichte begann langsam, leise wieder zu atmen.',
};

export interface PreviewSample {
  /** The language code the sample is written in. */
  lang: string;
  text: string;
}

/** The sample for a BCP-47 tag. Only the primary subtag matters: "pt-BR" uses the Portuguese sample. */
export function previewSampleFor(tag: string | null): PreviewSample {
  const primary = (tag ?? 'en').split('-')[0]?.toLowerCase() ?? 'en';
  const text = PREVIEW_SAMPLES[primary];
  if (text === undefined) {
    return { lang: 'en', text: PREVIEW_SAMPLES.en ?? '' };
  }
  return { lang: primary, text };
}

export interface PreviewKeyParts {
  model: string;
  voice: string;
  lang: string;
  style: string | null;
  speed: number;
}

/**
 * File name stem for a cached preview. Speed is part of the key because it changes the audio, so
 * a sped-up preview must not replay for the normal speed.
 */
export function previewCacheKey(parts: PreviewKeyParts): string {
  return stableHash([parts.model, parts.voice, parts.lang, parts.style ?? '', parts.speed]);
}
