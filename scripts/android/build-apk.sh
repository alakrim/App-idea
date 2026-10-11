#!/usr/bin/env bash
# Builds a sideloadable arm64 release APK, signed with the debug key (brief B8).
#
#   scripts/android/build-apk.sh
#
# Steps: SDK bootstrap (setup-sdk.sh, idempotent) -> expo prebuild (android/ is generated,
# never hand-edited) -> ./gradlew-equivalent assembleRelease for arm64-v8a -> copy to
# dist/apk/lectio-<version>-<gitsha>-arm64.apk -> aapt2/unzip/apksigner validation.
#
# Environment overrides: ANDROID_HOME (default $HOME/android-sdk), GRADLE_BIN (default: gradle
# on PATH; must be Gradle 8.13+ for AGP 8.12), GRADLE_JVM_ARGS, GRADLE_KOTLIN_JVM_ARGS.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

export ANDROID_HOME="${ANDROID_HOME:-$HOME/android-sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
VERSIONS_TOML="$ROOT/node_modules/react-native/gradle/libs.versions.toml"
GRADLE_BIN="${GRADLE_BIN:-$(command -v gradle || true)}"
# 15 GB RAM / 4 cores: 4 GB for the Gradle daemon, 3 GB for the Kotlin daemon, 2 workers
# (4 workers triggered Maven Central's 429 rate limit during dependency resolution).
GRADLE_JVM_ARGS="${GRADLE_JVM_ARGS:--Xmx4g -XX:MaxMetaspaceSize=1g -XX:+HeapDumpOnOutOfMemoryError}"
GRADLE_KOTLIN_JVM_ARGS="${GRADLE_KOTLIN_JVM_ARGS:--Xmx3g}"
ABI="arm64-v8a"

log() { printf '[build-apk] %s\n' "$*"; }
die() { printf '[build-apk] ERROR: %s\n' "$*" >&2; exit 1; }
toml_value() { sed -n "s/^$1 = \"\(.*\)\"/\1/p" "$VERSIONS_TOML" | head -n 1; }

START_TS="$(date +%s)"
mkdir -p "$ROOT/dist/apk" "$ROOT/dist/android-build"
LOG="$ROOT/dist/android-build/build-$(date +%Y%m%d-%H%M%S).log"
log "full log: $LOG"

# 1. SDK (idempotent; a warm run takes about 10 s).
bash "$ROOT/scripts/android/setup-sdk.sh"
BUILD_TOOLS="$(toml_value buildTools)"
BT="$ANDROID_HOME/build-tools/$BUILD_TOOLS"

# 2. Gradle. Expo's gradle.properties pins org.gradle.jvmargs=-Xmx2048m; the -D below is
#    passed on the command line so it applies without editing the generated android/.
[ -n "$GRADLE_BIN" ] && [ -x "$GRADLE_BIN" ] || die "gradle not found; set GRADLE_BIN"
GRADLE_VERSION="$("$GRADLE_BIN" --version --console=plain 2>/dev/null | sed -n 's/^Gradle //p')"
log "gradle $GRADLE_VERSION at $GRADLE_BIN (the wrapper pin in android/gradle/wrapper is not used)"

# 3. Prebuild. It rewrites the android/ and ios/ script lines in package.json, so restore it.
PKG_BACKUP="$(mktemp)"
cp package.json "$PKG_BACKUP"
npx --no-install expo prebuild --platform android --clean --no-install
if ! cmp -s package.json "$PKG_BACKUP"; then
  cp "$PKG_BACKUP" package.json
  log "restored package.json (prebuild rewrote its android/ios scripts)"
fi
rm -f "$PKG_BACKUP"

# 4. Release build for arm64 only. Maven Central and plugins.gradle.org sometimes answer
#    "429 Too Many Requests" to this network. Gradle caches every artifact it has already
#    fetched, so a retry after a back-off makes progress. Only 429 failures are retried.
log "assembleRelease for $ABI"
MAX_ATTEMPTS="${GRADLE_MAX_ATTEMPTS:-6}"
for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  set +e
  (
    cd android
    "$GRADLE_BIN" assembleRelease \
      --console=plain \
      --max-workers=2 \
      -Dorg.gradle.jvmargs="$GRADLE_JVM_ARGS" \
      -Pkotlin.daemon.jvmargs="$GRADLE_KOTLIN_JVM_ARGS" \
      -PreactNativeArchitectures="$ABI"
  ) 2>&1 | tee "$LOG"
  GRADLE_STATUS="${PIPESTATUS[0]}"
  set -e
  [ "$GRADLE_STATUS" -eq 0 ] && break
  if grep -q "status code 429" "$LOG" && [ "$attempt" -lt "$MAX_ATTEMPTS" ]; then
    WAIT=$(( 60 * attempt ))
    log "attempt $attempt hit HTTP 429 from a Maven repository; stopping the daemon and retrying in ${WAIT}s"
    "$GRADLE_BIN" --stop >/dev/null 2>&1 || true
    sleep "$WAIT"
    continue
  fi
  die "gradle failed with exit $GRADLE_STATUS after $attempt attempt(s) (see $LOG)"
done

SRC_APK="$ROOT/android/app/build/outputs/apk/release/app-release.apk"
[ -f "$SRC_APK" ] || die "expected APK not found: $SRC_APK"

# 5. Name, copy and hash the artifact.
VERSION="$(sed -n 's/.*versionName "\(.*\)".*/\1/p' android/app/build.gradle | head -n 1)"
GITSHA="$(git rev-parse --short HEAD)"
DEST="$ROOT/dist/apk/lectio-${VERSION}-${GITSHA}-${ABI%%-*}.apk"
cp "$SRC_APK" "$DEST"
DIRTY=""
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  DIRTY=" (working tree has uncommitted changes to tracked files)"
fi
(cd "$ROOT/dist/apk" && sha256sum "$(basename "$DEST")" > "$(basename "$DEST").sha256")
log "APK: $DEST$DIRTY"
log "size: $(stat -c %s "$DEST") bytes ($(du -h "$DEST" | cut -f1))"
log "sha256: $(cut -d' ' -f1 "$DEST.sha256")"

# 6. Validation.
AAPT2="$BT/aapt2"
APKSIGNER="$BT/apksigner"
log "--- aapt2 dump badging ---"
"$AAPT2" dump badging "$DEST" | grep -E "^(package|minSdkVersion|targetSdkVersion|application-label:|launchable-activity|native-code|supports-screens|densities)" || true
log "--- uses-permission (declared in the merged manifest) ---"
"$AAPT2" dump badging "$DEST" | grep -E "^uses-permission|^uses-implied-permission" | sort || true
log "--- uses-feature ---"
"$AAPT2" dump badging "$DEST" | grep -E "^uses-feature" | sort || true
log "--- bundle presence ---"
unzip -l "$DEST" | grep -E "assets/index\.android\.bundle$" || die "assets/index.android.bundle missing from the APK"
BUNDLE_TMP="$(mktemp)"
unzip -p "$DEST" assets/index.android.bundle > "$BUNDLE_TMP"
MAGIC="$(od -An -tx1 -N4 "$BUNDLE_TMP" | tr -d ' \n')"
rm -f "$BUNDLE_TMP"
log "bundle magic bytes: $MAGIC (c61fbc03 = Hermes bytecode, little-endian)"
log "--- native libraries by ABI ---"
unzip -Z1 "$DEST" | awk -F/ '/^lib\//{print $2}' | sort | uniq -c
log "arm64-v8a .so count: $(unzip -Z1 "$DEST" | grep -c '^lib/arm64-v8a/.*\.so$' || true)"
for keyword in reanimated worklets audioapi sqlite hermes expo; do
  matches="$(unzip -Z1 "$DEST" | grep "^lib/$ABI/" | grep -i "$keyword" | tr '\n' ' ' || true)"
  log "  $keyword: ${matches:-<none>}"
done
log "--- signature ---"
"$APKSIGNER" verify --print-certs "$DEST" | grep -E "Verifies|Signer #1 certificate (DN|SHA-256)" || die "apksigner verification failed"

ELAPSED=$(( $(date +%s) - START_TS ))
log "total wall time: $((ELAPSED / 60)) min $((ELAPSED % 60)) s"
