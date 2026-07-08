import { type Page } from '@playwright/test';

// Shared drivers for the React GM e2e suite. These mirror the idioms proven in the repo's
// `scripts/verify-*.mjs` gates: bypass the first-run onboarding overlay, navigate under the
// HashRouter `#` fragment, wait for the DEV-only `window.__rt` SceneRuntime seam to finish
// loading, and read/mutate real Core state through it (never brittle test-ids).

/** The DEV-only runtime seam exposed on `window.__rt` (RuntimeContext.tsx, DEV builds only). */
interface DevRuntime {
	loaded: boolean;
	// The actor-filtered CoreStateSlice. Typed loosely on purpose — the specs read a handful of
	// well-known slices (sync.operations, scenes.scenes, permissions, commandCenter) off it.
	state: {
		sync: { operations: unknown[] };
		scenes: { scenes: Record<string, { id: string; name: string; widgets: Array<{ id: string; layout: { x: number; y: number } }> }> };
		commandCenter: { homeSceneId: string | null };
		[key: string]: unknown;
	};
	dispatch: (command: unknown) => Promise<{ status: string; rejection?: { message?: string }; events?: Array<Record<string, unknown>> }>;
	defaultActorId: string;
	enterPreview: (selection: { role: 'player' | 'observer'; playerActorId?: string | null }) => void;
	exitPreview: () => void;
	preview: { role: 'player' | 'observer'; actorId: string } | null;
	actors: Array<{ id: string; role: string; displayName: string }>;
}

declare global {
	interface Window {
		__rt?: DevRuntime;
	}
}

/** Dexie/IndexedDB database name (shared with the archived Svelte app). */
const DB_NAME = 'dndtools-v2';

/**
 * Bypass the first-run onboarding overlay (it covers every surface on a fresh profile). Must be
 * called BEFORE the first navigation so the init script runs before the app boots.
 */
export async function markOnboarded(page: Page): Promise<void> {
	await page.addInitScript(() => {
		try {
			window.localStorage.setItem('dndtools:react:onboarded', 'gate');
		} catch {
			/* storage may be unavailable in some contexts; the overlay bypass is best-effort */
		}
	});
}

/** Resolve once the runtime has loaded and the shell's main landmark is present. */
export async function waitReady(page: Page): Promise<void> {
	await page.waitForFunction(() => !!window.__rt && window.__rt.loaded === true, null, {
		timeout: 20_000,
	});
	await page.locator('#main-content').waitFor({ state: 'attached', timeout: 20_000 });
}

/**
 * Navigate to a HashRouter route (e.g. `/scenes`) and wait for the app to be ready. `path` starts
 * with `/`; it is placed after the `#` fragment. Resolves the per-route `<h1>` too so lazy route
 * chunks have begun mounting.
 */
export async function gotoRoute(page: Page, path: string): Promise<void> {
	await page.goto(`/#${path}`, { waitUntil: 'domcontentloaded' });
	await waitReady(page);
	// The per-route <h1> is always in the DOM but is visually hidden in the compact/mobile layout,
	// so wait for it to be attached (not visible).
	await page.locator('h1').first().waitFor({ state: 'attached', timeout: 20_000 });
}

/**
 * Wipe the IndexedDB and reload for a deterministic, freshly-seeded vault. The page must already
 * be on the app (call `gotoRoute` first). Waits for the runtime to be ready afterwards.
 */
export async function seedFresh(page: Page): Promise<void> {
	await page.evaluate(
		(db) =>
			new Promise<void>((resolve) => {
				const req = indexedDB.deleteDatabase(db);
				req.onsuccess = req.onerror = () => resolve();
				req.onblocked = () => resolve();
			}),
		DB_NAME,
	);
	await page.reload({ waitUntil: 'domcontentloaded' });
	await waitReady(page);
}

/** Current length of the durable op-log (`__rt.state.sync.operations`), or -1 if unavailable. */
export function ops(page: Page): Promise<number> {
	return page.evaluate(() => window.__rt?.state?.sync?.operations?.length ?? -1);
}

/** Enter DM "preview as" mode for the given non-DM role and wait for the re-render to settle. */
export async function enterPreview(page: Page, role: 'player' | 'observer'): Promise<void> {
	await page.evaluate((r) => window.__rt!.enterPreview({ role: r }), role);
	await page.waitForFunction((r) => window.__rt?.preview?.role === r, role, { timeout: 5_000 });
}

/** Exit preview back to the DM's own view. */
export async function exitPreview(page: Page): Promise<void> {
	await page.evaluate(() => window.__rt!.exitPreview());
	await page.waitForFunction(() => window.__rt?.preview === null, null, { timeout: 5_000 });
}

/** Dispatch a Core command through the runtime's single write choke point. */
export function dispatch(page: Page, command: Record<string, unknown>): Promise<{ status: string; rejection?: { message?: string }; events?: Array<Record<string, unknown>> }> {
	return page.evaluate((cmd) => window.__rt!.dispatch(cmd), command);
}
