package expo.modules.lectiobackground

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

/** The quiet, ongoing notification of the processing service: a progress bar and a Cancel action. */
internal object ProcessingNotifications {
  const val CHANNEL_ID = "lectio.processing"
  const val NOTIFICATION_ID = 4271

  /** The app's accent colour (dark theme), tinting the small icon. */
  private val ACCENT = Color.parseColor("#E8A84A")

  fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Chapter processing",
      NotificationManager.IMPORTANCE_LOW,
    ).apply {
      description = "Shows progress while Lectio prepares a chapter."
      setSound(null, null)
      enableVibration(false)
      setShowBadge(false)
    }
    manager.createNotificationChannel(channel)
  }

  /** Builds the notification. `cancelIntent` is the service intent the Cancel action sends. */
  fun build(context: Context, notice: ProcessingNotice): Notification {
    ensureChannel(context)
    return NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_notification_lectio)
      .setColor(ACCENT)
      .setContentTitle(notice.title)
      .setContentText(notice.text)
      .setContentIntent(openChapterIntent(context, notice.chapterId))
      .addAction(0, "Cancel", cancelIntent(context, notice.chapterId))
      .setProgress(PROGRESS_MAX, notice.percent, false)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setCategory(NotificationCompat.CATEGORY_PROGRESS)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .build()
  }

  /** Posts an update. Without the notification permission the update is simply not shown. */
  fun post(context: Context, notification: Notification) {
    val granted = ContextCompat.checkSelfPermission(
      context,
      Manifest.permission.POST_NOTIFICATIONS,
    ) == PackageManager.PERMISSION_GRANTED
    if (!granted) return
    NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
  }

  private fun openChapterIntent(context: Context, chapterId: String): PendingIntent {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
      ?: Intent(Intent.ACTION_VIEW).setPackage(context.packageName)
    val intent = launch.apply {
      action = Intent.ACTION_VIEW
      data = Uri.parse("lectio://chapter/$chapterId")
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    return PendingIntent.getActivity(
      context,
      chapterId.hashCode(),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun cancelIntent(context: Context, chapterId: String): PendingIntent {
    val intent = NoticeIntents.cancel(context, chapterId)
    return PendingIntent.getService(
      context,
      CANCEL_REQUEST_CODE,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private const val PROGRESS_MAX = 100
  private const val CANCEL_REQUEST_CODE = 1
}
