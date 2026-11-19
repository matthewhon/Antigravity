package com.pastoralcaremessaging

import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.os.Bundle
import android.telecom.PhoneAccount
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "VoipCall")
class VoipCallPlugin : Plugin() {
    private var phoneAccountHandle: PhoneAccountHandle? = null

    override fun load() {
        val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
        val componentName = ComponentName(context, VoiceConnectionService::class.java)
        val handle = PhoneAccountHandle(componentName, "PastoralCareVoice")
        phoneAccountHandle = handle

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val account = PhoneAccount.builder(handle, "Pastoral Care Voice")
                .setCapabilities(PhoneAccount.CAPABILITY_SELF_MANAGED)
                .build()
            telecomManager.registerPhoneAccount(account)
        }

        VoiceConnectionService.listener = { event ->
            val data = JSObject()
            if (event == "answered") notifyListeners("callAnswered", data)
            if (event == "rejected" || event == "ended") notifyListeners("callEnded", data)
        }
    }

    @PluginMethod
    fun reportIncomingCall(call: PluginCall) {
        val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
        val handle = phoneAccountHandle ?: run {
            call.reject("PhoneAccountHandle not initialized")
            return
        }
        val extras = Bundle().apply {
            putString("from", call.getString("from") ?: "Unknown")
            putString("callerName", call.getString("callerName") ?: "Incoming Call")
            putString("callSid", call.getString("callSid") ?: "")
        }
        telecomManager.addNewIncomingCall(handle, extras)
        call.resolve()
    }

    @PluginMethod
    fun endCall(call: PluginCall) {
        VoiceConnectionService.activeConnection?.onDisconnect()
        call.resolve()
    }
}
