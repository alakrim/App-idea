/* global describe, it, expect, beforeEach, afterEach */
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  ICON_NAME,
  ICON_XML,
  LIBRARY_SERVICE,
  PERMISSIONS,
  patchManifest,
  writeNotificationIcon,
} = require('../with-background-processing');

/** A manifest as Expo hands it to the plugin: the xml2js shape, with the template's own entries. */
function templateManifest() {
  return {
    manifest: {
      $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' },
      'uses-permission': [
        { $: { 'android:name': 'android.permission.INTERNET' } },
        { $: { 'android:name': 'android.permission.FOREGROUND_SERVICE' } },
      ],
      application: [
        {
          $: { 'android:label': 'Lectio' },
          activity: [{ $: { 'android:name': '.MainActivity' } }],
        },
      ],
    },
  };
}

function permissionNames(modResults) {
  return modResults.manifest['uses-permission'].map((entry) => entry.$['android:name']);
}

describe('patchManifest', () => {
  it('adds the three permissions and keeps the ones already declared, each once', () => {
    const once = patchManifest(templateManifest());
    const twice = patchManifest(once);

    for (const permission of PERMISSIONS) {
      expect(permissionNames(twice).filter((name) => name === permission)).toHaveLength(1);
    }
    expect(permissionNames(twice)).toContain('android.permission.INTERNET');
  });

  it('declares the dataSync type on the library service, and adds the entry when it is missing', () => {
    const patched = patchManifest(templateManifest());
    const services = patched.manifest.application[0].service;

    expect(services).toEqual([
      { $: { 'android:name': LIBRARY_SERVICE, 'android:foregroundServiceType': 'dataSync' } },
    ]);
  });

  it('updates an existing library service entry instead of adding a second one', () => {
    const modResults = templateManifest();
    modResults.manifest.application[0].service = [
      { $: { 'android:name': LIBRARY_SERVICE, 'android:exported': 'false' } },
    ];

    const patched = patchManifest(modResults);
    const services = patched.manifest.application[0].service;

    expect(services).toHaveLength(1);
    expect(services[0].$).toEqual({
      'android:name': LIBRARY_SERVICE,
      'android:exported': 'false',
      'android:foregroundServiceType': 'dataSync',
    });
  });

  it('declares the tools namespace the merge rules need', () => {
    const patched = patchManifest(templateManifest());

    expect(patched.manifest.$['xmlns:tools']).toBe('http://schemas.android.com/tools');
  });

  it('keeps the other application children untouched', () => {
    const patched = patchManifest(templateManifest());

    expect(patched.manifest.application[0].activity).toEqual([
      { $: { 'android:name': '.MainActivity' } },
    ]);
  });

  it('refuses a manifest without an application element', () => {
    expect(() => patchManifest({ manifest: { $: {} } })).toThrow(/no <application>/u);
  });
});

describe('writeNotificationIcon', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'lectio-plugin-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('writes a monochrome 24 dp vector into the drawable folder, where the library looks', () => {
    writeNotificationIcon(root);

    const file = path.join(root, 'app', 'src', 'main', 'res', 'drawable', `${ICON_NAME}.xml`);
    expect(fs.readFileSync(file, 'utf8')).toBe(ICON_XML);
    expect(ICON_XML).toContain('android:width="24dp"');
    expect(ICON_XML).toContain('android:viewportWidth="24"');
    expect(ICON_XML).toContain('android:fillColor="#FFFFFFFF"');
  });
});
