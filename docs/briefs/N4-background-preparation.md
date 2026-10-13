# Brief N4: Keep preparing chapters while the app is in the background

**Type**: implementation (config plugin + service + app lifecycle + permission UX). **Runs after N3 lands**, because both touch `src/features/pipeline/*`. Read `CLAUDE.md`, `docs/CONVENTIONS.md`, `docs/STATE.md` (N2, N3), `docs/BUILD-ANDROID.md`, `app.config.ts`, `plugins/*`, `src/features/pipeline/*`, `src/services/pipeline/{runtime,facade,progress}.ts`, `src/core/pipeline/queue.ts`. Also read the library source: `node_modules/react-native-background-actions/{src/index.js,lib/types/index.d.ts,android/src/main/**}`.

## Decision (user-approved 2026-10-13)
The user approved a foreground service, so chapters keep preparing when they leave the app. It will look like the progress notification Audible shows for a download.

**Why a library and not just keep-awake:** React Native Android pauses JS timers when the app is not in the foreground, unless a **headless JS task** is running (`JavaTimerManager`: `if (isPaused && !isRunningTasks)`). Our time limits and retry backoff are JS timers. `react-native-background-actions@4.1.0` (installed by the architect, exact version) does both jobs:
- it runs a `HeadlessJsTaskService` with `startForeground`, which supports `foregroundServiceType`
- it shows a progress-bar notification
- it implements `onTimeout`, so Android 15's 6 h/day dataSync limit stops the service cleanly

## Scope
1. **Config plugin** `plugins/with-background-processing.js`, registered in `app.config.ts`:
   - Add the permissions `FOREGROUND_SERVICE` (it may already be there), `FOREGROUND_SERVICE_DATA_SYNC` and `POST_NOTIFICATIONS`.
   - Merge `android:foregroundServiceType="dataSync"` into the library's `com.asterinet.react.bgactions.RNBackgroundActionsTask` service (`tools:replace`/merge), so Android 14+ doesn't throw `MissingForegroundServiceTypeException`.
   - Check that the existing permission-blocking logic (`with-android-release-size.js` / the manifest blocklist) doesn't strip them.
   - Prove it with `npx expo prebuild -p android --no-install` into a **scratch copy** of the repo, and quote the merged manifest lines in the report.
2. **Background runner** `src/services/pipeline/background-runner.ts`, behind a small port so core and tests stay native-free:
   - When the queue becomes busy (running or pending, and not paused) **while the app is in the foreground**, start the service. Its task awaits `runtime.idle()`; the pipeline itself keeps running in the same JS runtime, and the task only keeps the process and timers alive.
   - Stop the service when the queue is idle or paused, or when the user cancels.
   - Throttle notification updates to at most 1 per 2 s. The notification shows:
     - title: the chapter title
     - text: the stage and its detail, e.g. "Narrating · passage 5 of 18" (reuse N3's progress copy)
     - progress: stage progress, or indeterminate
     - a tap opens the app at the library (`linkingURI` with the app scheme)
     - the small icon: a monochrome notification icon; add one if the project has none
   - Catch start failures (e.g. `ForegroundServiceStartNotAllowedException` when started from the background) and degrade to N3's behaviour. Log a Diagnostics event; never crash.
   - iOS and web: a no-op.
   - Replace the keep-awake logic in `pipeline-lifecycle.tsx` with this runner. Keep-awake is no longer needed while the service runs.
3. **Notification permission UX (Android 13+)**:
   - The first time a chapter is queued, if `POST_NOTIFICATIONS` is not granted, show a designed in-app sheet: "See progress while Lectio prepares chapters in the background", with Allow and Not now.
   - Then call `PermissionsAndroid.request`. Remember a refusal and don't nag; Settings → Notifications explains how to turn it on.
   - The service still runs without the permission; Android only hides the notification.
4. **Remove N3's one-time "pauses in the background" toast** if the service started successfully; keep it only for the degraded path.
5. **Watchdog and heartbeat while the service runs**: N3's stall watchdog is suspended in the background today. While the foreground service is running, keep it running in the background, because JS is alive. The connection heartbeat (`src/services/network/app-connection.ts`, 1 s) already retires requests only after a real freeze; do not change that logic.
6. **Diagnostics**: service state (running/stopped/failed to start, with the reason), whether notification permission is granted, and the time the last service started.

## Tests
Mock `react-native-background-actions` (add a Jest mock; the library ships one under `jest/`, so check it):
- the service starts when the queue gets work in the foreground, and stops at idle, pause and cancel
- notification updates are throttled and use the right copy
- a start failure degrades without a crash
- the permission sheet shows once, and Not now is remembered
- the plugin output: a unit test of the plugin's manifest transform on a fixture manifest

## Constraints
- Do not run `npm install` (the dependency is already installed).
- No other native modules.
- Do not commit.
- Don't touch `scripts/sounds/**`, `assets/ambience/**`, `src/core/analysis/**` or `src/audio/**`.
- Don't run the full APK build; the architect builds.

## Acceptance
- `npm run verify` and `npm run boot:check` are green (paste the tails).
- Quote the merged manifest lines from prebuild.
- List what can only be confirmed on the device:
  - the notification appears and updates
  - work continues with the screen off for 10 minutes
  - the 6 h limit path
  - behaviour when notifications are denied
