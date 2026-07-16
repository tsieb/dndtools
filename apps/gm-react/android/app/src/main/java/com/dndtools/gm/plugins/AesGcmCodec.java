package com.dndtools.gm.plugins;

import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class AesGcmCodec {

    private static final byte FORMAT_VERSION = 2;
    private static final int IV_LENGTH_BYTES = 12;
    private static final int TAG_LENGTH_BITS = 128;

    private final SecureRandom secureRandom;

    AesGcmCodec() {
        this(new SecureRandom());
    }

    AesGcmCodec(SecureRandom secureRandom) {
        this.secureRandom = secureRandom;
    }

    byte[] encrypt(SecretKey key, byte[] plaintext) throws GeneralSecurityException {
        return encrypt(key, plaintext, new byte[0]);
    }

    byte[] encrypt(SecretKey key, byte[] plaintext, byte[] associatedData) throws GeneralSecurityException {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        // Android Keystore keys created with randomized encryption reject caller-provided IVs.
        // Let the selected crypto provider generate the nonce, then persist it with the ciphertext.
        cipher.init(Cipher.ENCRYPT_MODE, key, secureRandom);
        byte[] iv = cipher.getIV();
        if (iv == null || iv.length != IV_LENGTH_BYTES) {
            throw new GeneralSecurityException("AES-GCM provider returned an invalid IV");
        }
        cipher.updateAAD(associatedData);
        byte[] ciphertext = cipher.doFinal(plaintext);

        byte[] encoded = new byte[1 + iv.length + ciphertext.length];
        encoded[0] = FORMAT_VERSION;
        System.arraycopy(iv, 0, encoded, 1, iv.length);
        System.arraycopy(ciphertext, 0, encoded, 1 + iv.length, ciphertext.length);
        return encoded;
    }

    byte[] decrypt(SecretKey key, byte[] encoded) throws GeneralSecurityException {
        return decrypt(key, encoded, new byte[0]);
    }

    byte[] decrypt(SecretKey key, byte[] encoded, byte[] associatedData) throws GeneralSecurityException {
        if (encoded == null || encoded.length < 1 + IV_LENGTH_BYTES + TAG_LENGTH_BITS / 8) {
            throw new GeneralSecurityException("Encrypted value is truncated");
        }
        if (encoded[0] != FORMAT_VERSION) {
            throw new GeneralSecurityException("Unsupported encrypted value format");
        }

        byte[] iv = Arrays.copyOfRange(encoded, 1, 1 + IV_LENGTH_BYTES);
        byte[] ciphertext = Arrays.copyOfRange(encoded, 1 + IV_LENGTH_BYTES, encoded.length);

        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_LENGTH_BITS, iv));
        cipher.updateAAD(associatedData);
        return cipher.doFinal(ciphertext);
    }
}
