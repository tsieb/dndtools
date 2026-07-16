package com.dndtools.gm;

import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.ViewGroup;
import android.view.ViewParent;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.dndtools.gm.plugins.DndtoolsFileExportPlugin;
import com.dndtools.gm.plugins.DndtoolsSecureStorePlugin;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import java.util.concurrent.atomic.AtomicBoolean;

public class MainActivity extends BridgeActivity {

    private static final String LOG_TAG = "DndtoolsMainActivity";
    private final AtomicBoolean rendererRecoveryStarted = new AtomicBoolean(false);

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        bridgeBuilder.addWebViewListener(
            new WebViewListener() {
                @Override
                public boolean onRenderProcessGone(WebView webView, RenderProcessGoneDetail detail) {
                    recoverFromRendererLoss(webView, detail);
                    return true;
                }
            }
        );
        registerPlugin(DndtoolsSecureStorePlugin.class);
        registerPlugin(DndtoolsFileExportPlugin.class);
        super.onCreate(savedInstanceState);

        if (getBridge() == null || getBridge().getWebView() == null) {
            return;
        }

        WebSettings settings = getBridge().getWebView().getSettings();
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(true);
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.START_SAFE_BROWSING)) {
            WebViewCompat.startSafeBrowsing(
                getApplicationContext(),
                initialized -> {
                    if (!initialized) {
                        Log.e(LOG_TAG, "WebView Safe Browsing could not be initialized");
                    }
                }
            );
        }
    }

    private void recoverFromRendererLoss(WebView deadWebView, RenderProcessGoneDetail detail) {
        if (!rendererRecoveryStarted.compareAndSet(false, true)) {
            return;
        }

        Runnable recovery = () -> {
            boolean rendererCrashed = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && detail.didCrash();
            Log.e(
                LOG_TAG,
                rendererCrashed
                    ? "Android WebView renderer crashed; recreating the activity"
                    : "Android terminated the WebView renderer; recreating the activity"
            );

            // Stop Capacitor before destroying its WebView so the old activity cannot dispatch
            // subsequent lifecycle events into a renderer that no longer exists.
            if (bridge != null) {
                try {
                    bridge.onDestroy();
                } catch (RuntimeException error) {
                    Log.e(LOG_TAG, "Failed to tear down the dead Capacitor bridge", error);
                } finally {
                    bridge = null;
                }
            }

            ViewParent parent = deadWebView.getParent();
            if (parent instanceof ViewGroup) {
                ((ViewGroup) parent).removeView(deadWebView);
            }
            deadWebView.destroy();

            // Defer recreation until after WebViewClient returns from onRenderProcessGone.
            new Handler(Looper.getMainLooper()).post(() -> {
                if (!isFinishing() && !isDestroyed()) {
                    recreate();
                }
            });
        };

        if (Looper.myLooper() == Looper.getMainLooper()) {
            recovery.run();
        } else {
            new Handler(Looper.getMainLooper()).post(recovery);
        }
    }
}
