# Brief B8: Local Android APK build (sideloadable, no Expo account)

**Type**: build engineering. Read `CLAUDE.md`, `docs/CONVENTIONS.md`, `docs/decisions/0002-stack-and-audio-engine.md`, `app.config.ts`, `package.json` and `.gitignore` (`android/` and `ios/` are ignored, since we use Continuous Native Generation).

## Goal
A reproducible script that turns this repo into an **installable arm64 release APK, signed with a debug key**, so the user can sideload it on their Android phone for device testing. The JS bundle is embedded (no Metro), and there are no paid services and no Expo account.

## Scope
1. **SDK bootstrap** (`scripts/android/setup-sdk.sh`, idempotent):
   - Install the Android command-line tools into `$HOME/android-sdk` (outside the repo) from `https://dl.google.com/android/repository/` (pick the current `commandlinetools-linux-*_latest.zip`) and accept the licenses non-interactively.
   - Install exactly what the generated Gradle project needs: `platform-tools`, the `platforms;android-XX` and `build-tools;XX` that RN 0.86 / Expo SDK 57 declare (read them from the generated `android/build.gradle` / `gradle.properties` after prebuild, or from `node_modules/expo-modules-autolinking` / `react-native` Gradle defaults), plus the `ndk;<version>` and `cmake;<version>` the template pins (needed for Reanimated, Worklets and react-native-audio-api).
   - Print the disk used. The budget is about 15 GB, and `df` shows about 30 GB free.
   - Java: the machine has OpenJDK 21. If AGP or Gradle reject it, document the fix (prefer `org.gradle.java.home` to a JDK 17 if one is available; do not install system packages without reporting it).
2. **Build** (`scripts/android/build-apk.sh`):
   - `npx expo prebuild --platform android --clean --no-install`, then build the release variant with `-PreactNativeArchitectures=arm64-v8a` in `android/` via `./gradlew assembleRelease`. The Expo template signs release with the debug keystore by default; verify this, and if it doesn't, configure debug signing through a **config plugin or `app.config.ts`**, never by hand-editing `android/`, since it is generated.
   - Gradle memory settings fit 15 GB of RAM / 4 cores (`org.gradle.jvmargs`, `--max-workers=4`), set through the Expo `expo-build-properties` approach **only if it is already installed**. Otherwise pass them on the command line or as env vars, and report.
   - Copy the APK to `dist/apk/lectio-<version>-<gitsha>-arm64.apk` (`dist/` is gitignored) and print its size + SHA-256.
3. **Validate the APK**:
   - `aapt2 dump badging` (package `app.lectio`, versionName, minSdk/targetSdk, permissions list).
   - Confirm `assets/index.android.bundle` exists inside (`unzip -l`).
   - Confirm the native libs for audio-api / reanimated / sqlite are present for arm64-v8a.
   - **Review the permissions**: we should need INTERNET, FOREGROUND_SERVICE(+_MEDIA_PLAYBACK) and WAKE_LOCK at most, possibly POST_NOTIFICATIONS. Flag RECORD_AUDIO or anything surprising, because expo-audio's `microphonePermission: false` should prevent it.
4. **Docs**: `docs/BUILD-ANDROID.md` covering the prerequisites, the two commands, the expected durations, troubleshooting found during the run, and how the user installs it (enable "Install unknown apps", transfer the APK, open it). Also how to upgrade (same signing key, so an update installs over the previous build), and that data lives on the device.
5. If the build fails because of our code or config (not the environment), fix the root cause minimally in `app.config.ts` or the relevant config and report it precisely. Do not touch feature code; report it to the architect instead.

## Constraints
- Do not run `npm install` (use `--no-install` for prebuild). If a missing dev dependency blocks the build (e.g. `expo-build-properties`), stop and report.
- Do not commit. Do not put the SDK, `android/` or the APK in the repo.
- Long commands: run Gradle with a generous timeout (up to 10 min per call) and in the background if needed. Report the total wall time.

## Acceptance
An APK at `dist/apk/…apk` with the size, SHA-256, `aapt2` badging output, the permission list and the bundle-present proof. Both scripts are re-runnable (a second `build-apk.sh` reuses the SDK). `npm run verify` is still green.
