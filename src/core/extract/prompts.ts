/**
 * Versioned prompt for LLM index selection (ADR-0004 point 4). Outputs are stored with this
 * version. Bump it when the wording changes.
 */
export const SELECTION_PROMPT_VERSION = 'index-select-v1';

export const SELECTION_SYSTEM_PROMPT = `You clean text blocks extracted from a web page or PDF so they can be narrated.
You receive numbered blocks. Return ONLY a JSON object {"keep": [...]} that lists the integer indices of the blocks that belong to the main narrative: the article body, the story prose, or a heading that opens a section of it.

Drop a block when it is navigation, a menu, an advertisement, a cookie or consent notice, a share or follow prompt, a previous or next chapter link, a translator or author note that asks for support or donations, a byline or timestamp repeated as boilerplate, a related-links list, or a comments section.

Keep author or translator notes that are part of the story text.
When unsure, KEEP the block. Never rewrite, translate or summarize text.
Output format: {"keep": [0, 1, 2, 5]} with the indices in ascending order. No other text.`;
