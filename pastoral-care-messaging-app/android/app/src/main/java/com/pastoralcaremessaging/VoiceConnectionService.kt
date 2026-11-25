package com.pastoralcaremessaging

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.telecom.CallAudioState
import android.telecom.Connection
import android.telecom.ConnectionRequest
import android.telecom.ConnectionService
import android.telecom.DisconnectCause
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import android.util.Log
import androidx.core.content.ContextCompat
import java.util.concurrent.ConcurrentHashMap

class VoiceConnectionService : ConnectionService() {
    companion object {
        private const val TAG = "VoiceConnectionService"
        private val connections = ConcurrentHashMap<String, VoiceConnection>()

        @Volatile
        var activeConnection: VoiceConnection? = null

        @Volatile
        var listener: ((event: String, callSid: String?, muted: Boolean?) -> Unit)? = null

        fun disconnectFromApp(context: Context) {
            Handler(Looper.getMainLooper()).post {
                VoiceCallCoordinator.cancelIncomingCallNotification(context)
                VoiceCallCoordinator.clearPendingAction()
                val conn = activeConnection
                if (conn != null) {
                    conn.suppressDisconnectEvent = true
                    conn.setDisconnected(DisconnectCause(DisconnectCause.LOCAL))
                    conn.destroy()
                    connections.remove(conn.callSid)
                    activeConnection = null
                }
                VoiceCallCoordinator.activeCallSid = null
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            VoiceCallCoordinator.ACTION_ANSWER_CALL -> {
                val sid = intent.getStringExtra(VoiceCallCoordinator.EXTRA_CALL_SID)
                val conn = (if (!sid.isNullOrEmpty()) connections[sid] else null) ?: activeConnection
                if (conn != null) {
                    conn.onAnswer()
                } else {
                    VoiceCallCoordinator.cancelIncomingCallNotification(this)
                    VoiceCallCoordinator.recordPendingAction("answered", sid, null, null)
                    VoiceCallCoordinator.listener?.invoke("answered", sid, null)
                    launchMainActivity(sid)
                }
            }
            VoiceCallCoordinator.ACTION_DECLINE_CALL -> {
                val sid = intent.getStringExtra(VoiceCallCoordinator.EXTRA_CALL_SID)
                val conn = (if (!sid.isNullOrEmpty()) connections[sid] else null) ?: activeConnection
                if (conn != null) {
                    conn.onReject()
                } else {
                    VoiceCallCoordinator.cancelIncomingCallNotification(this)
                    VoiceCallCoordinator.recordPendingAction("rejected", sid, null, null)
                    VoiceCallCoordinator.listener?.invoke("rejected", sid, null)
                }
            }
            VoiceCallCoordinator.ACTION_END_CALL -> {
                val sid = intent.getStringExtra(VoiceCallCoordinator.EXTRA_CALL_SID)
                val conn = (if (!sid.isNullOrEmpty()) connections[sid] else null) ?: activeConnection
                conn?.onDisconnect()
            }
        }
        return super.onStartCommand(intent, flags, startId)
    }

    override fun onCreateIncomingConnection(
        connectionManagerPhoneAccount: PhoneAccountHandle?,
        request: ConnectionRequest?
    ): Connection {
        val extras = request?.extras
        val from = extras?.getString("from") ?: "Unknown"
        val callerName = extras?.getString("callerName") ?: from
        val callSid = extras?.getString("callSid") ?: ""

        // Clean up any stale prior connection before creating a new one
        activeConnection?.let { prior ->
            prior.suppressDisconnectEvent = true
            prior.setDisconnected(DisconnectCause(DisconnectCause.CANCELED))
            prior.destroy()
            connections.remove(prior.callSid)
        }

        val connection = VoiceConnection(this, callSid, callerName, from).apply {
            setAddress(Uri.fromParts("tel", from, null), TelecomManager.PRESENTATION_ALLOWED)
            setCallerDisplayName(callerName, TelecomManager.PRESENTATION_ALLOWED)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                connectionProperties = Connection.PROPERTY_SELF_MANAGED
                audioModeIsVoip = true
            }
            setRinging()
        }

        if (callSid.isNotEmpty()) {
            connections[callSid] = connection
        }
        activeConnection = connection
        VoiceCallCoordinator.activeCallSid = callSid
        return connection
    }

    override fun onCreateIncomingConnectionFailed(
        connectionManagerPhoneAccount: PhoneAccountHandle?,
        request: ConnectionRequest?
    ) {
        val callSid = request?.extras?.getString("callSid")
        Log.w(TAG, "onCreateIncomingConnectionFailed for callSid=$callSid")
        VoiceCallCoordinator.cancelIncomingCallNotification(this)
        VoiceCallCoordinator.listener?.invoke("ended", callSid, null)
    }

    private fun startOngoingForeground(callerName: String, callSid: String) {
        val notification = VoiceCallCoordinator.buildOngoingCallNotification(this, callerName, callSid)
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                val hasMic = ContextCompat.checkSelfPermission(
                    this,
                    Manifest.permission.RECORD_AUDIO
                ) == PackageManager.PERMISSION_GRANTED
                val fgsType = if (hasMic) {
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                } else {
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL
                }
                startForeground(VoiceCallCoordinator.ONGOING_NOTIFICATION_ID, notification, fgsType)
            } else {
                startForeground(VoiceCallCoordinator.ONGOING_NOTIFICATION_ID, notification)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start foreground service for call", e)
        }
    }

    private fun stopOngoingForeground() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE)
            } else {
                @Suppress("DEPRECATION")
                stopForeground(true)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to stop foreground service", e)
        }
    }

    private fun launchMainActivity(callSid: String?) {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            if (!callSid.isNullOrEmpty()) {
                putExtra(VoiceCallCoordinator.EXTRA_CALL_SID, callSid)
            }
        }
        startActivity(intent)
    }

    class VoiceConnection(
        private val service: VoiceConnectionService,
        val callSid: String,
        private val callerName: String,
        private val from: String
    ) : Connection() {
        @Volatile
        var suppressDisconnectEvent: Boolean = false

        override fun onShowIncomingCallUi() {
            VoiceCallCoordinator.showIncomingCallNotification(service, callerName, callSid)
        }

        override fun onAnswer() {
            VoiceCallCoordinator.cancelIncomingCallNotification(service)
            setActive()
            service.startOngoingForeground(callerName, callSid)
            val activeListener = listener ?: VoiceCallCoordinator.listener
            if (activeListener != null) {
                activeListener.invoke("answered", callSid, null)
            } else {
                VoiceCallCoordinator.recordPendingAction("answered", callSid, callerName, from)
            }
            service.launchMainActivity(callSid)
        }

        override fun onReject() {
            VoiceCallCoordinator.cancelIncomingCallNotification(service)
            setDisconnected(DisconnectCause(DisconnectCause.REJECTED))
            destroy()
            cleanup()
            val activeListener = listener ?: VoiceCallCoordinator.listener
            if (activeListener != null) {
                activeListener.invoke("rejected", callSid, null)
            } else {
                VoiceCallCoordinator.recordPendingAction("rejected", callSid, callerName, from)
            }
        }

        override fun onAbort() {
            VoiceCallCoordinator.cancelIncomingCallNotification(service)
            setDisconnected(DisconnectCause(DisconnectCause.CANCELED))
            destroy()
            cleanup()
            if (!suppressDisconnectEvent) {
                (listener ?: VoiceCallCoordinator.listener)?.invoke("ended", callSid, null)
            }
        }

        override fun onDisconnect() {
            VoiceCallCoordinator.cancelIncomingCallNotification(service)
            setDisconnected(DisconnectCause(DisconnectCause.LOCAL))
            destroy()
            cleanup()
            if (!suppressDisconnectEvent) {
                (listener ?: VoiceCallCoordinator.listener)?.invoke("ended", callSid, null)
            }
        }

        override fun onCallAudioStateChanged(state: CallAudioState?) {
            super.onCallAudioStateChanged(state)
            if (state != null) {
                (listener ?: VoiceCallCoordinator.listener)?.invoke("muted", callSid, state.isMuted)
            }
        }

        private fun cleanup() {
            service.stopOngoingForeground()
            if (callSid.isNotEmpty()) {
                connections.remove(callSid)
            }
            if (activeConnection === this) {
                activeConnection = null
            }
            if (VoiceCallCoordinator.activeCallSid == callSid) {
                VoiceCallCoordinator.activeCallSid = null
            }
        }
    }
}
