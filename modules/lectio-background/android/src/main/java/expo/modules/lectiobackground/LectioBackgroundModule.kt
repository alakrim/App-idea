package expo.modules.lectiobackground

import android.Manifest
import android.content.Context
import expo.modules.interfaces.permissions.PermissionsResponse
import expo.modules.interfaces.permissions.PermissionsResponseListener
import expo.modules.interfaces.permissions.PermissionsStatus
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The JavaScript face of the processing service (ADR-0007). Start, update and stop run the service.
 * Cancel and timeout events come back from the service. Notification permission is asked through
 * Expo's permissions manager, so it uses the app's own activity.
 */
class LectioBackgroundModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LectioBackground")
    Events(ProcessingBus.EVENT_CANCEL, ProcessingBus.EVENT_TIMEOUT)

    OnCreate {
      ProcessingBus.sink = { name, body -> sendEvent(name, body) }
    }

    OnDestroy {
      ProcessingBus.sink = null
    }

    AsyncFunction("startProcessing") { notice: ProcessingNoticeRecord ->
      ProcessingService.start(requireContext(), notice.toNotice())
    }

    AsyncFunction("updateProcessing") { notice: ProcessingNoticeRecord ->
      ProcessingService.update(requireContext(), notice.toNotice())
    }

    AsyncFunction("stopProcessing") {
      ProcessingService.stop(requireContext())
    }

    AsyncFunction("isProcessing") {
      ProcessingService.running
    }

    AsyncFunction("requestNotificationPermission") { promise: Promise ->
      val permissions = appContext.permissions
      if (permissions == null) {
        promise.resolve("denied")
      } else {
        permissions.askForPermissions(
          PermissionsResponseListener { result ->
            promise.resolve(if (statusOf(result) == "granted") "granted" else "denied")
          },
          Manifest.permission.POST_NOTIFICATIONS,
        )
      }
    }

    AsyncFunction("notificationPermissionStatus") { promise: Promise ->
      val permissions = appContext.permissions
      if (permissions == null) {
        promise.resolve("denied")
      } else {
        permissions.getPermissions(
          PermissionsResponseListener { result -> promise.resolve(statusOf(result)) },
          Manifest.permission.POST_NOTIFICATIONS,
        )
      }
    }
  }

  private fun requireContext(): Context =
    appContext.reactContext ?: throw IllegalStateException("The React context is not available.")

  private fun statusOf(result: Map<String, PermissionsResponse>): String =
    when (result[Manifest.permission.POST_NOTIFICATIONS]?.status) {
      PermissionsStatus.GRANTED -> "granted"
      PermissionsStatus.DENIED -> "denied"
      else -> "undetermined"
    }
}
