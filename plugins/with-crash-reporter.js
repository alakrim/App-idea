/* global __dirname */
/**
 * Expo config plugin: on-device crash reporter (brief X2).
 *
 * A release build that closes silently leaves no trace on the phone. This plugin makes every build
 * self-reporting:
 *  - CrashReporter.kt installs an uncaught-exception handler first thing in MainApplication.onCreate.
 *    It writes the report to filesDir/lectio-last-crash.txt, then delegates to the previous handler.
 *  - CrashReportScreen.kt is a plain native screen. MainActivity shows it instead of React while a
 *    report is pending, so the next launch shows the error with Copy, Share and Continue.
 *  - index.js captures fatal JavaScript errors into the same file.
 *
 * android/ is generated, so nothing here is hand-edited there. Every insertion carries a marker and is
 * skipped when already present, so re-running prebuild is idempotent. When an anchor is missing (the
 * Expo template changed), the plugin throws instead of shipping a build without capture.
 */
const fs = require('fs');
const path = require('path');
const { withDangerousMod, withMainActivity, withMainApplication } = require('expo/config-plugins');

const SOURCE_DIR = path.join(__dirname, 'crash-reporter');
const KOTLIN_FILES = ['CrashReporter.kt', 'CrashReportScreen.kt'];
const PACKAGE_PLACEHOLDER = '__PACKAGE__';
const MARKER = 'Lectio crash reporter (brief X2)';

/** Replaces the single occurrence of `anchor`. Throws when the template no longer has exactly one. */
function replaceOnce(contents, anchor, replacement, description) {
  if (contents.split(anchor).length !== 2) {
    throw new Error(
      `with-crash-reporter: expected one anchor in ${description}; the Expo template changed.`,
    );
  }
  return contents.replace(anchor, () => replacement);
}

function applicationSource(contents) {
  if (contents.includes('CrashReporter.install(this)')) return contents;
  return replaceOnce(
    contents,
    '  override fun onCreate() {\n',
    [
      '  override fun onCreate() {',
      `    // ${MARKER}: first, so a crash in anything below is captured.`,
      '    CrashReporter.install(this)',
      '',
    ].join('\n'),
    'MainApplication.onCreate',
  );
}

function activitySource(contents) {
  if (contents.includes('holdReactForCrashReport')) return contents;

  // 1. The flag that keeps React from loading while a report is pending.
  let next = replaceOnce(
    contents,
    'class MainActivity : ReactActivity() {\n',
    [
      'class MainActivity : ReactActivity() {',
      `  // ${MARKER}: true while a report is pending, so the JavaScript app does not start.`,
      '  private var holdReactForCrashReport = false',
      '',
      '',
    ].join('\n'),
    'MainActivity class header',
  );

  // 2. ReactActivity.onCreate calls loadApp on the delegate, and that starts the JavaScript runtime.
  //    The delegate is created here, so its loadApp is gated here.
  next = replaceOnce(
    next,
    '              fabricEnabled\n          ){})',
    [
      '              fabricEnabled',
      '          ){',
      `            // ${MARKER}: skip the app load while a crash report is shown.`,
      '            override fun loadApp(appKey: String?) {',
      '              if (!this@MainActivity.holdReactForCrashReport) super.loadApp(appKey)',
      '            }',
      '          })',
    ].join('\n'),
    'MainActivity delegate',
  );

  // 3. Decide before ReactActivity.onCreate, which loads React. Present once the activity exists.
  return replaceOnce(
    next,
    '    super.onCreate(null)\n',
    [
      `    // ${MARKER}: read the pending report before ReactActivity.onCreate loads React.`,
      '    val pendingCrashReport = CrashReporter.readPendingReport(this)',
      '    holdReactForCrashReport = pendingCrashReport != null',
      '    super.onCreate(null)',
      '    if (pendingCrashReport != null) {',
      '      SplashScreenManager.hide()',
      '      CrashReportScreen.present(this, pendingCrashReport) {',
      '        holdReactForCrashReport = false',
      '        loadApp(mainComponentName)',
      '      }',
      '    }',
      '',
    ].join('\n'),
    'MainActivity.onCreate',
  );
}

function copyKotlinSources(cfg) {
  const target = path.join(
    cfg.modRequest.platformProjectRoot,
    'app',
    'src',
    'main',
    'java',
    ...cfg.android.package.split('.'),
  );
  fs.mkdirSync(target, { recursive: true });
  for (const file of KOTLIN_FILES) {
    const source = fs.readFileSync(path.join(SOURCE_DIR, file), 'utf8');
    fs.writeFileSync(
      path.join(target, file),
      source.split(PACKAGE_PLACEHOLDER).join(cfg.android.package),
    );
  }
}

function assertKotlin(cfg, name) {
  if (cfg.modResults.language !== 'kt')
    throw new Error(`with-crash-reporter: ${name} must be Kotlin.`);
}

module.exports = function withCrashReporter(config) {
  const withSources = withDangerousMod(config, [
    'android',
    async (cfg) => {
      copyKotlinSources(cfg);
      return cfg;
    },
  ]);

  const withApplication = withMainApplication(withSources, (cfg) => {
    assertKotlin(cfg, 'MainApplication');
    cfg.modResults.contents = applicationSource(cfg.modResults.contents);
    return cfg;
  });

  return withMainActivity(withApplication, (cfg) => {
    assertKotlin(cfg, 'MainActivity');
    cfg.modResults.contents = activitySource(cfg.modResults.contents);
    return cfg;
  });
};
