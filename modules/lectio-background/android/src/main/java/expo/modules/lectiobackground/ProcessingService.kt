package expo.modules.lectiobackground

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat

/**
 * Keeps chapter processing alive while the app is in the background (ADR-0007). It runs as a
 * `dataSync` foreground service, holds a partial wake lock and a high-performance Wi-Fi lock, and
 * shows the processing notification. The JavaScript queue owns the work. This service only keeps
 * the process up and shows progress.
 */
class ProcessingService : Service() {
  private var wakeLock: PowerManager.WakeLock? = null
  private var wifiLock: WifiManager.WifiLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_CANCEL) {
      // The notification's Cancel action. With no JavaScript to hear it, nothing is left to cancel.
      val heard = ProcessingBus.emitCancel(NoticeIntents.chapterIdOf(intent))
      if (!heard || !running) shutDown()
    } else {
      showNotice(NoticeIntents.read(intent))
    }
    return START_NOT_STICKY
  }

  /**
   * Android 15 ends a `dataSync` service that runs past its daily budget. The service stops now and
   * the JavaScript queue stays as it is. It resumes on the next foreground.
   */
  override fun onTimeout(startId: Int, fgsType: Int) {
    ProcessingBus.emitTimeout()
    shutDown()
  }

  override fun onDestroy() {
    running = false
    releaseLocks()
    super.onDestroy()
  }

  private fun showNotice(notice: ProcessingNotice) {
    val notification = ProcessingNotifications.build(this, notice)
    if (running) {
      ProcessingNotifications.post(this, notification)
      return
    }
    // Must run within five seconds of the start. Android 12+ refuses it from the background, and the
    // caller then gets false instead of a crash.
    ServiceCompat.startForeground(
      this,
      ProcessingNotifications.NOTIFICATION_ID,
      notification,
      ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
    )
    running = true
    acquireLocks()
  }

  private fun shutDown() {
    running = false
    releaseLocks()
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  private fun acquireLocks() {
    val power = getSystemService(Context.POWER_SERVICE) as PowerManager
    wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, WAKE_LOCK_TAG).apply {
      setReferenceCounted(false)
      acquire(WAKE_LOCK_LIMIT_MS)
    }
    val wifi = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
    val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      WifiManager.WIFI_MODE_FULL_LOW_LATENCY
    } else {
      WifiManager.WIFI_MODE_FULL_HIGH_PERF
    }
    wifiLock = wifi.createWifiLock(mode, WAKE_LOCK_TAG).apply {
      setReferenceCounted(false)
      acquire()
    }
  }

  private fun releaseLocks() {
    wakeLock?.takeIf { it.isHeld }?.release()
    wakeLock = null
    wifiLock?.takeIf { it.isHeld }?.release()
    wifiLock = null
  }

  companion object {
    const val ACTION_SHOW = "expo.modules.lectiobackground.SHOW"
    const val ACTION_CANCEL = "expo.modules.lectiobackground.CANCEL"
    private const val WAKE_LOCK_TAG = "lectio:processing"

    /** Android's daily budget for a dataSync service is six hours. The lock never outlives it. */
    private const val WAKE_LOCK_LIMIT_MS = 6L * 60 * 60 * 1000

    /** True while the service is in the foreground. Read by the module before it sends an update. */
    @Volatile
    var running: Boolean = false
      private set

    /**
     * Starts the foreground service. Returns false when Android refuses the start, which happens for
     * a start from the background. Processing then carries on without the notification.
     */
    fun start(context: Context, notice: ProcessingNotice): Boolean =
      launch(context, notice, foreground = true)

    /** Updates the notification of a running service. It does nothing when the service is not running. */
    fun update(context: Context, notice: ProcessingNotice) {
      if (running) launch(context, notice, foreground = false)
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, ProcessingService::class.java))
    }

    private fun launch(context: Context, notice: ProcessingNotice, foreground: Boolean): Boolean {
      val intent = NoticeIntents.build(context, ACTION_SHOW, notice)
      return try {
        if (foreground) {
          ContextCompat.startForegroundService(context, intent)
        } else {
          context.startService(intent)
        }
        true
      } catch (refused: RuntimeException) {
        // ForegroundServiceStartNotAllowedException and its siblings are all RuntimeExceptions.
        false
      }
    }
  }
}
