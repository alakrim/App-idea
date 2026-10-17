// Licence policy for sampled ambience (ADR-0005, amendment 2026-10-17). Only CC0, Public Domain
// (PDM 1.0) and CC BY 3.0 or 4.0 pass. NC, ND, SA, GPL, OGA-BY, sampling+ and any licence we cannot
// read from the source page are rejected. Both the curation and the build call this, so the rule
// cannot drift between them.

const REJECTED_TERMS = /(^|[^a-z])(nc|nd|sa|noncommercial|non-commercial|no-derivs|noderivs|sharealike|share-alike|gpl|oga-by|sampling\+?)([^a-z]|$)/i;

const URL_RULES = [
  { kind: 'CC0', pattern: /creativecommons\.org\/publicdomain\/zero\/1\.0(\/|$)/i, label: 'CC0 1.0' },
  { kind: 'Public Domain', pattern: /creativecommons\.org\/publicdomain\/mark\/1\.0(\/|$)/i, label: 'Public Domain Mark 1.0' },
  { kind: 'CC BY', pattern: /creativecommons\.org\/licenses\/by\/(3\.0|4\.0)(\/|$)/i, version: 1 },
];

const NAME_RULES = [
  { kind: 'CC0', pattern: /^cc0(\s+1\.0)?$/i, label: 'CC0 1.0' },
  { kind: 'Public Domain', pattern: /^public domain( mark)?( 1\.0)?$/i, label: 'Public Domain Mark 1.0' },
  { kind: 'CC BY', pattern: /^cc[ -]by[ -](3\.0|4\.0)$/i, version: 1 },
];

function matchRule(rules, text) {
  for (const rule of rules) {
    const match = rule.pattern.exec(text);
    if (!match) continue;
    const label = rule.version ? `CC BY ${match[rule.version]}` : rule.label;
    return { kind: rule.kind, label };
  }
  return null;
}

/**
 * Classifies a source licence from its name and/or URL. When both are present they must agree.
 * Returns { allowed, kind, label, reason }. `label` is the credit-line licence name (e.g. "CC BY 4.0").
 */
export function classifyLicence({ name = null, url = null }) {
  const nameText = (name ?? '').trim();
  const urlText = (url ?? '').trim();
  if (REJECTED_TERMS.test(nameText) || /\/by-(nc|nd|sa)/i.test(urlText)) {
    return reject(`licence is not allowed: ${nameText || urlText}`);
  }
  const fromUrl = urlText ? matchRule(URL_RULES, urlText) : null;
  const fromName = nameText ? matchRule(NAME_RULES, nameText) : null;
  if (!fromUrl && !fromName) {
    return reject(`no allowed licence is visible on the source page (name "${nameText}", url "${urlText}")`);
  }
  if (fromUrl && fromName && (fromUrl.kind !== fromName.kind || fromUrl.label !== fromName.label)) {
    return reject(`licence name "${nameText}" and URL "${urlText}" disagree`);
  }
  const resolved = fromUrl ?? fromName;
  return { allowed: true, kind: resolved.kind, label: resolved.label, reason: null };
}

function reject(reason) {
  return { allowed: false, kind: null, label: null, reason };
}

const CANONICAL_URLS = {
  'CC0 1.0': 'https://creativecommons.org/publicdomain/zero/1.0/',
  'Public Domain Mark 1.0': 'https://creativecommons.org/publicdomain/mark/1.0/',
  'CC BY 3.0': 'https://creativecommons.org/licenses/by/3.0/',
  'CC BY 4.0': 'https://creativecommons.org/licenses/by/4.0/',
};

/** The canonical deed URL for a licence label returned by classifyLicence (used when a page gives none). */
export function canonicalLicenceUrl(label) {
  const url = CANONICAL_URLS[label];
  if (url === undefined) throw new Error(`no canonical URL for licence "${label}"`);
  return url;
}
