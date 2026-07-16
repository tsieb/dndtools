package com.dndtools.gm.plugins;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import java.util.Arrays;
import javax.crypto.SecretKey;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class AndroidKeystoreSecretStoreInstrumentedTest {

    private static final String KEY_ALIAS = "dndtools-secure-store-instrumentation";
    private static final String PREFERENCES = "dndtools_secure_store_instrumentation";

    private Context context;
    private AndroidKeystoreSecretStore store;

    @Before
    public void setUp() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        removeTestData();
        store = new AndroidKeystoreSecretStore(context, PREFERENCES, KEY_ALIAS);
    }

    @After
    public void tearDown() throws Exception {
        removeTestData();
    }

    @Test
    public void valuesAreEncryptedAndCanBeManaged() throws Exception {
        store.set("refresh-token", "top-secret-value");
        store.set("account-id", "account-123");

        assertEquals("top-secret-value", store.get("refresh-token"));
        assertEquals(Arrays.asList("account-id", "refresh-token"), store.keys());

        SharedPreferences preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
        String stored = preferences.getString(AndroidKeystoreSecretStore.preferenceKey("refresh-token"), "");
        assertFalse(stored.contains("top-secret-value"));

        store.delete("refresh-token");
        assertNull(store.get("refresh-token"));
        store.clear();
        assertTrue(store.keys().isEmpty());
    }

    @Test
    public void keystoreKeyIsNonExportable() throws Exception {
        store.set("refresh-token", "secret");

        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        SecretKey key = (SecretKey) keyStore.getKey(KEY_ALIAS, null);

        assertNull(key.getEncoded());
    }

    @Test
    public void valuesSurviveStoreRecreation() throws Exception {
        store.set("refresh-token", "persistent-secret");

        AndroidKeystoreSecretStore recreated = new AndroidKeystoreSecretStore(
            context,
            PREFERENCES,
            KEY_ALIAS
        );

        assertEquals("persistent-secret", recreated.get("refresh-token"));
    }

    @Test
    public void tamperedCiphertextFailsClosed() throws Exception {
        store.set("refresh-token", "secret");
        String preferenceKey = AndroidKeystoreSecretStore.preferenceKey("refresh-token");
        SharedPreferences preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
        byte[] encrypted = Base64.decode(preferences.getString(preferenceKey, ""), Base64.DEFAULT);
        encrypted[encrypted.length - 1] ^= 0x01;
        preferences.edit().putString(preferenceKey, Base64.encodeToString(encrypted, Base64.NO_WRAP)).commit();

        try {
            store.get("refresh-token");
            fail("Expected authenticated decryption to reject tampered ciphertext");
        } catch (GeneralSecurityException expected) {
            // Expected.
        }
    }

    @Test
    public void ciphertextCannotBeMovedBetweenCredentialNames() throws Exception {
        store.set("refresh-token", "refresh-secret");
        store.set("account-id", "account-secret");
        SharedPreferences preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
        String refresh = preferences.getString(
            AndroidKeystoreSecretStore.preferenceKey("refresh-token"),
            ""
        );
        preferences
            .edit()
            .putString(AndroidKeystoreSecretStore.preferenceKey("account-id"), refresh)
            .commit();

        try {
            store.get("account-id");
            fail("Expected moved ciphertext to fail associated-data authentication");
        } catch (GeneralSecurityException expected) {
            // Expected.
        }
    }

    private void removeTestData() throws Exception {
        if (context != null) {
            context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).edit().clear().commit();
        }
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        if (keyStore.containsAlias(KEY_ALIAS)) {
            keyStore.deleteEntry(KEY_ALIAS);
        }
    }
}
