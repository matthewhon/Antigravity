package com.pastoralcarecompanion;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;

public class CelebrationAlarmReceiver extends BroadcastReceiver {
    public static final String CHANNEL_ID = "pc_daily_celebrations_channel";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;

        String title = intent.getStringExtra("title");
        String body = intent.getStringExtra("body");
        String dateKey = intent.getStringExtra("dateKey");
        int notifId = intent.getIntExtra("notifId", 700000);

        if (title == null || body == null) return;

        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Daily Birthdays & Anniversaries",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Daily summary of church members celebrating a birthday or anniversary");
            nm.createNotificationChannel(channel);
        }

        Intent tapIntent = new Intent(context, MainActivity.class);
        tapIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        tapIntent.putExtra("openCelebrationsModal", true);
        tapIntent.putExtra("celebrationDateKey", dateKey != null ? dateKey : "");

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent contentIntent = PendingIntent.getActivity(context, notifId, tapIntent, flags);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(context.getApplicationInfo().icon)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(contentIntent);

        nm.notify(notifId, builder.build());
    }
}
