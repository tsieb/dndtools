package com.dndtools.gm.plugins;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.security.GeneralSecurityException;
import org.json.JSONObject;

@CapacitorPlugin(name = "DndtoolsSecureStore")
public final class DndtoolsSecureStorePlugin extends Plugin {

    private AndroidKeystoreSecretStore store;

    @Override
    public void load() {
        store = new AndroidKeystoreSecretStore(getContext());
    }

    @PluginMethod
    public void get(PluginCall call) {
        String key = call.getString("key");
        try {
            String value = store.get(key);
            JSObject result = new JSObject();
            result.put("value", value == null ? JSONObject.NULL : value);
            call.resolve(result);
        } catch (IllegalArgumentException exception) {
            call.reject(exception.getMessage(), "INVALID_ARGUMENT", exception);
        } catch (GeneralSecurityException exception) {
            call.reject("Secure storage data could not be decrypted.", "SECURE_STORE_READ_FAILED", exception);
        }
    }

    @PluginMethod
    public void set(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");
        try {
            store.set(key, value);
            call.resolve(okResult());
        } catch (IllegalArgumentException exception) {
            call.reject(exception.getMessage(), "INVALID_ARGUMENT", exception);
        } catch (GeneralSecurityException exception) {
            call.reject("Secure storage data could not be encrypted.", "SECURE_STORE_WRITE_FAILED", exception);
        }
    }

    @PluginMethod
    public void delete(PluginCall call) {
        String key = call.getString("key");
        try {
            store.delete(key);
            call.resolve(okResult());
        } catch (IllegalArgumentException exception) {
            call.reject(exception.getMessage(), "INVALID_ARGUMENT", exception);
        } catch (GeneralSecurityException exception) {
            call.reject("Secure storage data could not be deleted.", "SECURE_STORE_WRITE_FAILED", exception);
        }
    }

    @PluginMethod
    public void clear(PluginCall call) {
        try {
            store.clear();
            call.resolve(okResult());
        } catch (GeneralSecurityException exception) {
            call.reject("Secure storage data could not be cleared.", "SECURE_STORE_WRITE_FAILED", exception);
        }
    }

    @PluginMethod
    public void keys(PluginCall call) {
        JSObject result = new JSObject();
        result.put("keys", store.keys());
        call.resolve(result);
    }

    private static JSObject okResult() {
        JSObject result = new JSObject();
        result.put("ok", true);
        return result;
    }
}
