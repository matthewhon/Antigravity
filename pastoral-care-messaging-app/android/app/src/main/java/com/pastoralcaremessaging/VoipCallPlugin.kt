package com.pastoralcaremessaging

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.telecom.CallAudioState
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import com.google.firebase.messaging.FirebaseMessaging

@CapacitorPlugin(
    name = "VoipCall",
    permissions = [
        Permission(
            strings = [Manifest.permission.RECORD_AUDIO],
            alias = "microphone"
        )
    ]
)
class VoipCallPlugin : Plugin() {
    private var phoneAccountHandle: PhoneAccountHandle? = null

    override fun load() {
        phoneAccountHandle = VoiceCallCoordinator.ensurePhoneAccountRegistered(context)
        VoiceCallCoordinator.ensureCallChannels(context)

        val callback: (String, String?, Boolean?) -> Unit = { event, value, muted ->
            val data = JSObject()
            when (event) {
                "answered" -> {
                    if (!value.isNullOrEmpty()) data.put("callSid", value)
                    notifyListeners("callAnswered", data, true)
                }
                "rejected", "ended" -> {
                    if (!value.isNullOrEmpty()) data.put("callSid", value)
                    notifyListeners("callEnded", data, true)
                }
                "muted" -> {
                    if (!value.isNullOrEmpty()) data.put("callSid", value)
                    data.put("muted", muted == true)
                    notifyListeners("callMuted", data)
                }
                "token" -> {
                    if (!value.isNullOrEmpty()) {
                        data.put("token", value)
                        notifyListeners("voipToken", data)
                    }
                }
            }
        }
        VoiceConnectionService.listener = callback
        VoiceCallCoordinator.listener = callback
    }

    override fun handleOnDestroy() {
        VoiceConnectionService.listener = null
        VoiceCallCoordinator.listener = null
        super.handleOnDestroy()
    }

    @PluginMethod
    fun register(call: PluginCall) {
        val pending = VoiceCallCoordinator.consumePendingAction()
        val result = JSObject()
        if (pending != null) {
            result.put("pendingAction", pending.action)
            if (!pending.callSid.isNullOrEmpty()) result.put("callSid", pending.callSid)
            if (!pending.callerName.isNullOrEmpty()) result.put("callerName", pending.callerName)
            if (!pending.from.isNullOrEmpty()) result.put("from", pending.from)
        }

        try {
            FirebaseMessaging.getInstance().token
                .addOnSuccessListener { token ->
                    if (!token.isNullOrEmpty()) {
                        result.put("fcmToken", token)
                    }
                    call.resolve(result)
                }
                .addOnFailureListener {
                    call.resolve(result)
                }
        } catch (_: Exception) {
            call.resolve(result)
        }
    }

    @PluginMethod
    fun configureAudioSession(call: PluginCall) {
        if (getPermissionState("microphone") != PermissionState.GRANTED &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissionForAlias("microphone", call, "microphonePermsCallback")
            return
        }
        applyCommunicationAudioMode()
        call.resolve(JSObject().put("granted", true))
    }

    @PermissionCallback
    private fun microphonePermsCallback(call: PluginCall) {
        val granted = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED
        if (granted) {
            applyCommunicationAudioMode()
            call.resolve(JSObject().put("granted", true))
        } else {
            call.reject("Microphone permission is required for voice calls")
        }
    }

    private fun applyCommunicationAudioMode() {
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
        audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
    }

    @PluginMethod
    fun setSpeakerphone(call: PluginCall) {
        val enabled = call.getBoolean("enabled") ?: false
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager

        if (audioManager != null) {
            audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                if (enabled) {
                    val speaker = audioManager.availableCommunicationDevices.firstOrNull {
                        it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
                    }
                    if (speaker != null) {
                        audioManager.setCommunicationDevice(speaker)
                    }
                } else {
                    audioManager.clearCommunicationDevice()
                }
            } else {
                @Suppress("DEPRECATION")
                audioManager.isSpeakerphoneOn = enabled
            }
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            VoiceConnectionService.activeConnection?.setAudioRoute(
                if (enabled) CallAudioState.ROUTE_SPEAKER else CallAudioState.ROUTE_WIRED_OR_EARPIECE
            )
        }
        call.resolve()
    }

    @PluginMethod
    fun reportIncomingCall(call: PluginCall) {
        val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as? TelecomManager
        val handle = phoneAccountHandle ?: VoiceCallCoordinator.ensurePhoneAccountRegistered(context).also {
            phoneAccountHandle = it
        }
        if (telecomManager == null) {
            call.reject("TelecomManager unavailable")
            return
        }

        val extras = Bundle().apply {
            putString("from", call.getString("from") ?: "Unknown")
            putString("callerName", call.getString("callerName") ?: "Incoming Call")
            putString("callSid", call.getString("callSid") ?: "")
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !telecomManager.isIncomingCallPermitted(handle)) {
                call.reject("Incoming call not permitted by TelecomManager")
                return
            }
            telecomManager.addNewIncomingCall(handle, extras)
            call.resolve()
        } catch (se: SecurityException) {
            call.reject("SecurityException reporting incoming call: ${se.message}", se)
        } catch (e: Exception) {
            call.reject("Failed to report incoming call: ${e.message}", e)
        }
    }

    @PluginMethod
    fun endCall(call: PluginCall) {
        VoiceConnectionService.disconnectFromApp(context)
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        if (audioManager != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                audioManager.clearCommunicationDevice()
            } else {
                @Suppress("DEPRECATION")
                audioManager.isSpeakerphoneOn = false
            }
            audioManager.mode = AudioManager.MODE_NORMAL
        }
        call.resolve()
    }
}
