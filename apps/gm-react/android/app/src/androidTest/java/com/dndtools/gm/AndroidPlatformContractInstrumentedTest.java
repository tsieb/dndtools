package com.dndtools.gm;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.ProviderInfo;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.security.NetworkSecurityPolicy;
import androidx.core.content.FileProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class AndroidPlatformContractInstrumentedTest {

    private final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();

    @Test
    public void cleartextTrafficAndEmbeddedHttpsHandlersFailClosed() {
        assertFalse(NetworkSecurityPolicy.getInstance().isCleartextTrafficPermitted());

        Intent external = new Intent(Intent.ACTION_VIEW, Uri.parse("https://example.com/dndtools"));
        List<android.content.pm.ResolveInfo> handlers = context
            .getPackageManager()
            .queryIntentActivities(external, PackageManager.MATCH_DEFAULT_ONLY);
        for (android.content.pm.ResolveInfo handler : handlers) {
            assertNotEquals(context.getPackageName(), handler.activityInfo.packageName);
        }
    }

    @Test
    public void shareProviderIsPrivateAndServesOnlyTemporaryExports() throws Exception {
        PackageInfo packageInfo = context
            .getPackageManager()
            .getPackageInfo(context.getPackageName(), PackageManager.GET_PROVIDERS);
        assertNotNull(packageInfo.providers);
        ProviderInfo exportProvider = null;
        for (ProviderInfo provider : packageInfo.providers) {
            if ((context.getPackageName() + ".fileprovider").equals(provider.authority)) {
                exportProvider = provider;
                break;
            }
        }
        assertNotNull(exportProvider);
        assertFalse(exportProvider.exported);
        assertTrue(exportProvider.grantUriPermissions);

        File directory = new File(context.getCacheDir(), "dndtools-exports");
        assertTrue(directory.exists() || directory.mkdirs());
        File uniqueDirectory = new File(directory, UUID.randomUUID().toString());
        assertTrue(uniqueDirectory.mkdirs());
        String requestedFilename = "instrumentation-export.txt";
        File export = new File(uniqueDirectory, requestedFilename);
        try (FileOutputStream stream = new FileOutputStream(export)) {
            stream.write("share-contract".getBytes(StandardCharsets.UTF_8));
        }

        Uri uri = FileProvider.getUriForFile(
            context,
            context.getPackageName() + ".fileprovider",
            export
        );
        assertEquals("content", uri.getScheme());
        try (
            Cursor cursor = context
                .getContentResolver()
                .query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)
        ) {
            assertNotNull(cursor);
            assertTrue(cursor.moveToFirst());
            assertEquals(requestedFilename, cursor.getString(0));
        }
        try (InputStream stream = context.getContentResolver().openInputStream(uri)) {
            assertNotNull(stream);
            byte[] bytes = new byte[32];
            int byteCount = stream.read(bytes);
            assertEquals("share-contract", new String(bytes, 0, byteCount, StandardCharsets.UTF_8));
        } finally {
            assertTrue(export.delete() || !export.exists());
            assertTrue(uniqueDirectory.delete() || !uniqueDirectory.exists());
        }
    }
}
