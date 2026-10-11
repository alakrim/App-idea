/** Sample text the fake pipeline "extracts" from URLs and PDFs. Plain English, three paragraphs. */
export const FAKE_ARTICLE_TEXT = [
  'The lamps along the harbour were lit one by one as the fog rolled in from the sea. Mara counted them from the window of the chandler\'s loft, the way her father had taught her to count the boats.',
  'Nobody in Tessport spoke of the lighthouse after dark. The keepers had gone quiet years ago, and the tide tables said the channel was clear. Still, a single lamp burned at the end of the breakwater, steady and unexplained.',
  'She took the old key from its hook by the door. It was warm, as if someone had only just put it down. Outside, the bell buoy began to toll, slow and patient, and Mara stepped into the grey.',
].join('\n\n');

/** Marks fake translations, so nobody mistakes them for real output in a demo. */
export function fakeTranslation(sentence: string, targetLang: string): string {
  return `[${targetLang}] ${sentence}`;
}
