package com.dndtools.gm.plugins;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.IntentSender;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.webkit.MimeTypeMap;
import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.Locale;
import java.util.UUID;

@CapacitorPlugin(name = "DndtoolsFileExport")
public final class DndtoolsFileExportPlugin extends Plugin {

    private static final String EXPORT_DIRECTORY = "dndtools-exports";
    private static final long MAX_EXPORT_BYTES = 32L * 1024L * 1024L;
    private static final long POST_SHARE_RETENTION_MILLIS = 15L * 60L * 1000L;
    private static final long STALE_EXPORT_AGE_MILLIS = 24L * 60L * 60L * 1000L;
    private static final String CALLBACK_ID_EXTRA = "dndtools_callback_id";

    private final Handler cleanupHandler = new Handler(Looper.getMainLooper());
    private File pendingFile;
    private BroadcastReceiver chooserReceiver;
    private boolean presenting;
    private boolean shareTargetChosen;

    @Override
    public void load() {
        cleanupStaleExports();
    }

    @PluginMethod
    public void exportFile(PluginCall call) {
        if (presenting) {
            call.reject("Finish or dismiss the current Android share sheet first.", "EXPORT_IN_PROGRESS");
            return;
        }

        String filename = call.getString("filename");
        String encoded = call.getString("base64");
        String mimeType = call.getString("mimeType");
        String title = call.getString("title", "Export file");

        File output = null;
        try {
            String safeFilename = sanitizeFilename(filename);
            byte[] data = decodePayload(encoded);
            String safeMimeType = normalizeMimeType(mimeType, safeFilename);
            output = writeTemporaryFile(safeFilename, data);
            Uri contentUri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                output
            );

            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(safeMimeType);
            send.putExtra(Intent.EXTRA_STREAM, contentUri);
            send.putExtra(Intent.EXTRA_SUBJECT, title);
            send.setClipData(ClipData.newRawUri(safeFilename, contentUri));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            registerChooserReceiver(call.getCallbackId());
            Intent chooser = Intent.createChooser(send, title, chooserIntentSender(call.getCallbackId()));
            pendingFile = output;
            presenting = true;
            startActivityForResult(call, chooser, "shareResult");
        } catch (IllegalArgumentException exception) {
            cleanupFailedExport(output);
            call.reject(exception.getMessage(), "INVALID_EXPORT", exception);
        } catch (IOException exception) {
            cleanupFailedExport(output);
            call.reject(
                "The export could not be prepared. Check available storage and try again.",
                "EXPORT_WRITE_FAILED",
                exception
            );
        } catch (RuntimeException exception) {
            cleanupFailedExport(output);
            call.reject(
                "No compatible Android share or save destination is available.",
                "EXPORT_DESTINATION_UNAVAILABLE",
                exception
            );
        }
    }

    @ActivityCallback
    private void shareResult(PluginCall call, ActivityResult result) {
        File output = pendingFile;
        boolean cancelled = !shareTargetChosen;
        clearPendingState();

        if (output != null) {
            if (cancelled) {
                deleteQuietly(output);
            } else {
                cleanupHandler.postDelayed(() -> deleteQuietly(output), POST_SHARE_RETENTION_MILLIS);
            }
        }
        if (call == null) {
            return;
        }

        JSObject response = new JSObject();
        response.put("status", cancelled ? "cancelled" : "exported");
        call.resolve(response);
    }

    @Override
    protected void handleOnDestroy() {
        cleanupFailedExport(pendingFile);
        super.handleOnDestroy();
    }

    private IntentSender chooserIntentSender(String callbackId) {
        Intent chosen = new Intent(chooserAction())
            .setPackage(getContext().getPackageName())
            .putExtra(CALLBACK_ID_EXTRA, callbackId);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE;
        return PendingIntent
            .getBroadcast(getContext(), callbackId.hashCode(), chosen, flags)
            .getIntentSender();
    }

    private void registerChooserReceiver(String callbackId) {
        unregisterChooserReceiver();
        shareTargetChosen = false;
        chooserReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (
                    chooserAction().equals(intent.getAction()) &&
                    callbackId.equals(intent.getStringExtra(CALLBACK_ID_EXTRA)) &&
                    intent.hasExtra(Intent.EXTRA_CHOSEN_COMPONENT)
                ) {
                    shareTargetChosen = true;
                }
            }
        };
        ContextCompat.registerReceiver(
            getContext(),
            chooserReceiver,
            new IntentFilter(chooserAction()),
            ContextCompat.RECEIVER_NOT_EXPORTED
        );
    }

    private String chooserAction() {
        return getContext().getPackageName() + ".DNDTOOLS_SHARE_TARGET_CHOSEN";
    }

    private void unregisterChooserReceiver() {
        if (chooserReceiver == null) {
            return;
        }
        try {
            getContext().unregisterReceiver(chooserReceiver);
        } catch (IllegalArgumentException ignored) {
            // The receiver was already removed during Activity teardown.
        }
        chooserReceiver = null;
    }

    private void cleanupFailedExport(File output) {
        deleteQuietly(output);
        clearPendingState();
    }

    private void clearPendingState() {
        unregisterChooserReceiver();
        pendingFile = null;
        presenting = false;
        shareTargetChosen = false;
    }

    private File writeTemporaryFile(String filename, byte[] data) throws IOException {
        File directory = new File(getContext().getCacheDir(), EXPORT_DIRECTORY);
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IOException("Temporary export directory could not be created");
        }

        File exportDirectory = new File(directory, UUID.randomUUID().toString());
        if (!exportDirectory.mkdirs()) {
            throw new IOException("Temporary export directory could not be created");
        }
        File output = new File(exportDirectory, filename);
        try (FileOutputStream stream = new FileOutputStream(output)) {
            stream.write(data);
            stream.getFD().sync();
        } catch (IOException exception) {
            deleteQuietly(output);
            throw exception;
        }
        return output;
    }

    private static byte[] decodePayload(String encoded) {
        if (encoded == null || encoded.isEmpty()) {
            throw new IllegalArgumentException("Export data is required.");
        }
        String payload = encoded;
        if (payload.startsWith("data:")) {
            int separator = payload.indexOf(',');
            if (separator < 0 || !payload.substring(0, separator).contains(";base64")) {
                throw new IllegalArgumentException("Export data URL must contain base64 data.");
            }
            payload = payload.substring(separator + 1);
        }
        if ((long) payload.length() > ((MAX_EXPORT_BYTES + 2L) / 3L) * 4L + 8L) {
            throw new IllegalArgumentException("Android share exports are limited to 32 MiB. Remove large media or export from the desktop app.");
        }

        final byte[] decoded;
        try {
            decoded = Base64.decode(payload, Base64.DEFAULT);
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("Export data is not valid base64.", exception);
        }
        if (decoded.length > MAX_EXPORT_BYTES) {
            throw new IllegalArgumentException("Android share exports are limited to 32 MiB. Remove large media or export from the desktop app.");
        }
        return decoded;
    }

    private static String sanitizeFilename(String filename) {
        if (filename == null || filename.trim().isEmpty()) {
            throw new IllegalArgumentException("Export filename is required.");
        }
        String safe = filename.trim().replaceAll("[^A-Za-z0-9._ -]", "_");
        safe = safe.replaceAll("^[. ]+", "").replaceAll("[. ]+$", "");
        if (safe.isEmpty()) {
            throw new IllegalArgumentException("Export filename is invalid.");
        }
        if (safe.length() > 120) {
            int dot = safe.lastIndexOf('.');
            String extension = dot > 0 && safe.length() - dot <= 16 ? safe.substring(dot) : "";
            safe = safe.substring(0, 120 - extension.length()) + extension;
        }
        return safe;
    }

    private static String normalizeMimeType(String requested, String filename) {
        if (requested != null && requested.matches("^[A-Za-z0-9!#$&^_.+-]+/[A-Za-z0-9!#$&^_.+-]+$")) {
            return requested.toLowerCase(Locale.ROOT);
        }
        String extension = MimeTypeMap.getFileExtensionFromUrl(filename);
        String inferred = extension == null ? null : MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);
        return inferred == null ? "application/octet-stream" : inferred;
    }

    private void cleanupStaleExports() {
        File directory = new File(getContext().getCacheDir(), EXPORT_DIRECTORY);
        File[] files = directory.listFiles();
        if (files == null) {
            return;
        }
        long cutoff = System.currentTimeMillis() - STALE_EXPORT_AGE_MILLIS;
        for (File entry : files) {
            if (entry.lastModified() < cutoff) {
                deleteRecursively(entry);
            }
        }
    }

    private static void deleteQuietly(File file) {
        if (file == null) {
            return;
        }
        File parent = file.getParentFile();
        if (file.exists() && !file.delete()) {
            file.deleteOnExit();
        }
        if (parent != null && parent.getName().matches("[0-9a-fA-F-]{36}")) {
            File[] remaining = parent.listFiles();
            if ((remaining == null || remaining.length == 0) && !parent.delete()) {
                parent.deleteOnExit();
            }
        }
    }

    private static void deleteRecursively(File entry) {
        if (entry.isDirectory()) {
            File[] children = entry.listFiles();
            if (children != null) {
                for (File child : children) {
                    deleteRecursively(child);
                }
            }
        }
        if (entry.exists() && !entry.delete()) {
            entry.deleteOnExit();
        }
    }
}
