package com.pastoralcaremessaging

import android.net.Uri
import android.os.Build
import android.telecom.Connection
import android.telecom.ConnectionRequest
import android.telecom.ConnectionService
import android.telecom.DisconnectCause
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager

class VoiceConnectionService : ConnectionService() {
    companion object {
        var activeConnection: VoiceConnection? = null
        var listener: ((String) -> Unit)? = null
    }

    override fun onCreateIncomingConnection(
        connectionManagerPhoneAccount: PhoneAccountHandle?,
        request: ConnectionRequest?
    ): Connection {
        val connection = VoiceConnection()
        val extras = request?.extras
        val caller = extras?.getString("from") ?: "Unknown"
        connection.setAddress(Uri.fromParts("tel", caller, null), TelecomManager.PRESENTATION_ALLOWED)
        connection.setCallerDisplayName(
            extras?.getString("callerName") ?: caller,
            TelecomManager.PRESENTATION_ALLOWED
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            connection.connectionProperties = Connection.PROPERTY_SELF_MANAGED
        }
        connection.setRinging()
        activeConnection = connection
        return connection
    }

    class VoiceConnection : Connection() {
        override fun onAnswer() {
            setActive()
            listener?.invoke("answered")
        }

        override fun onReject() {
            setDisconnected(DisconnectCause(DisconnectCause.REJECTED))
            destroy()
            activeConnection = null
            listener?.invoke("rejected")
        }

        override fun onDisconnect() {
            setDisconnected(DisconnectCause(DisconnectCause.LOCAL))
            destroy()
            activeConnection = null
            listener?.invoke("ended")
        }
    }
}
