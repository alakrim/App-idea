#!/usr/bin/env bash
# Idempotent Android SDK bootstrap for the local Lectio release build (brief B8).
#
# Installs outside the repo, into $ANDROID_HOME (default: $HOME/android-sdk).
# Versions come from the React Native version catalog that the generated Gradle
# project reads (node_modules/react-native/gradle/libs.versions.toml), so they
# follow the SDK upgrade without editing this script. Re-running is safe:
# sdkmanager skips packages that are already installed.
#
# Requires: JDK 17+, curl, unzip, python3 (stdlib only, to read the SDK index), sha1sum.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SDK_ROOT="${ANDROID_HOME:-$HOME/android-sdk}"
CACHE="$SDK_ROOT/.cache"
REPO_BASE="https://dl.google.com/android/repository"
VERSIONS_TOML="$ROOT/node_modules/react-native/gradle/libs.versions.toml"
# No module in this project pins a CMake version, so AGP's default (3.22.1) applies.
CMAKE_VERSION="${CMAKE_VERSION:-3.22.1}"

log() { printf '[setup-sdk] %s\n' "$*"; }
die() { printf '[setup-sdk] ERROR: %s\n' "$*" >&2; exit 1; }

command -v java >/dev/null || die "no java on PATH (OpenJDK 17 or 21 required)"
java_major="$(java -version 2>&1 | sed -n 's/.*version "\([0-9]*\).*/\1/p' | head -n 1)"
[ "${java_major:-0}" -ge 17 ] || die "JDK 17+ required, found major version '${java_major:-none}'"
log "JDK major version $java_major"

[ -f "$VERSIONS_TOML" ] || die "missing $VERSIONS_TOML (run npm install first, or check the checkout)"
toml_value() { sed -n "s/^$1 = \"\(.*\)\"/\1/p" "$VERSIONS_TOML" | head -n 1; }
COMPILE_SDK="$(toml_value compileSdk)"
BUILD_TOOLS="$(toml_value buildTools)"
NDK_VERSION="$(toml_value ndkVersion)"
[ -n "$COMPILE_SDK" ] && [ -n "$BUILD_TOOLS" ] && [ -n "$NDK_VERSION" ] || die "could not read SDK versions from $VERSIONS_TOML"
log "SDK targets: platform android-$COMPILE_SDK, build-tools $BUILD_TOOLS, ndk $NDK_VERSION, cmake $CMAKE_VERSION"

mkdir -p "$CACHE"
SDKMANAGER="$SDK_ROOT/cmdline-tools/latest/bin/sdkmanager"

if [ ! -x "$SDKMANAGER" ]; then
  log "fetching the SDK repository index from $REPO_BASE"
  curl -fsSL --retry 3 -o "$CACHE/repository2-3.xml" "$REPO_BASE/repository2-3.xml"
  # The index names the current linux command-line tools zip and its SHA-1.
  read -r ZIP_NAME ZIP_SHA1 < <(python3 - "$CACHE/repository2-3.xml" <<'PY'
import sys
import xml.etree.ElementTree as ET

root = ET.parse(sys.argv[1]).getroot()
for pkg in root.iter('remotePackage'):
    if pkg.get('path') == 'cmdline-tools;latest':
        for archive in pkg.iter('archive'):
            if archive.findtext('host-os') == 'linux':
                complete = archive.find('complete')
                print(complete.findtext('url'), complete.findtext('checksum'))
                sys.exit(0)
sys.exit('no linux cmdline-tools archive in the SDK index')
PY
  )
  [ -n "${ZIP_NAME:-}" ] || die "could not resolve the command-line tools archive"
  log "command-line tools archive: $ZIP_NAME"
  if [ ! -f "$CACHE/$ZIP_NAME" ]; then
    curl -fsSL --retry 3 -o "$CACHE/$ZIP_NAME.part" "$REPO_BASE/$ZIP_NAME"
    mv "$CACHE/$ZIP_NAME.part" "$CACHE/$ZIP_NAME"
  fi
  echo "$ZIP_SHA1  $CACHE/$ZIP_NAME" | sha1sum -c --quiet - || die "checksum mismatch for $ZIP_NAME (delete it and retry)"

  rm -rf "$CACHE/unpack"
  unzip -q "$CACHE/$ZIP_NAME" -d "$CACHE/unpack"
  mkdir -p "$SDK_ROOT/cmdline-tools"
  rm -rf "$SDK_ROOT/cmdline-tools/latest"
  mv "$CACHE/unpack/cmdline-tools" "$SDK_ROOT/cmdline-tools/latest"
  rm -rf "$CACHE/unpack"
fi

# The current cmdline-tools (16.x) forward to the Android CLI, which accepts the SDK
# license on first install; `sdkmanager --licenses` is now a no-op. Piping `yes` into
# it is therefore not needed. The check below confirms acceptance afterwards.
log "installing packages (already-installed ones are skipped)"
"$SDKMANAGER" --sdk_root="$SDK_ROOT" --install \
  "platform-tools" \
  "platforms;android-$COMPILE_SDK" \
  "build-tools;$BUILD_TOOLS" \
  "ndk;$NDK_VERSION" \
  "cmake;$CMAKE_VERSION"

[ -f "$SDK_ROOT/licenses/android-sdk-license" ] || die "SDK license not accepted (no $SDK_ROOT/licenses/android-sdk-license)"

# Gradle user-level setup (outside the repo). Maven Central answers "429 Too Many Requests"
# to Gradle's parallel dependency bursts from this network. Google's official mirror of
# Maven Central (maven-central.storage-download.googleapis.com) serves the same artifacts.
# The init script redirects only the Maven Central repositories; google() and the Gradle
# Plugin Portal are untouched. Both files are rewritten on every run, so keep edits here.
GRADLE_USER="${GRADLE_USER_HOME:-$HOME/.gradle}"
mkdir -p "$GRADLE_USER/init.d"
cat > "$GRADLE_USER/init.d/lectio-maven-mirror.gradle" <<'GROOVY'
// Written by scripts/android/setup-sdk.sh (Lectio, brief B8). Do not edit by hand.
// Maven Central answers 429 to Gradle's parallel bursts from this network. Two paths reach it:
//  1. Direct Central repositories (mavenCentral()), which are redirected to the mirror.
//  2. gradlePluginPortal(), whose /m2/ artifacts redirect to Central. Its URL is untouched,
//     so the mirror is inserted FIRST in every repository list; Gradle falls back to the
//     next repository on a 404, so portal-only artifacts still resolve.
// Each change is logged with the project path so the build log proves what was redirected.
def centralMirror = 'https://maven-central.storage-download.googleapis.com/maven2/'
def centralHosts = ['repo.maven.apache.org', 'repo1.maven.org'] as Set
def mirrorName = 'lectioGoogleMavenCentral'

def redirectCentral = { ArtifactRepositoryContainer repos, String where ->
    repos.withType(MavenArtifactRepository).configureEach { MavenArtifactRepository repo ->
        if (repo.name != mirrorName && repo.url != null && centralHosts.contains(repo.url.host)) {
            def previous = repo.url.toString()
            repo.setUrl(centralMirror)
            logger.lifecycle("[lectio-maven-mirror] ${where}: ${repo.name} ${previous} -> ${centralMirror}")
        }
    }
}

def addMirrorFirst = { ArtifactRepositoryContainer repos, String where ->
    if (repos.findByName(mirrorName) == null) {
        def mirror = repos.maven { MavenArtifactRepository repo ->
            repo.name = mirrorName
            repo.url = centralMirror
        }
        repos.remove(mirror)
        repos.addFirst(mirror)
        logger.lifecycle("[lectio-maven-mirror] ${where}: added ${mirrorName} first -> ${centralMirror}")
    }
}

def prepare = { ArtifactRepositoryContainer repos, String where ->
    redirectCentral(repos, where)
    addMirrorFirst(repos, where)
}

beforeSettings { settings ->
    def pluginRepos = settings.pluginManagement.repositories
    prepare(pluginRepos, 'settings:pluginManagement')
    // Gradle falls back to the Plugin Portal only when no plugin repository is declared, and
    // adding the mirror would remove that fallback. Re-add it explicitly, after the mirror.
    pluginRepos.gradlePluginPortal()
    logger.lifecycle("[lectio-maven-mirror] settings:pluginManagement: gradlePluginPortal() kept after the mirror")
}

settingsEvaluated { settings ->
    // Only touch settings-level repositories when the project already declares some.
    def drm = settings.dependencyResolutionManagement?.repositories
    if (drm != null && !drm.isEmpty()) {
        prepare(drm, 'settings:dependencyResolutionManagement')
    }
}

gradle.allprojects { Project project ->
    prepare(project.buildscript.repositories, "${project.path}:buildscript")
    prepare(project.repositories, "${project.path}:repositories")
}
GROOVY

GRADLE_PROPS="$GRADLE_USER/gradle.properties"
touch "$GRADLE_PROPS"
# Drop previously managed keys, then append the current values (idempotent).
sed -i -E '/^(systemProp\.org\.gradle\.internal\.repository\.(max\.retries|initial\.backoff)|org\.gradle\.workers\.max)=/d' "$GRADLE_PROPS"
cat >> "$GRADLE_PROPS" <<'PROPS'
# Lectio (brief B8): retry transient repository errors with back-off; limit parallel resolution.
systemProp.org.gradle.internal.repository.max.retries=8
systemProp.org.gradle.internal.repository.initial.backoff=1500
org.gradle.workers.max=2
PROPS
log "Gradle user config: $GRADLE_USER/init.d/lectio-maven-mirror.gradle and $GRADLE_PROPS"

for path in \
  "$SDK_ROOT/platform-tools/adb" \
  "$SDK_ROOT/platforms/android-$COMPILE_SDK/android.jar" \
  "$SDK_ROOT/build-tools/$BUILD_TOOLS/aapt2" \
  "$SDK_ROOT/build-tools/$BUILD_TOOLS/apksigner" \
  "$SDK_ROOT/ndk/$NDK_VERSION/source.properties" \
  "$SDK_ROOT/cmake/$CMAKE_VERSION/bin/cmake"; do
  [ -e "$path" ] || die "expected SDK component missing: $path"
done

log "SDK ready at $SDK_ROOT"
log "disk used by the SDK (incl. download cache): $(du -sh "$SDK_ROOT" | cut -f1)"
df -h "$SDK_ROOT" | tail -n 1 | awk '{print "[setup-sdk] filesystem free: " $4 " of " $2 " (" $1 ")"}'
