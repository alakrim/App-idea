/**
 * App entry point. Crash capture is installed before expo-router loads the app, so an error thrown
 * while the bundle starts still reaches the crash report (brief X2). Keep this file small.
 */
// Web Crypto first: Hermes has none, and libraries (ulid) need it at module load (brief X1).
require('./src/app-shell/web-crypto-polyfill');

const { installJsCrashCapture } = require('./src/app-shell/crash-capture');
const { writeLastCrashReport } = require('./src/app-shell/crash-store');

installJsCrashCapture({ errorUtils: globalThis.ErrorUtils, writeReport: writeLastCrashReport });

require('expo-router/entry');
