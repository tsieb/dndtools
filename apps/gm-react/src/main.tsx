import { createRoot } from 'react-dom/client';
import './styles/index.css';
import { Toaster } from './ds';
import { App } from './App';
import { captureGoogleAuthRedirect } from './cloud/googleDocs';
import { hydrateAiProviderKey } from './ai/providerConfig';

// A popup-blocked Google sign-in returns with the OAuth token in the URL FRAGMENT, which HashRouter
// would consume as a route — capture it (and restore the real route) before the router mounts.
captureGoogleAuthRedirect();

// Desktop only: load the OS-encrypted AI provider key back into memory so a returning user's
// assistant is configured without re-pasting. Best-effort and async — the UI reads it on demand.
void hydrateAiProviderKey();

// Safety net for a durable-write failure: `SceneRuntime.dispatch` rolls back and RE-THROWS on a persist
// failure (PLAT-018), so a caller that only inspects `result.status` would let it escape as an unhandled
// rejection with no user feedback. Surface it as a toast instead of failing silently.
window.addEventListener('unhandledrejection', () => {
	Toaster.error('Something didn’t save — please try that again.');
});

// Demo build (`VITE_DEMO_MODE=1`): open straight into the populated sample campaign instead of the
// first-run onboarding overlay, so the standalone demo boots into an immediately-usable, seeded state.
// The demo content itself is produced at runtime by `SceneRuntime.load` → `seedDemoContent` (it fills
// an empty vault whenever "Start fresh" was never chosen); all this flag does is skip the overlay that
// would otherwise sit in front of it. Only writes when the visitor has made no prior choice, so a real
// interaction on this origin is never overridden.
if (import.meta.env.VITE_DEMO_MODE === '1') {
	try {
		if (window.localStorage.getItem('dndtools:react:onboarded') === null) {
			window.localStorage.setItem('dndtools:react:onboarded', 'done');
		}
	} catch {
		/* private mode: the overlay just shows first — the app is still fully usable from there */
	}
}

const container = document.getElementById('root');
if (!container) throw new Error('Root container #root not found');
createRoot(container).render(<App />);
