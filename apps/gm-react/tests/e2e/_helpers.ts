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
		scenes: {
			scenes: Record<
				string,
				{
					id: string;
					name: string;
					widgets: Array<{ id: string; layout: { x: number; y: number } }>;
				}
			>;
		};
		commandCenter: { homeSceneId: string | null };
		[key: string]: unknown;
	};
	dispatch: (command: unknown) => Promise<{
		status: string;
		rejection?: { message?: string };
		events?: Array<Record<string, unknown>>;
	}>;
	/** The runtime's id factory — specs that dispatch a payload carrying an explicit id must use
	 *  this rather than inventing one (PLAT-006). */
	newId: () => string;
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
 * Opt-in diagnostics for navigation races (RC-ENG-2.6). `DNDTOOLS_E2E_CPU_THROTTLE=4` slows the
 * renderer the way a loaded machine does; `DNDTOOLS_E2E_TRACE_NAV=1` logs every main-frame
 * navigation, the Vite client's console lines, and the JS stack that started each unload.
 */
async function instrument(page: Page): Promise<void> {
	const rate = Number(process.env.DNDTOOLS_E2E_CPU_THROTTLE);
	if (Number.isFinite(rate) && rate > 1) {
		const cdp = await page.context().newCDPSession(page);
		await cdp.send('Emulation.setCPUThrottlingRate', { rate });
	}
	if (process.env.DNDTOOLS_E2E_TRACE_NAV !== '1') return;
	const start = Date.now();
	const log = (message: string) => console.log(`[nav +${Date.now() - start}ms] ${message}`);
	page.on('framenavigated', (frame) => {
		if (frame === page.mainFrame()) log(`navigated ${frame.url()}`);
	});
	page.on('load', () => log('load'));
	page.on('console', (message) => {
		const text = message.text();
		if (text.startsWith('[vite]') || text.startsWith('[unload]')) log(text);
	});
	await page.addInitScript(() => {
		window.addEventListener('beforeunload', () => console.log(`[unload] ${new Error().stack}`));
	});
}

/**
 * Bypass the first-run onboarding overlay (it covers every surface on a fresh profile). Must be
 * called BEFORE the first navigation so the init script runs before the app boots.
 */
export async function markOnboarded(page: Page): Promise<void> {
	await instrument(page);
	await page.addInitScript(() => {
		try {
			window.localStorage.setItem('dndtools:react:onboarded', 'gate');
		} catch {
			/* storage may be unavailable in some contexts; the overlay bypass is best-effort */
		}
	});
}

/**
 * Op-log length recorded the first time a page reached a ready app boot (RC-ENG-2.2). Playwright
 * gives every test its own browser context, so that first boot starts from an empty IndexedDB and
 * therefore already IS a freshly seeded vault. While the count is unchanged nothing durable has
 * been written — every durable mutation is a core command that appends to `sync.operations` — so
 * `seedFresh` can skip its wipe-and-reload and save the suite a second full boot per test.
 */
const pristineOps = new WeakMap<Page, number>();

/** Resolve once the runtime has loaded and the shell's main landmark is present. */
export async function waitReady(page: Page): Promise<void> {
	await page.waitForFunction(() => !!window.__rt && window.__rt.loaded === true, null, {
		timeout: 20_000,
	});
	await page.locator('#main-content').waitFor({ state: 'attached', timeout: 20_000 });
	if (!pristineOps.has(page)) {
		const count = await ops(page);
		if (count >= 0) pristineOps.set(page, count);
	}
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
 *
 * When the op-log proves the vault has not been touched since it was seeded at boot, the wipe is
 * skipped: deleting a pristine vault and re-seeding it lands on the same state, and the reload it
 * avoids is one of the suite's most expensive operations (RC-ENG-2.2).
 */
export async function seedFresh(page: Page): Promise<void> {
	const pristine = pristineOps.get(page);
	if (pristine !== undefined) {
		const current = await ops(page);
		if (current >= 0 && current === pristine) return;
	}
	await page.evaluate(
		(db) =>
			new Promise<void>((resolve) => {
				// Settle from a fresh task, as `dispatch` does (RC-ENG-2.6).
				const settle = () => setTimeout(resolve, 0);
				const req = indexedDB.deleteDatabase(db);
				req.onsuccess = req.onerror = req.onblocked = settle;
			}),
		DB_NAME,
	);
	await page.reload({ waitUntil: 'domcontentloaded' });
	await waitReady(page);
	const reseeded = await ops(page);
	if (reseeded >= 0) pristineOps.set(page, reseeded);
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

/**
 * Dispatch a Core command through the runtime's single write choke point.
 *
 * The result settles from a fresh task, not straight off the runtime's promise (RC-ENG-2.6). The
 * inspector holds an evaluation's promise weakly, and a full GC in the one microtask slot between
 * that promise settling and the inspector reading it fails the call with "Promise was collected",
 * which Playwright reports as "Execution context was destroyed, most likely because of a
 * navigation". Straight off `dispatch`, that slot holds whatever the runtime queued behind the
 * command; from a fresh task it holds nothing. Only the fields the specs read come back: the
 * runtime's `nextState` is the whole vault.
 */
export function dispatch(
	page: Page,
	command: Record<string, unknown>,
): Promise<{
	status: string;
	rejection?: { message?: string };
	events?: Array<Record<string, unknown>>;
}> {
	return page.evaluate(async (cmd) => {
		const { status, rejection, events } = await window.__rt!.dispatch(cmd);
		await new Promise((resolve) => setTimeout(resolve, 0));
		return { status, rejection, events };
	}, command);
}
