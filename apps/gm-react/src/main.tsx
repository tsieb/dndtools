import { createRoot } from 'react-dom/client';
import type { ReactNode } from 'react';
import './styles/index.css';
import { Toaster } from './ds';
import { App } from './App';
import { hydrateAiProviderKey } from './ai/providerConfig';
import { bindWindowChromeTheme } from './platform/windowChrome';
import { StandaloneSceneDisplay } from './screens/SceneDisplay';

// Synchronize the browser/native title surface before React paints, then follow live theme changes.
bindWindowChromeTheme();

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
const nativeDisplay = Boolean(
	(globalThis as typeof globalThis & { dndtoolsSceneDisplay?: boolean }).dndtoolsSceneDisplay,
);
const nativeTitle = nativeDisplay ? 'Scene display' : 'DND Tools GM';

const render = (app: ReactNode) =>
	createRoot(container).render(
		<>
			<div className="electron-titlebar" aria-hidden="true">
				<span>{nativeTitle}</span>
			</div>
			{app}
		</>,
	);

// Desktop only: finish loading the OS-encrypted provider key before the Settings tree can read it.
// The operation is a no-op on the web and handles its own failure, so startup never depends on a
// credential store; this only prevents a returning desktop user from briefly seeing “Not configured.”
if (nativeDisplay) render(<StandaloneSceneDisplay />);
else {
	const hydrationTimeout = new Promise<void>((resolve) => window.setTimeout(resolve, 3000));
	void Promise.race([hydrateAiProviderKey(), hydrationTimeout]).finally(() => render(<App />));
}
