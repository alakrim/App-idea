// Licence policy tests (brief SND1). Run with `npm run sounds:test`.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { canonicalLicenceUrl, classifyLicence } from './licence.mjs';

describe('classifyLicence', () => {
  it('allows CC0, Public Domain Mark and CC BY 3.0 or 4.0 from the page URL', () => {
    assert.equal(classifyLicence({ url: 'https://creativecommons.org/publicdomain/zero/1.0/' }).label, 'CC0 1.0');
    assert.equal(
      classifyLicence({ url: 'http://creativecommons.org/publicdomain/mark/1.0/' }).label,
      'Public Domain Mark 1.0',
    );
    assert.equal(classifyLicence({ url: 'http://creativecommons.org/licenses/by/3.0/' }).label, 'CC BY 3.0');
    assert.equal(classifyLicence({ name: 'CC BY 4.0' }).label, 'CC BY 4.0');
  });

  it('rejects NC, ND, SA and no-redistribution licences', () => {
    for (const url of [
      'https://creativecommons.org/licenses/by-nc/4.0/',
      'https://creativecommons.org/licenses/by-nd/3.0/',
      'https://creativecommons.org/licenses/by-sa/4.0/',
    ]) {
      assert.equal(classifyLicence({ url }).allowed, false, url);
    }
    assert.equal(classifyLicence({ name: 'Royalty-free, no redistribution' }).allowed, false);
  });

  it('rejects a source whose licence is not visible', () => {
    const result = classifyLicence({ name: null, url: null });
    assert.equal(result.allowed, false);
    assert.match(result.reason, /no allowed licence is visible/);
  });

  it('rejects a name and URL that disagree', () => {
    const result = classifyLicence({
      name: 'CC0 1.0',
      url: 'http://creativecommons.org/licenses/by/3.0/',
    });
    assert.equal(result.allowed, false);
  });

  it('gives a canonical deed URL for each allowed label', () => {
    assert.equal(canonicalLicenceUrl('CC BY 3.0'), 'https://creativecommons.org/licenses/by/3.0/');
    assert.throws(() => canonicalLicenceUrl('CC BY-NC 4.0'));
  });
});
