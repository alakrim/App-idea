# Brief BG1: Chapter processing keeps running when the user leaves the app

**Type**: implementation (native Android module + config + pipeline queue + app wiring).

**Read first**: `CLAUDE.md`, `docs/CONVENTIONS.md` (React Compiler and Worklets rules), **ADR-0007** (the contract for this brief), `src/core/pipeline/{queue,runner,errors,ports}.ts`, `src/services/pipeline/runtime.ts`, `src/features/pipeline/{pipeline-lifecycle,pipeline-provider,use-chapter-progress}.tsx?`, `src/services/pipeline/progress.ts`, `src/services/openrouter/{transport,retry}.ts`, `app.config.ts`, `plugins/with-crash-reporter.js` (the native-code pattern), `scripts/android/build-apk.sh` and `docs/BUILD-ANDROID.md`.

## Why
The user's top complaint is still open: leaving the app freezes processing. ADR-0007 gives the root cause:
- `expo-keep-awake` only keeps the screen on while the app is in the foreground.
- Android freezes a background process that has no foreground service, and cuts its network.
- `PipelineQueue.drain()` drops a chapter after any NETWORK or TIMEOUT failure.

## Scope
1. **Local Expo module `modules/lectio-background/`** (Expo Modules API, autolinked from `modules/`; hand-write the files, no `npm install`). It contains:
   - `expo-module.config.json`, `index.ts` (typed JS API), `android/build.gradle` and `android/src/main/AndroidManifest.xml`, which declares the service with `android:foregroundServiceType="dataSync"` plus the permissions `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_DATA_SYNC`, `WAKE_LOCK` and `POST_NOTIFICATIONS`.
   - A Kotlin `ProcessingService` that:
     - calls `startForeground` with type `DATA_SYNC` on API 29+ (`ServiceCompat.startForeground`)
     - holds a `PARTIAL_WAKE_LOCK` and a `WifiLock` (`WIFI_MODE_FULL_HIGH_PERF`, or `WIFI_MODE_FULL_LOW_LATENCY` on API 29+), released in `onDestroy`
     - has a channel `lectio.processing` with low importance: no sound or vibration, the app's small icon, an accent colour
     - shows a notification with the title (the chapter title), text (e.g. "Narrating · 12 of 37 parts" or "Translating · 40%"), a determinate progress bar, a tap intent that deep-links `lectio://chapter/<id>`, and a **Cancel** action
     - overrides `onTimeout(int, int)` (Android 15): stop the service and emit a `timeout` event
   - The JS API:
     - `startProcessing({chapterId, title, text, progress})`, `updateProcessing(...)` and `stopProcessing()`
     - `addCancelListener(cb)` and `addTimeoutListener(cb)` (module events)
     - `requestNotificationPermission(): Promise<'granted'|'denied'>` and `notificationPermissionStatus()`
     - every function is a safe no-op on iOS and web, and in Jest (a mock under `__mocks__` or a guarded `requireOptionalNativeModule`)
   - Starting from the background can throw `ForegroundServiceStartNotAllowedException`. Catch it, return `false`, and never crash.
2. **Queue: transient failures never end a run** (`src/core/pipeline/queue.ts`, pure and unit-tested with fake timers):
   - On a failed outcome whose error is retryable (NETWORK, TIMEOUT, RATE_LIMITED retryable, PROVIDER/5xx, and anything with `retryable: true`), keep the chapter in the queue with state `waiting` and `retryAt` (exponential backoff 5 s, 15 s, 45 s … capped at 5 min, ±20 % jitter, injectable clock and timer).
   - Move it behind the other pending chapters, so one flaky chapter does not block the rest. Persist it.
   - Add `retryNow()` to retry waiting chapters at once (used on foreground and on reconnect). Expose `waiting` in `QueueSnapshot`.
   - Non-retryable failures leave the queue as today, and the AUTH pause is unchanged. Add a cap of 20 consecutive transient failures per chapter, after which it fails with its last error.
   - An events `retrying` (chapterId, attempt, retryAt) for the UI.
3. **Runtime and lifecycle wiring** (`pipeline-lifecycle.tsx` and a new `src/features/pipeline/background-work.ts`):
   - When the queue goes busy, call `startProcessing`. Throttle `updateProcessing` to at most once per second from progress events: chapter title, stage label and fraction. Call `stopProcessing` when the queue goes idle or paused. Keep keep-awake as is.
   - The Cancel action calls `facade.cancel(chapterId)`. The timeout event leaves the queue as is, and it resumes on the next foreground.
   - `AppState` → `active` calls `queue.retryNow()`, and restarts the service if the queue is busy and it is not running.
   - Retry when connectivity returns. Expo SDK 57 has `expo-network`; it is not installed, so **do not install it**. Instead, retry on `active`, and on a light 30 s probe while waiting chapters exist and the app is in the foreground.
   - The chapter screen and progress hook show the `waiting` state: "Waiting for connection · retrying in 0:42" with a "Retry now" button, styled like the existing stage stepper.
4. **Notification permission UX**: the first time a chapter is queued on Android 13+ with the permission undetermined, show a bottom sheet (design system `Sheet`):
   - title "Keep going in the background", one line "Lectio shows a quiet notification while it prepares your chapter, so it can finish even when you leave the app."
   - buttons "Allow" (the system prompt) and "Not now"
   - remember the answer in settings, and never block processing
5. **Transport timeouts**: 60 s is too short for long TTS segments. Use a per-call timeout: speech 180 s, chat 120 s, others 60 s. Each is still abortable. Add tests.
6. **Config**: register the module plugin if one is needed. Keep `blockedPermissions` intact. Verify the merged manifest has the service, its type and the permissions.

## Verification (mandatory, paste evidence)
- `npm run verify` is green (paste the tails). New unit tests cover the queue backoff, waiting, retryNow, the cap, persistence of the waiting state, the lifecycle wiring (mock module), the permission sheet and the per-call timeouts.
- **Native compile proof**: run `scripts/android/build-apk.sh` (it bootstraps the SDK; it takes about 10–15 min the first time). Paste the tail, the APK path, and `aapt2 dump xmltree --file AndroidManifest.xml <apk>` lines showing the service with `foregroundServiceType=dataSync` and the permissions. Do **not** publish the APK; the architect delivers builds.
- Write a **device test checklist** into your report (for the user): start a 40-min chapter, lock the phone, switch apps for 10 minutes, toggle airplane mode for 1 minute, come back. Expected: the notification progresses, processing completes, the waiting state recovers.

## Constraints
- No new npm dependencies. No real API calls. Don't touch `src/features/player/**`, `src/core/pipeline/stages/**` (brief F1 owns them), `src/core/analysis/**` or `assets/**`.
- You are in a git worktree. Before anything, run `ln -s /home/user/App-idea/node_modules node_modules` if `node_modules` is missing. **Commit** your work on your worktree branch with a clear message when verification is green, and report the branch name and commit SHA.
- Update `docs/STATE.md` only by adding a short "BG1" line under "Work in flight".
