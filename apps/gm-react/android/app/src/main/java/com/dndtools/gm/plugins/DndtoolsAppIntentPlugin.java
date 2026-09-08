package com.dndtools.gm.plugins;

import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.text.TextUtils;
import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/**
 * RC-PLT-2.2 — the ONE seam for intents that carry work into the app: a file shared to Lamplight
 * from another Android app, and a home-screen shortcut's route.
 *
 * The plugin only READS and forwards. It applies nothing: the renderer re-validates the route
 * against its own allow-list and re-parses the payload with the core's parsers, and a shared file
 * never enters the vault without the DM confirming the review.
 *
 * A pending intent is delivered exactly once. `consumePendingIntent` drains whatever arrived before
 * the WebView finished booting; everything after that arrives as an `appIntent` event.
 */
@CapacitorPlugin(name = "DndtoolsAppIntent")
public final class DndtoolsAppIntentPlugin extends Plugin {

    private static final String LOG_TAG = "DndtoolsAppIntent";
    private static final String ROUTE_EXTRA = "dndtools_route";
    private static final String EVENT = "appIntent";
    /** Matches MAX_SHARED_IMPORT_BYTES in platform/capabilities.ts. */
    private static final int MAX_SHARED_BYTES = 8 * 1024 * 1024;

    private JSObject pending;

    @Override
    public void load() {
        if (getActivity() != null) {
            pending = readIntent(getActivity().getIntent());
        }
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        JSObject parsed = readIntent(intent);
        if (parsed == null) {
            return;
        }
        if (hasListeners(EVENT)) {
            notifyListeners(EVENT, parsed);
        } else {
            // The WebView is not listening yet (cold start via a shortcut). Hold it for the drain.
            pending = parsed;
        }
    }

    @PluginMethod
    public void consumePendingIntent(PluginCall call) {
        JSObject drained = pending;
        pending = null;
        call.resolve(drained == null ? emptyIntent() : drained);
    }

    /** An absent route or share is an ABSENT key, never a JSON null: the renderer treats both the
     *  same, and omitting them keeps the bridge payload free of null-typed members. */
    private static JSObject emptyIntent() {
        return new JSObject();
    }

    /** Null when the intent carries neither a route nor a readable shared payload. */
    private JSObject readIntent(Intent intent) {
        if (intent == null) {
            return null;
        }
        String route = intent.getStringExtra(ROUTE_EXTRA);
        JSObject share = readShare(intent);
        if (TextUtils.isEmpty(route) && share == null) {
            return null;
        }
        JSObject result = new JSObject();
        if (!TextUtils.isEmpty(route)) {
            result.put("route", route);
        }
        if (share != null) {
            result.put("share", share);
        }
        // Consume it, so a configuration change or a later drain cannot replay the same share.
        intent.removeExtra(ROUTE_EXTRA);
        intent.removeExtra(Intent.EXTRA_STREAM);
        intent.removeExtra(Intent.EXTRA_TEXT);
        return result;
    }

    private JSObject readShare(Intent intent) {
        if (!Intent.ACTION_SEND.equals(intent.getAction()) && !Intent.ACTION_VIEW.equals(intent.getAction())) {
            return null;
        }
        Uri stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        if (stream == null && Intent.ACTION_VIEW.equals(intent.getAction())) {
            stream = intent.getData();
        }
        if (stream != null) {
            return readStream(stream, intent.getType());
        }
        // Some apps share a document's text rather than a file handle.
        CharSequence text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        if (text == null || text.length() == 0 || text.length() > MAX_SHARED_BYTES) {
            return null;
        }
        return share("Shared text", intent.getType(), text.toString());
    }

    private JSObject readStream(Uri uri, String declaredType) {
        ContentResolver resolver = getContext().getContentResolver();
        try (InputStream input = resolver.openInputStream(uri)) {
            if (input == null) {
                return null;
            }
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[64 * 1024];
            int read;
            while ((read = input.read(chunk)) != -1) {
                if (buffer.size() + read > MAX_SHARED_BYTES) {
                    Log.w(LOG_TAG, "Shared file exceeds the import ceiling; ignoring it");
                    return null;
                }
                buffer.write(chunk, 0, read);
            }
            String text = new String(buffer.toByteArray(), StandardCharsets.UTF_8);
            // A file whose bytes are not UTF-8 text cannot be a Lamplight module; say nothing
            // rather than hand the renderer replacement characters to fail on.
            if (text.indexOf('\uFFFD') >= 0) {
                return null;
            }
            String type = declaredType != null ? declaredType : resolver.getType(uri);
            return share(displayName(resolver, uri), type, text);
        } catch (IOException | SecurityException | RuntimeException error) {
            Log.w(LOG_TAG, "Shared file could not be read", error);
            return null;
        }
    }

    private static JSObject share(String filename, String mimeType, String text) {
        JSObject payload = new JSObject();
        payload.put("filename", filename);
        payload.put("mimeType", mimeType == null ? "" : mimeType);
        payload.put("text", text);
        return payload;
    }

    private static String displayName(ContentResolver resolver, Uri uri) {
        try (Cursor cursor = resolver.query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int column = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (column >= 0) {
                    String name = cursor.getString(column);
                    if (!TextUtils.isEmpty(name)) {
                        return name;
                    }
                }
            }
        } catch (RuntimeException ignored) {
            // Providers may refuse the metadata query while still allowing the read.
        }
        String last = uri.getLastPathSegment();
        return TextUtils.isEmpty(last) ? "Shared file" : last;
    }
}
