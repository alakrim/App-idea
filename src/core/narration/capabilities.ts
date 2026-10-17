/*
 * What a speech model can do, decided from its catalogue entry. One place for the rules that the
 * settings screens, the catalogue adapter and the narrate stage all rely on, so they cannot drift
 * apart. Pure, so it runs in Node tests and on the device.
 */

/**
 * Speech models that cannot read a text verbatim. `bytedance-seed/seed-audio-1-0` treats `input` as
 * a prompt for a performance, not as the text to read, and it rejects a `voice` sent together with
 * reference audio. A book read through it would not be the book, so it is never offered.
 */
const NON_NARRATABLE_MODEL_IDS: ReadonlySet<string> = new Set(['bytedance-seed/seed-audio-1-0']);

/** A speech model the user can narrate with: any speech output, except the deny-listed models. */
export function isNarratableModel(model: {
  id: string;
  outputModalities: readonly string[];
}): boolean {
  return model.outputModalities.includes('speech') && !NON_NARRATABLE_MODEL_IDS.has(model.id);
}

/** Fish Audio models, the Free narrator among them. */
export function isFishModel(modelId: string): boolean {
  return modelId.startsWith('fish-audio/');
}

/**
 * Whether the model follows the `instructions` (style) field. Gemini TTS, gpt-4o-mini-tts and every
 * Fish Audio model do, and so does any model that lists `instructions` among its parameters.
 */
export function supportsStyleInstructions(model: {
  id: string;
  supportedParameters?: readonly string[];
}): boolean {
  const id = model.id.toLowerCase();
  if (id.includes('gemini') && id.includes('tts')) return true;
  if (id.includes('gpt-4o-mini-tts')) return true;
  if (isFishModel(id)) return true;
  return model.supportedParameters?.includes('instructions') ?? false;
}
