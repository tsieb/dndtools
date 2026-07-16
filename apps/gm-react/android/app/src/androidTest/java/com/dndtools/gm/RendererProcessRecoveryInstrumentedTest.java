package com.dndtools.gm;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNotSame;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import android.app.Activity;
import android.app.Application;
import android.app.Instrumentation;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Process;
import android.os.SystemClock;
import android.webkit.WebView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.filters.SdkSuppress;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import androidx.webkit.WebViewRenderProcess;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.After;
import org.junit.Assume;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
@SdkSuppress(minSdkVersion = Build.VERSION_CODES.O)
public class RendererProcessRecoveryInstrumentedTest {

    private static final long WEBVIEW_TIMEOUT_MILLIS = 30_000;

    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private MainActivity launchedActivity;
    private MainActivity recoveredActivity;

    @After
    public void finishActivities() {
        instrumentation.runOnMainSync(() -> {
            if (recoveredActivity != null && !recoveredActivity.isFinishing()) {
                recoveredActivity.finishAndRemoveTask();
            }
            if (
                launchedActivity != null &&
                !launchedActivity.isDestroyed() &&
                !launchedActivity.isFinishing()
            ) {
                launchedActivity.finishAndRemoveTask();
            }
        });
    }

    @Test
    public void rendererTerminationRecreatesActivityAndLiveWebViewWithoutKillingApp() throws Exception {
        Assume.assumeTrue(
            "The installed WebView does not expose renderer lookup",
            WebViewFeature.isFeatureSupported(WebViewFeature.GET_WEB_VIEW_RENDERER)
        );
        Assume.assumeTrue(
            "The installed WebView cannot terminate a renderer for this acceptance test",
            WebViewFeature.isFeatureSupported(WebViewFeature.WEB_VIEW_RENDERER_TERMINATE)
        );

        Intent intent = new Intent(
            instrumentation.getTargetContext(),
            MainActivity.class
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        launchedActivity = (MainActivity) instrumentation.startActivitySync(intent);
        assertNotNull(launchedActivity);

        WebView launchedWebView = waitForLiveWebView(launchedActivity);
        WebViewRenderProcess launchedRenderer = getRendererOnMain(launchedWebView);
        assertNotNull(launchedRenderer);

        int appProcessId = Process.myPid();
        CountDownLatch recoveredActivityCreated = new CountDownLatch(1);
        AtomicReference<MainActivity> recoveredActivityReference = new AtomicReference<>();
        Application application = (Application) instrumentation
            .getTargetContext()
            .getApplicationContext();
        Application.ActivityLifecycleCallbacks callbacks = new EmptyActivityLifecycleCallbacks() {
            @Override
            public void onActivityCreated(Activity activity, Bundle savedInstanceState) {
                if (activity instanceof MainActivity && activity != launchedActivity) {
                    recoveredActivityReference.compareAndSet(null, (MainActivity) activity);
                    recoveredActivityCreated.countDown();
                }
            }
        };
        application.registerActivityLifecycleCallbacks(callbacks);

        try {
            AtomicReference<Boolean> terminationResult = new AtomicReference<>(false);
            instrumentation.runOnMainSync(() ->
                terminationResult.set(launchedRenderer.terminate())
            );
            assertTrue("WebView refused the renderer termination request", terminationResult.get());

            assertTrue(
                "MainActivity was not recreated after renderer termination",
                recoveredActivityCreated.await(WEBVIEW_TIMEOUT_MILLIS, TimeUnit.MILLISECONDS)
            );
            recoveredActivity = recoveredActivityReference.get();
            assertNotNull(recoveredActivity);
            assertNotSame(launchedActivity, recoveredActivity);

            WebView recoveredWebView = waitForLiveWebView(recoveredActivity);
            assertNotSame(launchedWebView, recoveredWebView);
            instrumentation.runOnMainSync(() -> {
                assertFalse(recoveredActivity.isFinishing());
                assertFalse(recoveredActivity.isDestroyed());
                assertTrue(recoveredWebView.isAttachedToWindow());
            });
            assertNotNull(getRendererOnMain(recoveredWebView));
            assertTrue("The application process changed", appProcessId == Process.myPid());
        } finally {
            application.unregisterActivityLifecycleCallbacks(callbacks);
        }
    }

    private WebView waitForLiveWebView(MainActivity activity) {
        long deadline = SystemClock.uptimeMillis() + WEBVIEW_TIMEOUT_MILLIS;
        while (SystemClock.uptimeMillis() < deadline) {
            AtomicReference<WebView> webViewReference = new AtomicReference<>();
            instrumentation.runOnMainSync(() -> {
                if (activity.getBridge() == null) {
                    return;
                }
                WebView webView = activity.getBridge().getWebView();
                if (
                    webView != null &&
                    webView.isAttachedToWindow() &&
                    webView.getUrl() != null &&
                    WebViewCompat.getWebViewRenderProcess(webView) != null
                ) {
                    webViewReference.set(webView);
                }
            });
            if (webViewReference.get() != null) {
                return webViewReference.get();
            }
            SystemClock.sleep(100);
        }
        fail("A live Capacitor WebView did not become available");
        return null;
    }

    private WebViewRenderProcess getRendererOnMain(WebView webView) {
        AtomicReference<WebViewRenderProcess> rendererReference = new AtomicReference<>();
        instrumentation.runOnMainSync(() ->
            rendererReference.set(WebViewCompat.getWebViewRenderProcess(webView))
        );
        return rendererReference.get();
    }

    private abstract static class EmptyActivityLifecycleCallbacks
        implements Application.ActivityLifecycleCallbacks {

        @Override
        public void onActivityStarted(Activity activity) {}

        @Override
        public void onActivityResumed(Activity activity) {}

        @Override
        public void onActivityPaused(Activity activity) {}

        @Override
        public void onActivityStopped(Activity activity) {}

        @Override
        public void onActivitySaveInstanceState(Activity activity, Bundle outState) {}

        @Override
        public void onActivityDestroyed(Activity activity) {}
    }
}
