import { useEffect, useRef } from 'react';
import { useLocation, useNavigate, type NavigateFunction } from 'react-router-dom';
import { useRuntime } from '../runtime/RuntimeContext';
import { handlePlatformBack } from './backNavigation';
import {
	bindAppIntents,
	bindPlatformLifecycle,
	getPlatformCapabilities,
	minimizeAndroidApp,
	openExternalUrl,
	platformNotifications,
} from './capabilities';
import { ShareImportDialog } from './ShareImportDialog';
import { offerSharedImport } from './shareTarget';
import { useI18n } from '../i18n';

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
/**
 * RC-PLT-2.2 — where a home-screen shortcut lands, and what Back does from there.
 *
 * A shortcut is an ENTRY POINT, not a step in a journey: whatever the DM was doing before, tapping
 * "Session" on the launcher starts afresh, and one Back out of it belongs at the app root. So the
 * current entry is REPLACED with the root and the destination pushed on top, leaving exactly
 * `root → route` above whatever came before.
 *
 * Pushing alone made every shortcut a history entry, so Back landed on the shortcut used before it
 * and the root was only reached after as many Backs as shortcuts tapped that session. Replacing
 * alone was worse: it overwrote the root entry, so Back fell through into the pre-shortcut history.
 */
export function navigateToShortcut(
	navigate: NavigateFunction,
	route: string,
	currentPathname: string,
): void {
	if (currentPathname !== '/') navigate('/', { replace: true });
	navigate(route);
}

export function PlatformLifecycle() {
	const runtime = useRuntime();
	const { t } = useI18n();
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

	// RC-PLT-2.2 — home-screen shortcuts and the share target. Both arrive as native intents, so
	// both are bound here rather than in a screen: either can land while any destination is open.
	useEffect(() => {
		let disposed = false;
		let removeListeners: (() => Promise<void>) | undefined;
		void bindAppIntents({
			onShortcut: (route) => {
				navigateToShortcut(navigateRef.current, route, pathnameRef.current);
			},
			onShare: (share) => {
				offerSharedImport(share);
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

	// RC-PLT-2.2 — the ongoing live-session status. It follows the core's own workflow state, so it
	// cannot claim a session is live when it is not, and it clears the moment the session stands
	// down or the app unmounts.
	const workflow = runtime.state.session.workflow;
	useEffect(() => {
		if (getPlatformCapabilities().runtimeKind !== 'android') return undefined;
		void platformNotifications
			.setLiveSession(
				workflow === 'active'
					? { title: t('liveSession.notification.title'), body: t('liveSession.notification.body') }
					: null,
			)
			.catch(() => false);
		return () => {
			void platformNotifications.setLiveSession(null).catch(() => false);
		};
	}, [workflow, t]);

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

	return <ShareImportDialog />;
}
