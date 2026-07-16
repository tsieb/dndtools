package com.dndtools.gm.plugins;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.fail;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import org.junit.Test;

public class AesGcmCodecTest {

    private final AesGcmCodec codec = new AesGcmCodec();

    @Test
    public void roundTripPreservesPlaintext() throws Exception {
        SecretKey key = newKey();
        byte[] plaintext = "vault-refresh-token".getBytes(StandardCharsets.UTF_8);

        byte[] encrypted = codec.encrypt(key, plaintext);

        assertArrayEquals(plaintext, codec.decrypt(key, encrypted));
    }

    @Test
    public void tamperingFailsAuthentication() throws Exception {
        SecretKey key = newKey();
        byte[] encrypted = codec.encrypt(key, "secret".getBytes(StandardCharsets.UTF_8));
        encrypted[encrypted.length - 1] ^= 0x01;

        expectDecryptionFailure(key, encrypted);
    }

    @Test
    public void aDifferentKeyCannotDecrypt() throws Exception {
        byte[] encrypted = codec.encrypt(newKey(), "secret".getBytes(StandardCharsets.UTF_8));

        expectDecryptionFailure(newKey(), encrypted);
    }

    @Test
    public void associatedDataBindsCiphertextToItsLogicalName() throws Exception {
        SecretKey key = newKey();
        byte[] encrypted = codec.encrypt(
            key,
            "secret".getBytes(StandardCharsets.UTF_8),
            "refresh-token".getBytes(StandardCharsets.UTF_8)
        );

        try {
            codec.decrypt(key, encrypted, "account-id".getBytes(StandardCharsets.UTF_8));
            fail("Expected a ciphertext moved to another credential namespace to fail");
        } catch (GeneralSecurityException expected) {
            // Expected.
        }
    }

    @Test
    public void truncatedAndUnknownFormatsAreRejected() throws Exception {
        SecretKey key = newKey();
        expectDecryptionFailure(key, new byte[] { 1, 2, 3 });

        byte[] encrypted = codec.encrypt(key, "secret".getBytes(StandardCharsets.UTF_8));
        encrypted[0] = 9;
        expectDecryptionFailure(key, encrypted);
    }

    private void expectDecryptionFailure(SecretKey key, byte[] encrypted) throws Exception {
        try {
            codec.decrypt(key, encrypted);
            fail("Expected authenticated decryption to fail");
        } catch (GeneralSecurityException expected) {
            // Expected.
        }
    }

    private static SecretKey newKey() throws Exception {
        KeyGenerator generator = KeyGenerator.getInstance("AES");
        generator.init(256);
        return generator.generateKey();
    }
}
