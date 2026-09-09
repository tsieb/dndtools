package com.dndtools.gm;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;

/**
 * RC-PLT-2.2 — the notification channels Lamplight posts on, created at first launch so the DM can
 * tune or silence each kind in Android settings before the app has ever posted anything.
 *
 * The ids are the contract with the renderer (`PLATFORM_NOTIFICATION_CHANNELS` in
 * `platform/capabilities.ts`); changing one here without changing it there would silently drop
 * notifications onto the app's default channel.
 */
public final class NotificationChannels {

    public static final String LIVE_SESSION = "lamplight-live-session";
    public static final String UPDATES = "lamplight-updates";

    private NotificationChannels() {}

    public static void ensure(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) {
            return;
        }

        // The live-session status is persistent and ambient: it must never buzz mid-scene.
        NotificationChannel liveSession = new NotificationChannel(
            LIVE_SESSION,
            context.getString(R.string.notification_channel_live_session),
            NotificationManager.IMPORTANCE_LOW
        );
        liveSession.setDescription(context.getString(R.string.notification_channel_live_session_description));
        liveSession.setShowBadge(false);
        liveSession.enableVibration(false);
        liveSession.setSound(null, null);

        NotificationChannel updates = new NotificationChannel(
            UPDATES,
            context.getString(R.string.notification_channel_updates),
            NotificationManager.IMPORTANCE_DEFAULT
        );
        updates.setDescription(context.getString(R.string.notification_channel_updates_description));

        manager.createNotificationChannel(liveSession);
        manager.createNotificationChannel(updates);
    }
}
