package com.dndtools.gm.plugins;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import androidx.annotation.Nullable;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;

final class AndroidKeystoreSecretStore {

    static final String DEFAULT_KEY_ALIAS = "dndtools-secure-store-v1";
    static final String DEFAULT_PREFERENCES_NAME = "dndtools_secure_store";

    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";
    private static final int MAX_KEY_LENGTH = 512;

    private final SharedPreferences preferences;
    private final String keyAlias;
    private final AesGcmCodec codec;

    AndroidKeystoreSecretStore(Context context) {
        this(context, DEFAULT_PREFERENCES_NAME, DEFAULT_KEY_ALIAS);
    }

    AndroidKeystoreSecretStore(Context context, String preferencesName, String keyAlias) {
        this.preferences = context.getApplicationContext().getSharedPreferences(preferencesName, Context.MODE_PRIVATE);
        this.keyAlias = keyAlias;
        this.codec = new AesGcmCodec();
    }

    synchronized void set(String key, String value) throws GeneralSecurityException {
        validateKey(key);
        if (value == null) {
            throw new IllegalArgumentException("Secure storage value is required");
        }

        byte[] encrypted = codec.encrypt(
            getOrCreateKey(),
            value.getBytes(StandardCharsets.UTF_8),
            key.getBytes(StandardCharsets.UTF_8)
        );
        String encoded = Base64.encodeToString(encrypted, Base64.NO_WRAP);
        if (!preferences.edit().putString(preferenceKey(key), encoded).commit()) {
            throw new GeneralSecurityException("Encrypted preferences could not be written");
        }
    }

    @Nullable
    synchronized String get(String key) throws GeneralSecurityException {
        validateKey(key);
        String encoded = preferences.getString(preferenceKey(key), null);
        if (encoded == null) {
            return null;
        }

        try {
            byte[] encrypted = Base64.decode(encoded, Base64.DEFAULT);
            return new String(
                codec.decrypt(getOrCreateKey(), encrypted, key.getBytes(StandardCharsets.UTF_8)),
                StandardCharsets.UTF_8
            );
        } catch (IllegalArgumentException exception) {
            throw new GeneralSecurityException("Encrypted value is malformed", exception);
        }
    }

    synchronized void delete(String key) throws GeneralSecurityException {
        validateKey(key);
        if (!preferences.edit().remove(preferenceKey(key)).commit()) {
            throw new GeneralSecurityException("Encrypted preferences could not be updated");
        }
    }

    synchronized void clear() throws GeneralSecurityException {
        if (!preferences.edit().clear().commit()) {
            throw new GeneralSecurityException("Encrypted preferences could not be cleared");
        }
    }

    synchronized List<String> keys() {
        List<String> keys = new ArrayList<>();
        for (String encoded : preferences.getAll().keySet()) {
            try {
                keys.add(new String(Base64.decode(encoded, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING), StandardCharsets.UTF_8));
            } catch (IllegalArgumentException ignored) {
                // Ignore entries that were not written by this store.
            }
        }
        Collections.sort(keys);
        return keys;
    }

    private SecretKey getOrCreateKey() throws GeneralSecurityException {
        KeyStore keyStore = KeyStore.getInstance(ANDROID_KEYSTORE);
        try {
            keyStore.load(null);
        } catch (java.io.IOException exception) {
            throw new GeneralSecurityException("Android Keystore could not be loaded", exception);
        } catch (java.security.cert.CertificateException exception) {
            throw new GeneralSecurityException("Android Keystore certificates could not be loaded", exception);
        }

        java.security.Key existing = keyStore.getKey(keyAlias, null);
        if (existing instanceof SecretKey) {
            return (SecretKey) existing;
        }
        if (existing != null) {
            throw new GeneralSecurityException("Android Keystore alias has an unexpected key type");
        }

        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE);
        generator.init(
            new KeyGenParameterSpec.Builder(
                keyAlias,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setRandomizedEncryptionRequired(true)
                .build()
        );
        return generator.generateKey();
    }

    static String preferenceKey(String key) {
        validateKey(key);
        return Base64.encodeToString(key.getBytes(StandardCharsets.UTF_8), Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
    }

    private static void validateKey(String key) {
        if (key == null || key.trim().isEmpty()) {
            throw new IllegalArgumentException("Secure storage key is required");
        }
        if (key.length() > MAX_KEY_LENGTH) {
            throw new IllegalArgumentException("Secure storage key is too long");
        }
    }
}
