package com.pastoralcaremessaging

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.telecom.PhoneAccount
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import androidx.core.app.NotificationCompat
import androidx.core.app.Person

/**
 * Coordinates incoming/active VoIP call state, Telecom PhoneAccount registration,
 * CallStyle notifications, and cold-start pending action handoff to JS.
 */
object VoiceCallCoordinator {
    const val INCOMING_CHANNEL_ID = "pc_incoming_calls_channel"
    const val ONGOING_CHANNEL_ID = "pc_ongoing_calls_channel"
    const val INCOMING_NOTIFICATION_ID = 81001
    const val ONGOING_NOTIFICATION_ID = 81002

    const val ACTION_ANSWER_CALL = "com.pastoralcaremessaging.ACTION_ANSWER_CALL"
    const val ACTION_DECLINE_CALL = "com.pastoralcaremessaging.ACTION_DECLINE_CALL"
    const val ACTION_END_CALL = "com.pastoralcaremessaging.ACTION_END_CALL"
    const val EXTRA_CALL_SID = "callSid"

    private const val PENDING_TTL_MS = 15_000L

    @Volatile
    var pendingCallAction: String? = null

    @Volatile
    var pendingCallActionAt: Long = 0L

    @Volatile
    var pendingCallSid: String? = null

    @Volatile
    var pendingCallerName: String? = null

    @Volatile
    var pendingFrom: String? = null

    @Volatile
    var activeCallSid: String? = null

    @Volatile
    var listener: ((event: String, callSid: String?, muted: Boolean?) -> Unit)? = null

    fun recordPendingAction(action: String, callSid: String?, callerName: String?, from: String?) {
        pendingCallAction = action
        pendingCallActionAt = System.currentTimeMillis()
        pendingCallSid = callSid
        pendingCallerName = callerName
        pendingFrom = from
    }

    fun consumePendingAction(): PendingAction? {
        val action = pendingCallAction ?: return null
        val age = System.currentTimeMillis() - pendingCallActionAt
        clearPendingAction()
        if (age > PENDING_TTL_MS) return null
        return PendingAction(action, pendingCallSid, pendingCallerName, pendingFrom)
    }

    fun clearPendingAction() {
        pendingCallAction = null
        pendingCallActionAt = 0L
        pendingCallSid = null
        pendingCallerName = null
        pendingFrom = null
    }

    data class PendingAction(
        val action: String,
        val callSid: String?,
        val callerName: String?,
        val from: String?
    )

    fun getPhoneAccountHandle(context: Context): PhoneAccountHandle {
        val componentName = ComponentName(context.applicationContext, VoiceConnectionService::class.java)
        return PhoneAccountHandle(componentName, "PastoralCareVoice")
    }

    fun ensurePhoneAccountRegistered(context: Context): PhoneAccountHandle {
        val appContext = context.applicationContext
        val telecomManager = appContext.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
        val handle = getPhoneAccountHandle(appContext)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val account = PhoneAccount.builder(handle, "Pastoral Care Voice")
                .setCapabilities(PhoneAccount.CAPABILITY_SELF_MANAGED)
                .build()
            telecomManager.registerPhoneAccount(account)
        }
        return handle
    }

    fun ensureCallChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return

        if (nm.getNotificationChannel(INCOMING_CHANNEL_ID) == null) {
            val ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
            val audioAttrs = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
            val incoming = NotificationChannel(
                INCOMING_CHANNEL_ID,
                "Incoming Voice Calls",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Rings when an incoming church voice call arrives"
                setSound(ringtoneUri, audioAttrs)
                enableVibration(true)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }
            nm.createNotificationChannel(incoming)
        }

        if (nm.getNotificationChannel(ONGOING_CHANNEL_ID) == null) {
            val ongoing = NotificationChannel(
                ONGOING_CHANNEL_ID,
                "Active Voice Calls",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps active church voice calls connected in the background"
                setSound(null, null)
            }
            nm.createNotificationChannel(ongoing)
        }
    }

    fun buildIncomingCallNotification(
        context: Context,
        callerName: String,
        callSid: String
    ): Notification {
        ensureCallChannels(context)

        val fullScreenIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(EXTRA_CALL_SID, callSid)
        }
        val piFlags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        val fullScreenPi = PendingIntent.getActivity(context, 81100, fullScreenIntent, piFlags)

        val answerIntent = Intent(context, VoiceConnectionService::class.java).apply {
            action = ACTION_ANSWER_CALL
            putExtra(EXTRA_CALL_SID, callSid)
        }
        val answerPi = PendingIntent.getService(context, 81101, answerIntent, piFlags)

        val declineIntent = Intent(context, VoiceConnectionService::class.java).apply {
            action = ACTION_DECLINE_CALL
            putExtra(EXTRA_CALL_SID, callSid)
        }
        val declinePi = PendingIntent.getService(context, 81102, declineIntent, piFlags)

        val caller = Person.Builder().setName(callerName).setImportant(true).build()
        val smallIcon = R.drawable.ic_stat_notification

        val builder = NotificationCompat.Builder(context, INCOMING_CHANNEL_ID)
            .setSmallIcon(smallIcon)
            .setContentTitle(callerName)
            .setContentText("Incoming voice call")
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setFullScreenIntent(fullScreenPi, true)
            .setContentIntent(fullScreenPi)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            builder.setStyle(NotificationCompat.CallStyle.forIncomingCall(caller, declinePi, answerPi))
        } else {
            builder.addAction(android.R.drawable.ic_menu_close_clear_cancel, "Decline", declinePi)
            builder.addAction(android.R.drawable.ic_menu_call, "Answer", answerPi)
        }

        return builder.build()
    }

    fun buildOngoingCallNotification(
        context: Context,
        callerName: String,
        callSid: String
    ): Notification {
        ensureCallChannels(context)

        val contentIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(EXTRA_CALL_SID, callSid)
        }
        val piFlags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        val contentPi = PendingIntent.getActivity(context, 81103, contentIntent, piFlags)

        val hangupIntent = Intent(context, VoiceConnectionService::class.java).apply {
            action = ACTION_END_CALL
            putExtra(EXTRA_CALL_SID, callSid)
        }
        val hangupPi = PendingIntent.getService(context, 81104, hangupIntent, piFlags)

        val caller = Person.Builder().setName(callerName).setImportant(true).build()
        val smallIcon = R.drawable.ic_stat_notification

        val builder = NotificationCompat.Builder(context, ONGOING_CHANNEL_ID)
            .setSmallIcon(smallIcon)
            .setContentTitle(callerName)
            .setContentText("Voice call in progress")
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setContentIntent(contentPi)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            builder.setStyle(NotificationCompat.CallStyle.forOngoingCall(caller, hangupPi))
        } else {
            builder.addAction(android.R.drawable.ic_menu_close_clear_cancel, "Hang Up", hangupPi)
        }

        return builder.build()
    }

    fun showIncomingCallNotification(context: Context, callerName: String, callSid: String) {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
        nm.notify(INCOMING_NOTIFICATION_ID, buildIncomingCallNotification(context, callerName, callSid))
    }

    fun cancelIncomingCallNotification(context: Context) {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
        nm.cancel(INCOMING_NOTIFICATION_ID)
    }
}
