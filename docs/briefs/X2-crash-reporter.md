# Brief X2: On-device crash reporter (no silent closes ever again)

**Type**: implementation (native config plugin + JS). **Priority: P0.** A release APK closes silently on the user's phone and we have no device logs. Make every future build **self-reporting**: any crash at startup or later is captured, and the **next launch shows the error on screen** with a Copy button. The user can then paste it to us.

## Scope
1. **Native capture** via an Expo config plugin `plugins/with-crash-reporter.js`, using `withDangerousMod`/`withMainApplication`/`withMainActivity` from `expo/config-plugins`. android/ is generated, so never hand-edit it.
   - Add a Kotlin file `CrashReporter.kt` in the app package (`app.lectio`). In `MainApplication.onCreate`, **first thing**, install `Thread.setDefaultUncaughtExceptionHandler`:
     - write `{timestamp, thread, exception class, message, full stack trace incl. causes, app version, Android version, device model}` to `filesDir/lectio-last-crash.txt`
     - then delegate to the previous default handler
   - React Native release builds turn fatal JS errors into a Java `JavascriptException` on the native side, so this one handler captures both JS fatals and Java/Kotlin crashes. Verify that claim in the RN 0.86 sources (`ExceptionsManager`, `DefaultReactHostDelegate`/`ReactHostImpl` error handling) and cite it in a comment. If bridgeless mode routes JS fatals elsewhere, hook that path too, e.g. a `ReactHost` exception handler or `JSExceptionHandler`.
   - In `MainActivity.onCreate`, **before React loads**: if `lectio-last-crash.txt` exists, show a **pure native screen**. Use a plain Android `AlertDialog`, or a simple Activity layout built in code, no XML needed. Style it dark: background `#0D0E12`, text `#ECE8E1`, accent `#E8A84A`.
     - Title "Lectio closed unexpectedly", and the first ~40 lines of the report in a scrollable monospace view.
     - Buttons:
       - **Copy report**: to the clipboard, with a toast "Copied".
       - **Share**: an `ACTION_SEND` text intent.
       - **Continue**: deletes the file and loads the app normally.
     - Never block the app permanently: if the dialog itself fails, log it, delete the file and continue.
   - Generate the Kotlin with **correct imports and syntax for Kotlin 2.x / AGP 8**. Read the generated `MainApplication.kt`/`MainActivity.kt` (after `npx expo prebuild --platform android --no-install`) to anchor your insertions precisely, and make the mods idempotent.
2. **JS early capture** (belt and braces):
   - Add `index.js` as the app entry (`package.json` `main` → `./index.js`). It installs `ErrorUtils.setGlobalHandler` **before** `require('expo-router/entry')`.
   - For fatal errors the handler writes the JS stack (with the error message and component stack if present) to the same `lectio-last-crash.txt` via `expo-file-system` (the synchronous new API `File`), then calls the previous handler.
   - Make sure `expo-router` still finds the app root: `expo-router/entry` reads the `app/` dir via its babel plugin, and a custom entry that requires `expo-router/entry` is the documented pattern. Verify with `npm run bundle:check`.
3. **Diagnostics link**: the in-app Diagnostics screen gets a "Last crash" section showing the most recent report if one was kept (keep a rotated copy `lectio-last-crash.prev.txt` when Continue is pressed).
4. **Verification without a device**:
   - Run `npx expo prebuild --platform android --clean --no-install`, then compile Kotlin with the Gradle task `:app:compileReleaseKotlin`, using the same environment as `scripts/android/build-apk.sh` (read it: `GRADLE_BIN`, `ANDROID_HOME`, the mirror init script). It must compile.
   - Add Jest tests for the JS handler (writes the file on fatal, ignores non-fatal, never throws itself).
   - Show the generated Kotlin in your report.

## Constraints
- Do not run `npm install`; expo-file-system and expo-clipboard are installed. Do not commit.
- Another worker (X1) is concurrently debugging the startup crash and may edit `app/_layout.tsx` or `src/bootstrap.ts`. Don't touch those. You own `plugins/with-crash-reporter.js`, `index.js`, the `package.json` `main` field, `app.config.ts` (the plugin registration line only) and the `src/app-shell/crash-*` and diagnostics "Last crash" files.
- Use **only** the Gradle compile task for verification. Do **not** run a full `assembleRelease`; the architect does the final build.

## Acceptance
`npm run verify` is green, and `:app:compileReleaseKotlin` succeeds (paste both tails). The report includes the generated `CrashReporter.kt`, the `MainActivity.kt` diff and the `index.js`.
