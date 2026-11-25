package com.pastoralcaremessaging;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class CelebrationBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
            || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            CelebrationNotificationsPlugin.rescheduleFromPrefs(context);
        }
    }
}
