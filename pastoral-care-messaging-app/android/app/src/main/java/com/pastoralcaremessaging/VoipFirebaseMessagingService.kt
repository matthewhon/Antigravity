package com.pastoralcaremessaging

import android.os.Build
import android.os.Bundle
import android.telecom.TelecomManager
import android.util.Log
import com.capacitorjs.plugins.pushnotifications.MessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Intercepts high-priority data-only FCM VoIP pushes (`type = "incoming_call"`)
 * even when the app is backgrounded or killed, and delegates all other pushes
 * to Capacitor's PushNotifications MessagingService.
 */
class VoipFirebaseMessagingService : MessagingService() {
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        VoiceCallCoordinator.listener?.invoke("token", token, null)
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        val data = remoteMessage.data
        if (data["type"] == "incoming_call") {
            handleIncomingVoipPush(data)
            return
        }
        super.onMessageReceived(remoteMessage)
    }

    private fun handleIncomingVoipPush(data: Map<String, String>) {
        val callSid = data["callSid"].orEmpty()
        val from = data["from"].orEmpty().ifBlank { "Unknown" }
        val callerName = data["callerName"].orEmpty().ifBlank { from }

        val handle = VoiceCallCoordinator.ensurePhoneAccountRegistered(this)
        val telecomManager = getSystemService(TELECOM_SERVICE) as? TelecomManager
        if (telecomManager == null) {
            Log.w(TAG, "TelecomManager unavailable; showing fallback incoming call notification")
            VoiceCallCoordinator.showIncomingCallNotification(this, callerName, callSid)
            return
        }

        val extras = Bundle().apply {
            putString("from", from)
            putString("callerName", callerName)
            putString("callSid", callSid)
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !telecomManager.isIncomingCallPermitted(handle)) {
                Log.w(TAG, "Incoming call not permitted by TelecomManager; showing fallback notification")
                VoiceCallCoordinator.showIncomingCallNotification(this, callerName, callSid)
                return
            }
            telecomManager.addNewIncomingCall(handle, extras)
        } catch (se: SecurityException) {
            Log.e(TAG, "SecurityException adding incoming call to TelecomManager", se)
            VoiceCallCoordinator.showIncomingCallNotification(this, callerName, callSid)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to report incoming call", e)
        }
    }

    companion object {
        private const val TAG = "VoipFcmService"
    }
}
