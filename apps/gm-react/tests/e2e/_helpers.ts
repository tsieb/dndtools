import { errors, test, type Page } from '@playwright/test';

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
	/** The last command's lifecycle. `state` changes before the durable write; `status` leaves
	 *  `pending` only after it has committed or rolled back. */
	lastLifecycle: { commandType: string; status: string } | null;
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
	watchNetworkChanges(page);
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
 * Report the browser as online, whatever its interfaces say. The visual container runs with
 * `--network=none` (`tests/visual/run-in-container.sh`), so Chromium there reports
 * `navigator.onLine === false` although every request a visual spec makes is answered by the local
 * dev server or a route mock. RC-PLT-2.4's offline gate (`src/cloud/offline.tsx`) trusts exactly
 * that flag, so without this each gated surface would be captured wearing its offline notice.
 * Must be called BEFORE the first navigation. The offline state itself is covered for real in
 * `pwa-offline.spec.ts`, which must never call this.
 */
export async function presentOnline(page: Page): Promise<void> {
	await page.addInitScript(() => {
		Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => true });
	});
}

/**
 * Phones read `/board` and `/scene/:id` as stacked panels by default (RC-CAN-5.1). Specs that
 * exercise the spatial canvas on a phone (fit scale, zoom presets, pan, frame focus, flow reflow)
 * save the explicit canvas preference first, exactly as a user who chose it would have. Must be
 * called BEFORE the first navigation. The stacked default is covered in `responsive.spec.ts`.
 */
export async function preferPhoneCanvas(page: Page): Promise<void> {
	await page.addInitScript(() => {
		try {
			window.localStorage.setItem('dndtools:react:board-phone-layout', 'canvas');
		} catch {
			/* storage may be unavailable in some contexts */
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

/**
 * What Chromium fails every in-flight request with, loopback ones included, when an interface on
 * the host changes: a Wi-Fi switch, a VPN, a bridged container starting (docs/development/TESTING.md
 * §8). A module request aborted mid-boot leaves the page blank for good.
 */
const NETWORK_CHANGED = 'net::ERR_NETWORK_CHANGED';

/** Module requests a host network change aborted during each watched page's current boot. */
const networkAborts = new WeakMap<Page, number>();

/**
 * Start counting the module requests a host network change aborts, for the navigation about to
 * begin. Playwright reports a request's failure only while something listens for `requestfailed`,
 * so this must run before that navigation, not after it.
 */
function watchNetworkChanges(page: Page): void {
	const watched = networkAborts.has(page);
	networkAborts.set(page, 0);
	if (watched) return;
	page.on('requestfailed', (request) => {
		if (request.failure()?.errorText !== NETWORK_CHANGED || request.resourceType() !== 'script') {
			return;
		}
		networkAborts.set(page, (networkAborts.get(page) ?? 0) + 1);
	});
}

/**
 * Wait up to 20 s for `window.__rt.loaded`. A boot whose module graph the host's network change
 * aborted is reloaded once within the same budget; the reload is annotated on the test. Any other
 * slow or stalled boot still fails.
 */
async function waitForBoot(page: Page): Promise<void> {
	const deadline = Date.now() + 20_000;
	let reloaded = false;
	for (;;) {
		try {
			await page.waitForFunction(() => !!window.__rt && window.__rt.loaded === true, null, {
				timeout: Math.max(1, Math.min(1_000, deadline - Date.now())),
			});
			break;
		} catch (error) {
			if (!(error instanceof errors.TimeoutError)) throw error;
			if (Date.now() >= deadline) {
				throw new errors.TimeoutError(
					'page.waitForFunction: Timeout 20000ms exceeded waiting for window.__rt.loaded',
				);
			}
		}
		if (!reloaded && (networkAborts.get(page) ?? 0) > 0) {
			reloaded = true;
			const description = `${NETWORK_CHANGED} aborted the boot's module requests; reloaded once`;
			test.info().annotations.push({ type: 'network-changed', description });
			console.warn(`[e2e] ${description}`);
			watchNetworkChanges(page);
			await page.reload({ waitUntil: 'domcontentloaded' });
		}
	}
	// A booted page's aborts (a lazy chunk, say) must not read as a later boot's.
	if (networkAborts.has(page)) networkAborts.set(page, 0);
}

/** Resolve once the runtime has loaded and the shell's main landmark is present. */
export async function waitReady(page: Page): Promise<void> {
	await waitForBoot(page);
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
	watchNetworkChanges(page);
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
	watchNetworkChanges(page);
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

/**
 * Chromium's own console error when the host has no audio output device (GitHub's hosted runners
 * have none). It describes the machine, not the app, so it is the one console message not counted.
 */
const HOST_AUDIO_DEVICE_ERROR =
	'The AudioContext encountered an error from the audio device or the WebAudio renderer.';

/**
 * Collect every runtime/network failure from installation until the page closes. No allowlist
 * beyond the host's missing audio device.
 */
export function watchJourney(page: Page) {
	const failures: string[] = [];
	page.on('console', (message) => {
		if (message.text() === HOST_AUDIO_DEVICE_ERROR) return;
		if (['error', 'warning'].includes(message.type()))
			failures.push(`console ${message.type()}: ${message.text()}`);
	});
	page.on('pageerror', (error) => failures.push(`page error: ${error.message}`));
	page.on('requestfailed', (request) =>
		failures.push(`request failed: ${request.url()} ${request.failure()?.errorText}`),
	);
	page.on('response', (response) => {
		if (response.status() >= 400) failures.push(`HTTP ${response.status()}: ${response.url()}`);
	});
	return {
		async checkpoint(name: string) {
			failures.push(...(await journeySurfaceIssues(page)).map((issue) => `${name}: ${issue}`));
		},
		async assertHealthy() {
			const issues = [...failures, ...(await journeySurfaceIssues(page))];
			if (issues.length) throw new Error(`Journey health:\n${issues.join('\n')}`);
		},
	};
}

/**
 * Inspect rendered content, including content below the fold. A scrollable ancestor can recover
 * an offscreen child, but cannot recover a child's own hidden/clip overflow. Full-text alternatives
 * must contain the complete clipped text; an unrelated aria-label is not an escape hatch.
 */
export async function journeySurfaceIssues(page: Page): Promise<string[]> {
	// Font substitution changes both line wrapping and text bounds. Read geometry after that
	// layout has painted, rather than capturing an intermediate fallback-font measurement.
	await page.evaluate(async () => {
		await document.fonts.ready;
		await new Promise<void>((resolve) =>
			requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
		);
	});
	const inspection = await page.evaluateHandle(() => {
		const issues: string[] = [];
		const clips: Array<{
			diagnostic: string;
			text: string;
			owner: HTMLElement;
			role: 'button' | 'link';
		}> = [];
		const elements = [...document.querySelectorAll<HTMLElement>('html, body, body *')];
		const text = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();
		const refs = (el: Element, attr: string) =>
			(el.getAttribute(attr) ?? '')
				.split(/\s+/)
				.map((id) => document.getElementById(id))
				.filter((node): node is HTMLElement => !!node)
				.map(text)
				.join(' ');
		const srOnly = (el: HTMLElement) => {
			const style = getComputedStyle(el);
			return (
				el.clientWidth <= 1 &&
				el.clientHeight <= 1 &&
				(style.clip !== 'auto' || style.clipPath === 'inset(50%)')
			);
		};
		// These properties make an ancestor the containing block for its fixed descendants, and
		// then its overflow does clip them.
		const trapsFixed = (el: HTMLElement) => {
			const css = getComputedStyle(el);
			return (
				css.transform !== 'none' ||
				css.perspective !== 'none' ||
				css.filter !== 'none' ||
				css.backdropFilter !== 'none' ||
				/paint|layout|strict|content/.test(css.contain) ||
				/transform|perspective|filter/.test(css.willChange)
			);
		};
		const fixedTrappedBelow = (node: HTMLElement) => {
			for (let p = node.parentElement; p; p = p.parentElement) if (trapsFixed(p)) return true;
			return false;
		};
		const rendered = (el: HTMLElement) =>
			el.getClientRects().length > 0 &&
			getComputedStyle(el).visibility !== 'hidden' &&
			!el.closest('[hidden], [inert]');
		const fullTextAlternative = (el: Element, full: string) =>
			full.length > 0 &&
			[
				el.getAttribute('title'),
				el.getAttribute('aria-label'),
				refs(el, 'aria-labelledby'),
				refs(el, 'aria-describedby'),
			].some((value) => value?.replace(/\s+/g, ' ').includes(full));
		for (const el of elements) {
			if (!rendered(el) || srOnly(el)) continue;
			const label = `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''} ${(el.getAttribute('aria-label') || text(el)).slice(0, 100)}`;
			if (el.matches('[data-testid="widget-placeholder"], [data-widget-state="error"]'))
				issues.push(`widget error: ${label}`);
			if (el.matches(':disabled, [aria-disabled="true"]')) {
				const normalize = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();
				const labels = [text(el), el.getAttribute('aria-label') ?? '', refs(el, 'aria-labelledby')]
					.map(normalize)
					.filter(Boolean);
				const reasons = [
					el.getAttribute('title'),
					refs(el, 'aria-describedby'),
					el.getAttribute('aria-description'),
				];
				if (!reasons.some((reason) => reason?.trim() && !labels.includes(normalize(reason))))
					issues.push(`disabled without reason: ${label}`);
			}
			const style = getComputedStyle(el);
			for (const axis of ['x', 'y'] as const) {
				const overflow = axis === 'x' ? style.overflowX : style.overflowY;
				const size = axis === 'x' ? el.clientWidth : el.clientHeight;
				if (size <= 0 || !['hidden', 'clip'].includes(overflow)) continue;
				const bounds = el.getBoundingClientRect();
				const outside = (rect: DOMRect) =>
					axis === 'x'
						? rect.left < bounds.left - 2 || rect.right > bounds.right + 2
						: rect.top < bounds.top - 2 || rect.bottom > bounds.bottom + 2;
				// scrollHeight includes absolutely positioned screen-reader helpers and descendants
				// whose content can be reached through an inner scroller. Neither is a lost pixel.
				const protectedByScroller = (source: HTMLElement) => {
					for (
						let node: HTMLElement | null = source;
						node && node !== el;
						node = node.parentElement
					) {
						if (!rendered(node) || srOnly(node)) return true;
						// A fixed box is positioned against the viewport, so this ancestor's overflow
						// never clips it (e.g. a skip link parked above the viewport until focused).
						if (getComputedStyle(node).position === 'fixed' && !fixedTrappedBelow(node))
							return true;
						const css = getComputedStyle(node);
						if (
							['auto', 'scroll'].includes(axis === 'x' ? css.overflowX : css.overflowY) &&
							!outside(node.getBoundingClientRect())
						)
							return true;
					}
					return false;
				};
				const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
				let lost = false;
				for (let node = walker.nextNode(); node; node = walker.nextNode()) {
					if (!node.textContent?.trim() || protectedByScroller(node.parentElement!)) continue;
					const range = document.createRange();
					range.selectNodeContents(node);
					if ([...range.getClientRects()].some(outside)) {
						lost = true;
						break;
					}
				}
				// Textless controls and replaced content must also remain reachable. Padding,
				// shadows and one-pixel helpers alone do not constitute lost content.
				lost ||= [
					...el.querySelectorAll<HTMLElement>(
						'button, input, select, textarea, img, canvas, video, svg, [role="button"]',
					),
				].some(
					(node) =>
						rendered(node) && outside(node.getBoundingClientRect()) && !protectedByScroller(node),
				);
				const lostGraphic = [...el.querySelectorAll<HTMLElement>('img, canvas, video, svg')].some(
					(node) =>
						rendered(node) && outside(node.getBoundingClientRect()) && !protectedByScroller(node),
				);
				if (!lost || (!lostGraphic && fullTextAlternative(el, text(el)))) continue;
				const owner = el.closest<HTMLElement>('button, [role="button"], a[href], [role="link"]');
				const diagnostic = `unrecoverable clip (${axis}): ${label}`;
				if (
					owner &&
					!lostGraphic &&
					!el.closest('[aria-hidden="true"]') &&
					!owner.matches(':disabled, [aria-disabled="true"]')
				) {
					if (fullTextAlternative(owner, text(el))) continue;
					clips.push({
						diagnostic,
						text: text(el),
						owner,
						role: owner.matches('a, [role="link"]') ? 'link' : 'button',
					});
				} else issues.push(diagnostic);
			}
		}
		return { issues, clips };
	});
	const issues = await (await inspection.getProperty('issues')).jsonValue();
	const clips = await inspection.getProperty('clips');
	try {
		for (const clipHandle of (await clips.getProperties()).values()) {
			const clip = await clipHandle.evaluate(({ diagnostic, text, role }) => ({
				diagnostic,
				text,
				role,
			}));
			const owner = await clipHandle.getProperty('owner');
			try {
				// Keep the exact DOM node alive across evaluations: document indices change when
				// React inserts siblings while the accessible-name engine is running.
				const name = new RegExp(clip.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
				const readable =
					clip.text.length > 0 &&
					(await page
						.getByRole(clip.role, { name })
						.evaluateAll((owners, original) => owners.includes(original), owner));
				if (!readable) issues.push(clip.diagnostic);
			} finally {
				await owner.dispose();
				await clipHandle.dispose();
			}
		}
	} finally {
		await clips.dispose();
		await inspection.dispose();
	}
	return issues;
}

/** Test-only ordered LAN data channel. Real signaling, encryption and host filtering still run. */
export async function installFakeLan(page: Page, peers: Page[]): Promise<void> {
	peers.push(page);
	await page.exposeFunction('__goldenLanSend', async (id: string, data: unknown) => {
		await Promise.all(
			peers
				.filter((peer) => peer !== page && !peer.isClosed())
				.map((peer) =>
					peer.evaluate(
						({ id, data }) => {
							(
								window as unknown as { goldenLanDeliver?: (id: string, data: unknown) => void }
							).goldenLanDeliver?.(id, data);
						},
						{ id, data },
					),
				),
		);
	});
	await page.addInitScript(() => {
		const channels = new Map<string, Channel>();
		Object.assign(window, {
			goldenLanDeliver: (id: string, data: { open?: boolean; frame: string }) => {
				const channel = channels.get(id);
				if (data.open) channel?.open();
				else channel?.onmessage?.({ data: data.frame });
			},
		});
		class Channel {
			readyState = 'connecting';
			onopen: (() => void) | null = null;
			onclose: (() => void) | null = null;
			onmessage: ((event: { data: string }) => void) | null = null;
			bus: { postMessage(data: unknown): void; close(): void };
			constructor(id: string) {
				channels.set(id, this);
				this.bus = {
					postMessage(data) {
						void (
							window as unknown as { __goldenLanSend(id: string, data: unknown): Promise<void> }
						).__goldenLanSend(id, data);
					},
					close() {
						channels.delete(id);
					},
				};
			}
			open() {
				this.readyState = 'open';
				this.onopen?.();
			}
			send(frame: string) {
				this.bus.postMessage({ frame });
			}
			close() {
				this.readyState = 'closed';
				this.bus.close();
				this.onclose?.();
			}
		}
		class Connection extends EventTarget {
			iceGatheringState = 'complete';
			connectionState = 'new';
			localDescription: { type: string; sdp: string } | null = null;
			id: string = crypto.randomUUID();
			channel?: Channel;
			createDataChannel() {
				this.channel = new Channel(this.id);
				return this.channel;
			}
			async createOffer() {
				return { type: 'offer', sdp: this.id };
			}
			async createAnswer() {
				return { type: 'answer', sdp: this.id };
			}
			async setLocalDescription(description: { type: string; sdp: string }) {
				this.localDescription = description;
			}
			async setRemoteDescription(description: { type: string; sdp: string }) {
				if (description.type === 'offer') {
					this.id = description.sdp;
					this.channel = new Channel(this.id);
					this.dispatchEvent(Object.assign(new Event('datachannel'), { channel: this.channel }));
				} else {
					this.channel!.bus.postMessage({ open: true });
					this.channel!.open();
				}
			}
			close() {
				this.channel?.close();
			}
		}
		Object.defineProperty(window, 'RTCPeerConnection', { value: Connection });
	});
}

/**
 * RC-CAN-7.3 — create a screen through the Screens library's "New screen" dialog, the real UI path
 * that replaced the old `/scenes` create form. The page must already be on `/screens`. On success the
 * app navigates to the new screen's `/screen/:id`.
 */
export async function createScreenInLibrary(
	page: Page,
	name: string,
	template = 'Blank',
): Promise<void> {
	// The shell also offers New screen; exercise the library's own create action.
	await page
		.getByTestId('screens-library')
		.getByRole('button', { name: 'New screen', exact: true })
		.click();
	const dialog = page.getByRole('dialog', { name: 'New screen' });
	await dialog.getByRole('radio', { name: template, exact: true }).click();
	await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
	await dialog.getByRole('button', { name: 'Create screen', exact: true }).click();
}
