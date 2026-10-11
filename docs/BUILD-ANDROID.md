# Local Android APK build (sideload, no Expo account)

This builds an installable **arm64 release APK** on this machine. The JS bundle is embedded (no Metro at runtime). The APK is **signed with the Android debug key**, so it is for device testing only and not for the Play Store. No paid service and no Expo account are needed.

## Prerequisites

- Dependencies installed with `npm install` (done once, by a human or the architect). The build scripts never run `npm install`.
- JDK 17 or newer. The build was verified with OpenJDK 21 (AGP 8.12 runs on 21, so no JDK 17 is needed).
- Gradle 8.13 or newer on `PATH`, or set `GRADLE_BIN`. The verified version is Gradle 8.14.3 at `/opt/gradle/bin/gradle`. The Gradle wrapper pins 9.3.1, which is not used (see troubleshooting).
- `curl`, `unzip`, `python3` (stdlib only), `sha1sum`, `sha256sum`.
- Disk: the SDK takes about 2.7 GB (including its download cache). Gradle caches take several more GB. About 15 GB free is a safe budget.
- Network access to `dl.google.com`, `maven-central.storage-download.googleapis.com` and `plugins.gradle.org`.

## Commands

```bash
bash scripts/android/setup-sdk.sh   # SDK bootstrap, idempotent (about 30 s, then about 10 s warm)
bash scripts/android/build-apk.sh   # prebuild --clean, assembleRelease arm64-v8a, copy, validate
```

`build-apk.sh` runs `setup-sdk.sh` itself, so the second command alone is enough once the SDK exists.

Output:

- `dist/apk/lectio-<version>-<gitsha>-arm64.apk`, plus a `.sha256` sidecar file.
- `dist/android-build/build-<timestamp>.log`, the full Gradle log of the last attempt.

The script prints the size, the SHA-256, `aapt2 dump badging`, the permissions, the bundle proof (Hermes magic bytes), the native libraries per ABI, and the `apksigner` result.

## Timings (measured on this machine)

| Step | Duration |
| --- | --- |
| SDK bootstrap, cold | about 30 s |
| Full build, cold Gradle caches | 12 min 35 s |
| Full build, warm caches (2 runs) | 6 min 54 s and 7 min 2 s |

## Installing on the phone

1. Transfer `dist/apk/lectio-…-arm64.apk` to the phone (USB, or a cloud link).
2. On the phone, allow the app that opens the file to "Install unknown apps" (Settings, then Apps, then Special app access).
3. Open the APK and install.

## Upgrading

Every build is signed with the same debug key from the RN/Expo template, so a new APK installs **over** the previous build and keeps the data. If the install reports a signature conflict, the phone has a build signed by a different key. Uninstall once (this deletes local data), then install again.

The debug key is public (it is the standard Android debug key), so anyone can sign with it. Keep these builds to devices you control.

## Where the data lives

The library, chapters, audio files and settings live in the app's private storage on the device. Updates keep them. Uninstalling the app deletes them.

## Permissions

Verified in the release APK built from commit `2f87cb9`:

- `INTERNET`, `ACCESS_NETWORK_STATE`
- `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK` (background audio)
- `WAKE_LOCK`, `VIBRATE`, `MODIFY_AUDIO_SETTINGS`
- `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE` with `maxSdkVersion=32` (legacy, from the image and file libraries)
- `app.lectio.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` (the Android dynamic receiver guard, a standard entry)

The app never requests `RECORD_AUDIO`, `CAMERA`, `SYSTEM_ALERT_WINDOW`, `USE_BIOMETRIC` or `USE_FINGERPRINT`. They are blocked in `app.config.ts` (`android.blockedPermissions`), and the `expo-image-picker`, `expo-secure-store` and `expo-audio` plugins are set not to request them. Check with `aapt2 dump badging <apk> | grep uses-permission`.

## Troubleshooting

**HTTP 429 "Too Many Requests" from repo.maven.apache.org or plugins.gradle.org.** This happened on this network during Gradle's parallel dependency download. The fix is in place and is reproducible:

- `setup-sdk.sh` writes `~/.gradle/init.d/lectio-maven-mirror.gradle`. It sends every Maven Central repository to Google's official mirror, `https://maven-central.storage-download.googleapis.com/maven2/`, and puts that mirror first in every repository list. It also keeps `gradlePluginPortal()` and `google()` as fallbacks. Gradle falls back on a 404, so portal-only artifacts still resolve.
- Each change is logged as a `[lectio-maven-mirror]` line in the build log. Check that the lines are present if a 429 comes back.
- `setup-sdk.sh` also writes `~/.gradle/gradle.properties` with `systemProp.org.gradle.internal.repository.max.retries=8`, `…initial.backoff=1500` and `org.gradle.workers.max=2`.
- `build-apk.sh` retries 429 failures up to 6 times with a growing back-off, and stops the Gradle daemon between attempts.

Both files are rewritten on each run, so edit `setup-sdk.sh` rather than them.

**Gradle wrapper version.** `android/gradle/wrapper` pins Gradle 9.3.1. The build was verified with the local Gradle 8.14.3 (AGP 8.12 needs 8.13 or newer), selected through `GRADLE_BIN` (default: `gradle` on `PATH`). The wrapper was not tried. The wrapper file is generated, so it is not edited.

**Prebuild rewrites `package.json`.** `expo prebuild` changes the `android` and `ios` script lines of `package.json`. `build-apk.sh` restores the original file after prebuild. Do not commit those lines.

**Memory.** `expo-build-properties` is not installed, so the Gradle memory settings are passed on the command line: `-Dorg.gradle.jvmargs` (4 GB daemon) and `-Pkotlin.daemon.jvmargs` (3 GB), with `--max-workers=2`. Override them with `GRADLE_JVM_ARGS`, `GRADLE_KOTLIN_JVM_ARGS` or `GRADLE_BIN`.

**`sdkmanager` is now a wrapper.** The current command-line tools forward to the new Android CLI. It accepts the SDK licence on the first install, so `--licenses` is no longer needed. The first run prints a Terms and usage-metrics notice. `setup-sdk.sh` checks that the licence file exists after installing.

**`.gitignore` anchoring.** `android/` and `ios/` are anchored to the repo root (`/android/`, `/ios/`). The earlier unanchored `android/` also matched `scripts/android/`.

**CMake.** No module in this project pins a CMake version, so the Android Gradle Plugin default `3.22.1` is installed. If a future native module pins another version, `CMAKE_VERSION=… bash scripts/android/setup-sdk.sh` installs it.

## Known warnings in the logs

- `uses-permission … was tagged … to remove other declarations but no other declaration present` is informational. It comes from `android.blockedPermissions`: the libraries do not declare those permissions, so there is nothing to remove.
- Gradle prints "Deprecated Gradle features were used" for the React Native and Expo plugins. These are upstream, not our code.
