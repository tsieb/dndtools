/**
 * Device-local spatial-dashboard layout persistence (Command Center redesign §8.7).
 *
 * A dashboard board's widget-block geometry + per-widget display options are an explicitly
 * device-scoped UI display preference (Contract 1) — never durable vault or sync state (the home
 * Scene's tool widgets stay core-owned and persist through `scene.move-widget` / presets / the
 * auto-save safe point). This module is the single owned localStorage touchpoint for board
 * layouts (PLAT-006 / PLAT-012 scoped exception); the GUI-side DashboardLayoutStore calls these
 * helpers and never reaches the primitive directly.
 *
 * All access is typeof-guarded with try/catch fallbacks (SSR, private mode, corrupt data).
 */

export function readBoardLayout(storageKey: string): unknown {
	if (typeof window === 'undefined') return null;
	try {
		const raw = window.localStorage?.getItem(storageKey);
		return raw ? (JSON.parse(raw) as unknown) : null;
	} catch {
		return null; // Corrupt or unavailable storage: callers keep their authored defaults.
	}
}

export function writeBoardLayout(storageKey: string, payload: unknown): void {
	if (typeof window === 'undefined') return;
	try {
		window.localStorage?.setItem(storageKey, JSON.stringify(payload));
	} catch {
		// Storage unavailable (private mode): the layout lives for the session only.
	}
}

export function clearBoardLayout(storageKey: string): void {
	if (typeof window === 'undefined') return;
	try {
		window.localStorage?.removeItem(storageKey);
	} catch {
		// Storage unavailable — the in-memory reset still applies.
	}
}
