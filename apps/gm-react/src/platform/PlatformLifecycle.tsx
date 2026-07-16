import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useRuntime } from '../runtime/RuntimeContext';
import { handlePlatformBack } from './backNavigation';
import {
	bindPlatformLifecycle,
	getPlatformCapabilities,
	minimizeAndroidApp,
	openExternalUrl,
} from './capabilities';

type RefreshHandler = () => void | Promise<void>;
const refreshHandlers = new Set<RefreshHandler>();
let refreshInFlight: Promise<void> | null = null;

/** Native integrations may subscribe to resume without importing the Capacitor App plugin. */
export function registerPlatformStateRefresh(handler: RefreshHandler): () => void {
	refreshHandlers.add(handler);
	return () => refreshHandlers.delete(handler);
}

export async function refreshPlatformState(): Promise<void> {
	if (refreshInFlight) return refreshInFlight;
	refreshInFlight = Promise.allSettled(
		[...refreshHandlers].map((handler) => Promise.resolve(handler())),
	).then(() => undefined);
	try {
		await refreshInFlight;
	} finally {
		refreshInFlight = null;
	}
}

/** Test-only reset for the module-scoped lifecycle registry. */
export function resetPlatformStateRefreshHandlersForTest(): void {
	refreshHandlers.clear();
	refreshInFlight = null;
}

/**
 * Lives directly under HashRouter. It is inert outside Android and keeps native lifecycle,
 * history, and vault refresh behavior out of feature components.
 */
export function PlatformLifecycle() {
	const runtime = useRuntime();
	const navigate = useNavigate();
	const location = useLocation();
	const pathnameRef = useRef(location.pathname);
	const navigateRef = useRef(navigate);
	pathnameRef.current = location.pathname;
	navigateRef.current = navigate;

	useEffect(() => {
		const capabilities = getPlatformCapabilities();
		document.documentElement.setAttribute('data-runtime', capabilities.runtimeKind);
		if (capabilities.runtimeKind === 'android') {
			document.documentElement.setAttribute('data-android', 'true');
		} else {
			document.documentElement.removeAttribute('data-android');
		}
	}, []);

	useEffect(
		() =>
			registerPlatformStateRefresh(async () => {
				if (!runtime.loaded) return;
				await runtime.runExclusiveMaintenance(() => runtime.reloadFromStorage());
			}),
		[runtime],
	);

	useEffect(() => {
		let disposed = false;
		let removeListeners: (() => Promise<void>) | undefined;
		void bindPlatformLifecycle({
			onBack: async ({ canGoBack }) => {
				await handlePlatformBack({
					atRootDestination: pathnameRef.current === '/',
					canGoBack,
					navigateBack: () => navigateRef.current(-1),
					navigateToRoot: () => navigateRef.current('/', { replace: true }),
					minimize: minimizeAndroidApp,
				});
			},
			onStateChange: ({ isActive }) => {
				document.documentElement.toggleAttribute('data-app-active', isActive);
				if (isActive) return refreshPlatformState();
			},
			onResume: refreshPlatformState,
			onAppUrl: async (url) => {
				let parsed: URL;
				try {
					parsed = new URL(url);
				} catch {
					return;
				}
				if (parsed.origin === globalThis.location.origin && parsed.hash.startsWith('#/')) {
					globalThis.location.hash = parsed.hash;
					return;
				}
				await openExternalUrl(parsed.toString());
			},
		})
			.then((remove) => {
				if (disposed) void remove();
				else removeListeners = remove;
			})
			.catch(() => undefined);
		return () => {
			disposed = true;
			if (removeListeners) void removeListeners();
		};
	}, []);

	useEffect(() => {
		if (getPlatformCapabilities().runtimeKind !== 'android') return undefined;
		const onClick = (event: MouseEvent) => {
			if (event.defaultPrevented || event.button !== 0) return;
			const target = event.target instanceof Element ? event.target.closest('a[href]') : null;
			if (!(target instanceof HTMLAnchorElement)) return;
			let url: URL;
			try {
				url = new URL(target.href, globalThis.location.href);
			} catch {
				return;
			}
			if (url.origin === globalThis.location.origin) return;
			event.preventDefault();
			if (url.protocol === 'https:') void openExternalUrl(url.toString());
		};
		document.addEventListener('click', onClick, true);
		return () => document.removeEventListener('click', onClick, true);
	}, []);

	return null;
}
