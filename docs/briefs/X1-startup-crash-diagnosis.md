# Brief X1: Find the release startup crash (headless boot of the Android JS bundle)

**Type**: investigation + fix. **Priority: P0.** The user installed the release APK (`dist/apk/lectio-0.1.0-2f87cb9-arm64.apk`) on an Android phone. Tapping the icon "does nothing, no error": it closes or never shows UI. We have **no device and no emulator** (no KVM), so you must reproduce it headlessly.

## Already ruled out by the architect
- The APK on GitHub is byte-identical to the build.
- The Hermes bytecode version (98) matches the bundled runtime (`hermes-android` 250829098.0.17 = `hermes-compiler` 250829098.0.17).
- Reanimated 4.5.1 + Worklets 0.10.1 is a supported pair.
- Release builds have no red box. A fatal JS error during startup kills the app silently, and so does a native exception.

## What to do
1. **Headless boot harness** (`scripts/smoke/boot-bundle.mjs`; keep it in the repo, it's valuable for CI):
   - Export the release JS bundle **without bytecode**, with the production defines: `npx expo export --platform android --no-bytecode --source-maps --output-dir <tmp>`.
   - Evaluate it in a Node `vm` context that emulates the **React Native + Hermes** global environment, NOT Node:
     - no `Buffer`, `require`, `module` or `process` beyond what RN polyfills (`process.env.NODE_ENV`), no `fs`
     - keep the ECMAScript built-ins plus what Hermes provides (`atob`/`btoa` exist in modern Hermes; verify for RN 0.86 by reading `node_modules/react-native` sources, and if unsure, run both with and without and report the difference)
   - Provide stub native infrastructure for the New Architecture: `nativeModuleProxy`, `__turboModuleProxy` (a Proxy returning a stub module whose methods are no-ops, with `getConstants()` returning sensible objects for `PlatformConstants`, `DeviceInfo`, `SourceCode` and so on), `nativeFabricUIManager` (Proxy of no-op functions that return opaque objects), `RN$Bridgeless = true`, `__fbBatchedBridgeConfig` if needed, plus timers.
   - Then run the startup path the device runs: the bundle's entry module, then `AppRegistry.runApplication('main', { rootTag: 1, initialProps: {} })` (check the registered app key). Flush timers and microtasks for a few seconds of virtual time.
   - **Report the first uncaught error with its original source location** (use the source map). Iterate: when an error comes from a stub that is too thin (your harness's fault), improve the stub. When it comes from **our code or a library behaving differently on Hermes/RN than under Jest/Node** (the real bug), stop and report it.
   - Expo-router in production loads **every route file synchronously** at startup, so module-init errors anywhere under `app/` (and in their imports, such as `src/bootstrap.ts` → defuddle/linkedom/htmlparser2/entities/temml/@xmldom) surface here.
2. **Static review of native startup** (in parallel with step 1): **do NOT run prebuild or Gradle** (worker X2 owns android/ regeneration). Read the existing generated `android/` folder (from the last build) and read the merged `AndroidManifest.xml`, `MainApplication.kt`, `MainActivity.kt` and the config-plugin outputs for expo-audio (background playback service), react-native-audio-api, expo-sqlite, expo-secure-store and the blockedPermissions. Look for anything that throws at app start on targetSdk 36 (e.g. a service declared without `foregroundServiceType`, or a missing class referenced in the manifest). Check whether any startup code requests a now-blocked permission.
3. **Fix the root cause(s)** minimally, with a regression test where possible. The boot harness should pass after the fix.

## Constraints
- Do not run `npm install`. Do not commit. No paid API calls.
- Another worker (X2) is concurrently adding a crash-reporter config plugin (`plugins/with-crash-reporter.js`, `src/app-shell/crash-*`, `index.js` entry). Do not touch those files. If your fix needs `app/_layout.tsx` or `src/bootstrap.ts`, edit them minimally and report.

## Acceptance
- The boot harness runs `runApplication` to a rendered first screen (or the furthest point the stubs allow) with **no uncaught error**. Paste the before (the error found) and the after output.
- `npm run verify` is green.
- The report states the root cause in one sentence, with its evidence.
