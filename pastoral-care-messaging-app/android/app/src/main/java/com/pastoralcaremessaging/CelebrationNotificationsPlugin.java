package com.pastoralcaremessaging;

import android.Manifest;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(
    name = "CelebrationNotifications",
    permissions = {
        @Permission(
            strings = { "android.permission.POST_NOTIFICATIONS" },
            alias = "notifications"
        )
    }
)
public class CelebrationNotificationsPlugin extends Plugin {
    private static final String TAG = "CelebrationNotifs";
    private static final String PREFS_NAME = "pc_celebration_alarms";
    private static final String PREFS_IDS_KEY = "scheduled_ids";
    private static final String PREFS_PAYLOADS_KEY = "scheduled_payloads";

    @Override
    public void load() {
        super.load();
        if (getActivity() != null) {
            handleTapIntent(getActivity().getIntent());
        }
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        handleTapIntent(intent);
    }

    private void handleTapIntent(Intent intent) {
        if (intent != null && intent.getBooleanExtra("openCelebrationsModal", false)) {
            String dateKey = intent.getStringExtra("celebrationDateKey");
            intent.removeExtra("openCelebrationsModal");
            JSObject data = new JSObject();
            data.put("dateKey", dateKey != null ? dateKey : "");
            notifyListeners("celebrationNotificationTapped", data, true);
        }
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33) {
            if (getPermissionState("notifications") != PermissionState.GRANTED) {
                requestPermissionForAlias("notifications", call, "notificationsPermsCallback");
                return;
            }
        }
        JSObject ret = new JSObject();
        ret.put("granted", true);
        call.resolve(ret);
    }

    @PermissionCallback
    private void notificationsPermsCallback(PluginCall call) {
        boolean granted = true;
        if (Build.VERSION.SDK_INT >= 33) {
            granted = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED;
        }
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        call.resolve(ret);
    }

    @PluginMethod
    public void scheduleNotifications(PluginCall call) {
        Context context = getContext();
        cancelAllInternal(context);

        JSArray items = call.getArray("notifications");
        if (items == null) {
            call.resolve();
            return;
        }

        try {
            JSONArray persisted = scheduleArrayInternal(context, items);
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit().putString(PREFS_PAYLOADS_KEY, persisted.toString()).apply();
            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "Failed to schedule celebration notifications", e);
            call.reject("Failed to schedule celebration notifications: " + e.getMessage(), e);
        }
    }

    public static void rescheduleFromPrefs(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String raw = prefs.getString(PREFS_PAYLOADS_KEY, null);
        if (raw == null || raw.isEmpty()) return;
        try {
            JSONArray items = new JSONArray(raw);
            JSONArray persisted = scheduleArrayInternal(context, items);
            prefs.edit().putString(PREFS_PAYLOADS_KEY, persisted.toString()).apply();
        } catch (Exception e) {
            Log.e(TAG, "Failed to reschedule celebration notifications after boot", e);
        }
    }

    private static JSONArray scheduleArrayInternal(Context context, JSONArray items) throws Exception {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) {
            return new JSONArray();
        }

        Set<String> scheduledIds = new HashSet<>();
        JSONArray persisted = new JSONArray();
        long now = System.currentTimeMillis();

        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.getJSONObject(i);
            int id = item.optInt("id", 700000 + i);
            String dateKey = item.optString("dateKey", "");
            String title = item.optString("title", "");
            String body = item.optString("body", "");
            long triggerAtMs = item.optLong("triggerAtMs", 0L);

            if (triggerAtMs <= now || title.isEmpty()) continue;

            Intent intent = new Intent(context, CelebrationAlarmReceiver.class);
            intent.putExtra("notifId", id);
            intent.putExtra("dateKey", dateKey);
            intent.putExtra("title", title);
            intent.putExtra("body", body);

            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }

            PendingIntent pi = PendingIntent.getBroadcast(context, id, intent, flags);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, pi);
            } else {
                alarmManager.set(AlarmManager.RTC_WAKEUP, triggerAtMs, pi);
            }
            scheduledIds.add(String.valueOf(id));
            persisted.put(item);
        }

        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putStringSet(PREFS_IDS_KEY, scheduledIds).apply();
        return persisted;
    }

    @PluginMethod
    public void cancelAll(PluginCall call) {
        cancelAllInternal(getContext());
        call.resolve();
    }

    private static void cancelAllInternal(Context context) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        Set<String> ids = prefs.getStringSet(PREFS_IDS_KEY, new HashSet<String>());
        if (alarmManager != null && ids != null) {
            for (String idStr : ids) {
                try {
                    int id = Integer.parseInt(idStr);
                    Intent intent = new Intent(context, CelebrationAlarmReceiver.class);
                    int flags = PendingIntent.FLAG_NO_CREATE;
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        flags |= PendingIntent.FLAG_IMMUTABLE;
                    }
                    PendingIntent pi = PendingIntent.getBroadcast(context, id, intent, flags);
                    if (pi != null) {
                        alarmManager.cancel(pi);
                        pi.cancel();
                    }
                } catch (Exception ignored) {
                }
            }
        }
        prefs.edit().remove(PREFS_IDS_KEY).remove(PREFS_PAYLOADS_KEY).apply();
    }
}
