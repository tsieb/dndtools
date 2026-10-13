/**
 * RC-ENG-1.1 — PERF CAPTURE. Drives the real React GM app in Chromium and records honest timing
 * samples for every budget the PERF-001 registry owns (`packages/core/src/perf/budget-registry.ts`).
 *
 * The pipeline is deliberately split in two halves:
 *
 *   - THIS script MEASURES. It runs one scenario per budget id against the dev server (the DEV-only
 *     `window.__rt` SceneRuntime seam is what makes the core-level scenarios possible) and writes a
 *     run file of raw samples. It grades nothing.
 *   - `compare.ts` GRADES. It feeds those samples to the core's `measureBudget` / `compareToBaseline`
 *     so the pass/breach verdict and the baseline drift come from one implementation, shared with
 *     the app and the tests.
 *
 * Marks are driven from HERE, not from app code: every scenario brackets its work with
 * `performance.mark`/`performance.measure` inside the page and reads the measured duration back, so
 * the app carries no measurement scaffolding for the benefit of CI.
 *
 * HONESTY RULES (the whole point of a perf pipeline nobody is watching):
 *   - Every sample is a real observed duration or frame rate. Nothing is estimated or modelled.
 *   - A scenario that cannot run records ZERO samples and a reason. It never records a fake number,
 *     and `measureBudget` grades an empty sample set as `unknown`, never as a pass.
 *   - Every scenario runs against the Vite DEV server, because the `window.__rt` seam the core-level
 *     scenarios drive exists only in a DEV build. That is a real cost the numbers carry: the dev
 *     server transforms modules on demand, so first-navigation timings are HIGHER than the shipped
 *     app's. The scenarios say so in their `fixture`; `app-startup` runs closest to its target for
 *     exactly this reason, and a slow cold run does breach it. Reported, not absorbed.
 *   - Where a scenario runs against a SMALLER fixture than the budget's declared dataset (seeding
 *     10,000 records through the durable command path would take longer than the CI job), the run
 *     file records the fixture actually used in `fixture`, and the report prints it next to the
 *     verdict. A number measured on a smaller vault is never presented as if it were the declared one.
 *
 * Usage:
 *   tsx scripts/perf/capture.ts [--out tests/perf/current.json] [--port 5273] [--notes 200]
 *                              [--only app-startup,search] [--skip smoke-ci] [--headed]
 *                              [--reference-root <dir> --reference-port 5373 --reference-out <file>]
 *
 * `--only` / `--skip` take comma-separated budget ids. With no filter every budget is captured.
 *
 * `--reference-root` measures a second checkout ALONGSIDE this one: each revision gets its own dev
 * server, and every scenario alternates a reference batch with a candidate batch (see
 * `interleavedOrder`). Both run files then describe the same minutes on the same machine, so a runner
 * that changes speed mid-job moves both revisions together instead of reading as drift.
 */

import { captureRevision, assertSameRevision } from './provenance';
import { seedLargeScene } from './scene-fixture';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { cpus, hostname, totalmem, type } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildDemoSeedProfile } from '../../apps/gm-react/src/runtime/demo-seed';
import type { CoreStateSlice } from '../../packages/core/src/commands/types';
import {
	LARGE_VAULT_DATASET,
	LARGE_VAULT_NOTE_EDITS,
	LARGE_VAULT_PAN_ZOOM_MAP,
} from '../../packages/core/src/testing/large-vault';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../..');

// ── The slice of Playwright this capture drives ──────────────────────────────────────────────────
// `@playwright/test` belongs to `apps/gm-react`, not the repo root, so it is resolved at runtime
// through a `createRequire` rooted there. Declaring the members used keeps this file fully typed
// without adding a root dependency that would pull a browser download into every install.

interface Mouse {
	move(x: number, y: number, options?: { steps?: number }): Promise<void>;
	down(): Promise<void>;
	up(): Promise<void>;
	wheel(deltaX: number, deltaY: number): Promise<void>;
}

interface Locator {
	first(): Locator;
	count(): Promise<number>;
	fill(value: string): Promise<void>;
	click(options?: { timeout?: number }): Promise<void>;
	waitFor(options?: {
		state?: 'attached' | 'detached' | 'visible' | 'hidden';
		timeout?: number;
	}): Promise<void>;
	boundingBox(): Promise<{ x: number; y: number; width: number; height: number } | null>;
}

interface Page {
	goto(
		url: string,
		options?: { waitUntil?: 'domcontentloaded' | 'load' | 'commit' },
	): Promise<unknown>;
	reload(options?: { waitUntil?: 'domcontentloaded' | 'load' | 'commit' }): Promise<unknown>;
	context(): BrowserContext;
	url(): string;
	evaluate<R, A = undefined>(fn: (arg: A) => R | Promise<R>, arg?: A): Promise<R>;
	waitForFunction<A = undefined>(
		fn: (arg: A) => unknown,
		arg?: A,
		options?: { timeout?: number; polling?: number | 'raf' },
	): Promise<unknown>;
	waitForTimeout(ms: number): Promise<void>;
	locator(selector: string): Locator;
	getByRole(role: string, options?: { name?: string | RegExp; exact?: boolean }): Locator;
	getByTestId(testId: string): Locator;
	addInitScript(script: () => void): Promise<void>;
	readonly mouse: Mouse;
	close(): Promise<void>;
}

interface BrowserContext {
	storageState(options: { indexedDB: true }): Promise<Record<string, unknown>>;
	newPage(): Promise<Page>;
	close(): Promise<void>;
}

interface Browser {
	newContext(options?: {
		storageState?: Record<string, unknown>;
		baseURL?: string;
		viewport?: { width: number; height: number };
		deviceScaleFactor?: number;
		isMobile?: boolean;
		hasTouch?: boolean;
	}): Promise<BrowserContext>;
	close(): Promise<void>;
}

interface ChromiumLauncher {
	launch(options?: { headless?: boolean; args?: string[] }): Promise<Browser>;
}

// ── The run file this capture writes ─────────────────────────────────────────────────────────────

/** One budget's captured samples. `samples` is empty exactly when the scenario could not run. */
export interface CapturedBudget {
	readonly budgetId: string;
	/** Raw observed samples in the budget's unit (ms for durations/latencies, fps for frame rates). */
	readonly samples: readonly number[];
	/** Independent scenario batches; raw tails are retained within each batch. */
	readonly repetitions?: readonly (readonly number[])[];
	/** What the scenario did, in one line, so a reader knows what the number means. */
	readonly scenario: string;
	/** The fixture ACTUALLY used, named plainly when it is smaller than the budget's declared dataset. */
	readonly fixture: string;
	/** The viewport profile the samples were taken on. */
	readonly profile: 'desktop' | 'slim' | 'node';
	/** Why a scenario produced no samples. Absent on a scenario that ran. */
	readonly unavailableReason?: string;
}

export interface PerfRunFile {
	readonly schemaVersion: 1;
	readonly capturedAt: string;
	readonly commit: string;
	readonly sourceTree?: string;
	readonly aggregation: 'median-of-batches-v1';
	readonly host: {
		readonly hostname: string;
		readonly os: string;
		readonly cpuCount: number;
		readonly cpuModel: string;
		readonly totalMemoryMb: number;
		readonly ci: boolean;
		readonly runnerLabel: string;
	};
	readonly budgets: readonly CapturedBudget[];
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────

interface Options {
	out: string;
	port: number;
	notes: number;
	vaultProfile: 'standard' | 'large';
	only: Set<string> | null;
	skip: Set<string>;
	headed: boolean;
	/** A second checkout to measure alongside this one, batch by batch; `null` measures this one only. */
	referenceRoot: string | null;
	referencePort: number;
	referenceOut: string | null;
}

function parseOptions(argv: readonly string[]): Options {
	const flags = new Map<string, string>();
	const bare = new Set<string>();
	for (let i = 0; i < argv.length; i += 1) {
		const token = argv[i];
		if (!token.startsWith('--')) continue;
		const next = argv[i + 1];
		if (next === undefined || next.startsWith('--')) {
			bare.add(token.slice(2));
		} else {
			flags.set(token.slice(2), next);
			i += 1;
		}
	}
	const list = (value: string | undefined): Set<string> =>
		new Set(
			(value ?? '')
				.split(',')
				.map((entry) => entry.trim())
				.filter(Boolean),
		);
	return {
		out: flags.get('out') ?? join(REPO_ROOT, 'tests/perf/current.json'),
		port: Number(flags.get('port') ?? process.env.DNDTOOLS_E2E_PORT ?? 5273),
		notes: Number(flags.get('notes') ?? 200),
		vaultProfile: 'standard',
		only: flags.has('only') ? list(flags.get('only')) : null,
		skip: list(flags.get('skip')),
		headed: bare.has('headed'),
		referenceRoot: flags.get('reference-root') ?? null,
		referencePort: Number(flags.get('reference-port') ?? 5373),
		referenceOut: flags.get('reference-out') ?? null,
	};
}

// ── Dev server ───────────────────────────────────────────────────────────────────────────────────

function isPortOpen(port: number): Promise<boolean> {
	return new Promise((res) => {
		// `localhost`, not `127.0.0.1`: Vite binds the loopback NAME, which on a dual-stack host
		// resolves to ::1 only — a v4-literal probe reports a live dev server as closed forever.
		const socket = createConnection({ port, host: 'localhost' });
		socket.setTimeout(400);
		socket.on('connect', () => {
			socket.destroy();
			res(true);
		});
		socket.on('error', () => res(false));
		socket.on('timeout', () => {
			socket.destroy();
			res(false);
		});
	});
}

async function waitForPort(port: number, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (await isPortOpen(port)) return;
		await new Promise((res) => setTimeout(res, 300));
	}
	throw new Error(`dev server never started listening on :${port}`);
}

/**
 * Start the Vite DEV server (the capture needs the DEV-only `__rt` seam, so a preview build will not
 * do), or reuse one already listening. The cloud coordinates are blanked exactly as
 * `playwright.config.ts` and the validation harness blank them, so a capture can never reach a real
 * Cognito / signaling / sync endpoint.
 */
async function ensureDevServer(
	port: number,
	root: string,
): Promise<{ stop: () => Promise<void>; reused: boolean }> {
	if (await isPortOpen(port)) return { stop: async () => {}, reused: true };
	mkdirSync(join(REPO_ROOT, 'tmp'), { recursive: true });
	const log = createWriteStream(join(REPO_ROOT, `tmp/perf-dev-server-${port}.log`), {
		flags: 'a',
	});
	const child = spawn(
		'pnpm',
		['--filter', '@dndtools/gm-react', 'exec', 'vite', '--port', String(port)],
		{
			cwd: root,
			detached: true,
			stdio: ['ignore', 'pipe', 'pipe'],
			env: {
				...process.env,
				VITE_CLOUD_REGION: '',
				VITE_COGNITO_USER_POOL_ID: '',
				VITE_COGNITO_CLIENT_ID: '',
				VITE_SIGNALING_WS_URL: '',
				VITE_SYNC_API_URL: '',
				VITE_APP_API_URL: '',
				VITE_PUBLIC_APP_URL: '',
				VITE_GOOGLE_CLIENT_ID: '',
			},
		},
	);
	child.stdout?.pipe(log);
	child.stderr?.pipe(log);
	await waitForPort(port, 120_000);
	return {
		reused: false,
		// Wait for the port to close: a capture that follows (the CI script runs five in a row) must
		// never reuse this revision's still-exiting server and measure the wrong code.
		stop: async () => {
			if (child.pid !== undefined) {
				try {
					process.kill(-child.pid, 'SIGTERM');
				} catch {
					/* already gone */
				}
			}
			const deadline = Date.now() + 15_000;
			while (Date.now() < deadline && (await isPortOpen(port))) {
				await new Promise((res) => setTimeout(res, 200));
			}
		},
	};
}

// ── Page drivers (the same idioms the e2e suite uses: `__rt`, HashRouter, no brittle test-ids) ───

const READY_TIMEOUT = 30_000;

let largeSnapshot: Promise<string> | null = null;

/** The large snapshot, built once per capture and serialized once. Every restore parses its own copy
 * inside the page, so revisions and batches never share objects; rebuilding it for each of the
 * ~200 seeded contexts a capture opens would only add setup time.
 */
function largeSnapshotJson(): Promise<string> {
	largeSnapshot ??= (async () => {
		const started = performance.now();
		const snapshot = await buildDemoSeedProfile('large');
		if (performance.now() - started >= 10_000) throw new Error('Large fixture build exceeded 10 s');
		return JSON.stringify({ ...snapshot, sync: { operations: snapshot.sync.operations } });
	})();
	return largeSnapshot;
}

async function newPage(
	browser: Browser,
	port: number,
	profile: 'desktop' | 'slim',
	vaultProfile: Options['vaultProfile'] = 'standard',
	storageState?: Record<string, unknown>,
): Promise<{ page: Page; close: () => Promise<void> }> {
	const context = await browser.newContext({
		storageState,
		baseURL: `http://localhost:${port}`,
		viewport: profile === 'desktop' ? { width: 1280, height: 800 } : { width: 390, height: 844 },
		deviceScaleFactor: 1,
		isMobile: false,
		hasTouch: profile === 'slim',
	});
	let page = await context.newPage();
	// The first-run onboarding overlay covers every surface; bypass it before the first navigation
	// exactly as `tests/e2e/_helpers.ts` does.
	await page.addInitScript(() => {
		try {
			window.localStorage.setItem('dndtools:react:onboarded', 'gate');
		} catch {
			/* storage may be unavailable; the bypass is best-effort */
		}
	});
	try {
		if (vaultProfile === 'large') {
			await page.addInitScript(() => {
				window.localStorage.setItem('dndtools:react:vault-choice', 'fresh');
			});
			await gotoRoute(page, '/');
			// Both revisions receive the SAME candidate-generated snapshot via their own restore path.
			// This also works on the pinned reference, which predates the large profile.
			await page.evaluate(
				async (json) => {
					const state = JSON.parse(json) as CoreStateSlice;
					const modulePath = '/src/platform/storage/coreStore.ts';
					const storage = await import(/* @vite-ignore */ modulePath);
					const rt = (
						window as unknown as {
							__rt: {
								runExclusiveMaintenance<T>(operation: () => Promise<T>): Promise<T>;
								reloadFromStorage(): Promise<void>;
								state: CoreStateSlice;
							};
						}
					).__rt;
					await rt.runExclusiveMaintenance(async () => {
						await storage.restoreCoreState(state);
						await rt.reloadFromStorage();
						const loaded = rt.state;
						if (
							Object.keys(loaded.content.items).length !== 5_000 ||
							Object.keys(loaded.maps.maps).length !== 200 ||
							Object.keys(loaded.characters.characters).length !== 40 ||
							loaded.scenes.scenes[loaded.commandCenter.homeSceneId!]?.widgets.length !== 60
						) {
							throw new Error('Large fixture counts changed during storage hydration');
						}
					});
				},
				await largeSnapshotJson(),
			);
			// The setup document's time origin includes fixture construction and restore. A hash
			// navigation would keep that origin, contaminating navigation-based measurements.
			// Keep durable storage/cache, but give every scenario an un-navigated document.
			await page.close();
			page = await context.newPage();
		}
		return { page, close: () => context.close() };
	} catch (error) {
		await context.close();
		throw error;
	}
}

/** Reopen the durable vault in a fresh document within the SAME storage/cache context.
 * Repeated Vite reloads in one Chromium page can exhaust module-loader resources and leave
 * a blank document (net::ERR_INSUFFICIENT_RESOURCES). Closing the old page releases them.
 * Creation/close are outside the navigation-based sample; IndexedDB and HTTP cache persist.
 */
async function reopenPage(page: Page): Promise<Page> {
	const context = page.context();
	const url = page.url();
	await page.close();
	const next = await context.newPage();
	await next.goto(url, { waitUntil: 'domcontentloaded' });
	return next;
}

/**
 * Un-navigated pages for navigation-from-origin samples. A standard sample gets a cold context each
 * time. A large sample needs the restored vault, and the setup page has already loaded the app in its
 * context, so a large batch restores once and gives every sample a new page in that context. Each
 * sample then starts from the same state a freshly restored context offers, without restoring 5,000
 * notes before every navigation.
 */
function samplePages(
	browser: Browser,
	port: number,
	vaultProfile: Options['vaultProfile'],
	storageState?: Record<string, unknown>,
): { next: () => Promise<Page>; close: () => Promise<void> } {
	let current: { page: Page; close: () => Promise<void> } | null = null;
	return {
		next: async () => {
			if (current && vaultProfile === 'large') {
				const context = current.page.context();
				await current.page.close();
				current = { page: await context.newPage(), close: current.close };
				return current.page;
			}
			await current?.close();
			current = null;
			current = await newPage(browser, port, 'desktop', vaultProfile, storageState);
			return current.page;
		},
		close: async () => {
			await current?.close();
			current = null;
		},
	};
}

/** Resolve once the SceneRuntime has hydrated and the shell's main landmark exists. */
async function waitReady(page: Page): Promise<void> {
	await page.waitForFunction(
		() => !!(window as unknown as { __rt?: { loaded?: boolean } }).__rt?.loaded,
		undefined,
		{ timeout: READY_TIMEOUT },
	);
	await page.locator('#main-content').waitFor({ state: 'attached', timeout: READY_TIMEOUT });
}

async function gotoRoute(page: Page, path: string): Promise<void> {
	await page.goto(`/#${path}`, { waitUntil: 'domcontentloaded' });
	await waitReady(page);
}

/** Navigation-from-origin samples must never silently become same-document route transitions. */
async function gotoDocument(page: Page, path: string): Promise<void> {
	const response = await page.goto(`/#${path}`, { waitUntil: 'domcontentloaded' });
	if (response === null) {
		throw new Error('Navigation timing requires a fresh document; setup time must be excluded');
	}
}

interface DispatchResult {
	status: string;
	rejection?: { message?: string };
	events?: Array<Record<string, unknown>>;
}

function dispatch(page: Page, command: Record<string, unknown>): Promise<DispatchResult> {
	return page.evaluate<DispatchResult, Record<string, unknown>>(
		(cmd) =>
			(
				window as unknown as {
					__rt: { dispatch: (c: unknown) => Promise<DispatchResult> };
				}
			).__rt.dispatch(cmd),
		command,
	);
}

function actorId(page: Page): Promise<string> {
	return page.evaluate<string>(
		() => (window as unknown as { __rt: { defaultActorId: string } }).__rt.defaultActorId,
	);
}

/**
 * Seed `count` durable notes through the ordinary `content.create-item` command path, so the vault
 * the timed scenarios read is a REAL vault built by real commands — not a hand-written fixture that
 * skips the op-log the app actually replays.
 */
async function seedNotes(
	page: Page,
	count: number,
	profile: Options['vaultProfile'],
): Promise<number> {
	if (profile === 'large') return 5_000;
	const actor = await actorId(page);
	return page.evaluate<number, { actor: string; count: number }>(
		async ({ actor: a, count: n }) => {
			const rt = (
				window as unknown as {
					__rt: { dispatch: (c: unknown) => Promise<{ status: string }> };
				}
			).__rt;
			let accepted = 0;
			for (let i = 0; i < n; i += 1) {
				const res = await rt.dispatch({
					type: 'content.create-item',
					actorId: a,
					payload: {
						kind: 'note',
						title: `Perf note ${i}`,
						// A body with wiki-links so the graph has real edges to index, not isolated nodes.
						body: `Perf fixture note ${i}. See [[Perf note ${(i + 1) % n}]] and [[Perf note ${(i + 7) % n}]].`,
						visibility: i % 3 === 0 ? 'dm-only' : 'player-visible',
					},
				});
				if (res.status !== 'accepted') throw new Error(`Fixture note ${i} rejected`);
				accepted += 1;
			}
			return accepted;
		},
		{ actor, count },
	);
}

// RC-ENG-3.2 — the standard row's search and graph vault: at least 2,000 notes seeded once per port
// and restored into a fresh context for every batch, including the complete command log. Only the
// durable fixture is reused, never a page or an in-memory index.
const noteCampaigns = new Map<string, { storageState: Record<string, unknown>; seeded: number }>();
async function noteCampaign(browser: Browser, options: Options) {
	const count = Math.max(2000, options.notes);
	const key = `${options.port}:${count}`;
	const existing = noteCampaigns.get(key);
	if (existing) return existing;
	const setup = await newPage(browser, options.port, 'desktop');
	try {
		await gotoRoute(setup.page, '/settings');
		const seeded = await seedNotes(setup.page, count, 'standard');
		const storageState = await setup.page.context().storageState({ indexedDB: true });
		const campaign = { storageState, seeded };
		noteCampaigns.set(key, campaign);
		return campaign;
	} finally {
		await setup.close();
	}
}

/** RC-ENG-3.2 — the standard scene: the demo home scene grown to 50 widgets, 10 bound to maps. */
const sceneCampaigns = new Map<number, Promise<Record<string, unknown>>>();
function sceneCampaign(browser: Browser, port: number): Promise<Record<string, unknown>> {
	let campaign = sceneCampaigns.get(port);
	if (!campaign) {
		campaign = (async () => {
			const setup = await newPage(browser, port, 'desktop');
			try {
				await gotoRoute(setup.page, '/board');
				await setup.page
					.locator('[data-testid^="widget-"]')
					.first()
					.waitFor({ state: 'attached', timeout: READY_TIMEOUT });
				await setup.page.evaluate(seedLargeScene);
				return await setup.page.context().storageState({ indexedDB: true });
			} finally {
				await setup.close();
			}
		})();
		sceneCampaigns.set(port, campaign);
	}
	return campaign;
}

// ── Scenarios ────────────────────────────────────────────────────────────────────────────────────

type Capture = Omit<CapturedBudget, 'budgetId'>;

/** A scenario measures ONE budget. It returns samples, or an empty set plus a reason. */
interface Scenario {
	readonly budgetId: string;
	readonly run: (ctx: ScenarioContext) => Promise<Capture>;
	/**
	 * A budget whose workload does not depend on the vault records the batches another row measured
	 * in the same capture, instead of repeating identical work. Run on its own when that row is not
	 * part of the capture.
	 */
	readonly sharesBatchesWith?: { readonly budgetId: string; readonly fixture: string };
}

interface ScenarioContext {
	readonly browser: Browser;
	/** `options.port` is the dev server of the revision this batch measures. */
	readonly options: Options;
	/** The checkout of the revision this batch measures. */
	readonly root: string;
}

/** Round to 3 decimals so run files diff cleanly without pretending to sub-microsecond precision. */
function round(value: number): number {
	return Math.round(value * 1000) / 1000;
}

/**
 * App startup: a COLD browser context each time (fresh profile, no warm module graph in the page),
 * navigating to the Command Center and timing from navigation start to the moment the runtime has
 * hydrated and the shell's main landmark exists — the first moment the app is usable.
 */
const appStartup: Scenario = {
	budgetId: 'app-startup',
	run: async ({ browser, options }) => {
		const samples: number[] = [];
		const pages = samplePages(browser, options.port, options.vaultProfile);
		// One discarded warm-up: the FIRST navigation of a session pays the dev server's on-demand
		// transform of every route chunk, which is a property of Vite, not of the app's startup path.
		// Every recorded sample is a real cold browser context against an already-warm server.
		try {
			for (let i = -1; i < 3; i += 1) {
				const page = await pages.next();
				await gotoDocument(page, '/');
				await waitReady(page);
				if (i < 0) continue;
				samples.push(
					round(
						await page.evaluate<number>(() => {
							performance.mark('rc-perf:app-startup:ready');
							const measure = performance.measure(
								'rc-perf:app-startup',
								undefined,
								'rc-perf:app-startup:ready',
							);
							return measure.duration;
						}),
					),
				);
			}
		} finally {
			await pages.close();
		}
		return {
			samples,
			scenario:
				'Cold context → navigate to the Command Center → runtime hydrated + shell landmark present.',
			fixture:
				'Fresh profile against the Vite DEV server (which pays a per-module transform a production build does not), warm module cache',
			profile: 'desktop',
		};
	},
};

/**
 * Vault open: a seeded vault is already on disk (IndexedDB); reload and time until the Command
 * Center's own content is on screen. This is the "open my campaign" wait, not the cold shell boot.
 */
const vaultOpen: Scenario = {
	budgetId: 'vault-open',
	run: async ({ browser, options }) => {
		const { page: initialPage, close } = await newPage(
			browser,
			options.port,
			'desktop',
			options.vaultProfile,
		);
		let page = initialPage;
		try {
			await gotoRoute(page, '/');
			const seeded = await seedNotes(page, options.notes, options.vaultProfile);
			const samples: number[] = [];
			for (let i = 0; i < 3; i += 1) {
				page = await reopenPage(page);
				await waitReady(page);
				// The per-route <h1> is always in the DOM but visually hidden in the compact layout, so
				// wait for it ATTACHED (the e2e helpers make the same distinction).
				await page.locator('h1').first().waitFor({ state: 'attached', timeout: READY_TIMEOUT });
				samples.push(
					round(
						await page.evaluate<number>(() => {
							performance.mark('rc-perf:vault-open:ready');
							return performance.measure(
								'rc-perf:vault-open',
								undefined,
								'rc-perf:vault-open:ready',
							).duration;
						}),
					),
				);
			}
			return {
				samples,
				scenario: 'Reopen a seeded vault → runtime hydrated + Command Center heading rendered.',
				fixture: `${seeded} seeded notes + demo content (budget dataset: 1,000 notes / 100 objects / 20 maps)`,
				profile: 'desktop',
			};
		} finally {
			await close();
		}
	},
};

/**
 * Sync reconciliation: the same reload, timed to the moment the runtime finishes REPLAYING the
 * durable op log — before any route renders. Vault open measures what the DM waits for; this
 * measures the replay itself, which is what a growing op log makes slower.
 */
const syncReconciliation: Scenario = {
	budgetId: 'sync-reconciliation',
	run: async ({ browser, options }) => {
		const { page: initialPage, close } = await newPage(
			browser,
			options.port,
			'desktop',
			options.vaultProfile,
		);
		let page = initialPage;
		try {
			await gotoRoute(page, '/');
			const seeded = await seedNotes(page, options.notes, options.vaultProfile);
			const samples: number[] = [];
			for (let i = 0; i < 5; i += 1) {
				page = await reopenPage(page);
				await page.waitForFunction(
					() => !!(window as unknown as { __rt?: { loaded?: boolean } }).__rt?.loaded,
					undefined,
					{ timeout: READY_TIMEOUT },
				);
				samples.push(
					round(
						await page.evaluate<number>(() => {
							performance.mark('rc-perf:sync-reconciliation:replayed');
							return performance.measure(
								'rc-perf:sync-reconciliation',
								undefined,
								'rc-perf:sync-reconciliation:replayed',
							).duration;
						}),
					),
				);
			}
			const ops = await page.evaluate<number>(
				() =>
					(window as unknown as { __rt: { state: { sync: { operations: unknown[] } } } }).__rt.state
						.sync.operations.length,
			);
			return {
				samples,
				scenario: `Reopen → hydrate storage and replay the durable op log (${ops} operations) to a loaded runtime.`,
				// The fixture names the input only. The op count is what the revision under test writes for
				// that input, so it differs between reference and candidate whenever seeding records more
				// ops (RC-KNW-5.2 note history), and CI treats a fixture mismatch as an invalid baseline.
				fixture: `${seeded} seeded notes (budget dataset: 1,000 queued operations)`,
				profile: 'desktop',
			};
		} finally {
			await close();
		}
	},
};

/**
 * Scene first render: navigate straight to the board and time until the bounded GM Screen has
 * actually painted its widgets — a mounted-but-empty board is not a rendered scene.
 */
const sceneFirstRender: Scenario = {
	budgetId: 'scene-first-render',
	run: async ({ browser, options }) => {
		const samples: number[] = [];
		let widgetCount = 0;
		const large = options.vaultProfile === 'large';
		// RC-ENG-3.2 — the standard row measures the budget's dataset: a prepared durable campaign whose
		// home scene holds 50 widgets, 10 of them map tiles bound to maps. Every sample starts cold.
		const storageState = large ? undefined : await sceneCampaign(browser, options.port);
		const pages = samplePages(browser, options.port, options.vaultProfile, storageState);
		// As in app-startup, the first navigation warms the dev server's module graph and is discarded.
		try {
			for (let i = -1; i < 3; i += 1) {
				const page = await pages.next();
				await gotoDocument(page, '/board');
				await page.waitForFunction<boolean>(
					(wantsDataset) => {
						const rt = (
							window as unknown as {
								__rt?: {
									loaded?: boolean;
									state: {
										commandCenter: { homeSceneId: string | null };
										scenes: { scenes: Record<string, { widgets: { binding?: unknown }[] }> };
									};
								};
							}
						).__rt;
						if (!rt?.loaded) return false;
						const id = rt.state.commandCenter.homeSceneId;
						if (!id) return false;
						const widgets = rt.state.scenes.scenes[id]?.widgets ?? [];
						if (widgets.length === 0) return false;
						if (!wantsDataset) {
							// The painted widgets, not just the state: the board's own rendered children,
							// which `SceneBoardCanvas` tags `data-testid="widget-<id>"`.
							const board = document.querySelector('[data-testid="scene-board-bounded"]');
							return !!board && board.querySelectorAll('[data-testid^="widget-"]').length > 0;
						}
						if (widgets.length !== 50 || widgets.filter((w) => w.binding).length !== 10)
							return false;
						const board = document.querySelector('[data-testid="scene-board-bounded"]');
						return (
							!!board &&
							board.querySelectorAll('[data-testid^="widget-"]').length === 50 &&
							board.querySelectorAll('[data-testid="map-tile"]').length === 10
						);
					},
					!large,
					{ timeout: READY_TIMEOUT, polling: 'raf' },
				);
				if (i < 0) continue;
				samples.push(
					round(
						await page.evaluate<number>(() => {
							performance.mark('rc-perf:scene-first-render:painted');
							return performance.measure(
								'rc-perf:scene-first-render',
								undefined,
								'rc-perf:scene-first-render:painted',
							).duration;
						}),
					),
				);
				widgetCount = await page.evaluate<number>(
					() =>
						document.querySelectorAll(
							'[data-testid="scene-board-bounded"] [data-testid^="widget-"]',
						).length,
				);
			}
		} finally {
			await pages.close();
		}
		return {
			samples,
			scenario: 'Cold context → /board → home scene widgets painted on the bounded GM Screen.',
			fixture: large
				? `Demo-seeded home scene, ${widgetCount} painted widgets (budget dataset: 50 widgets / 10 active bindings)`
				: `Cold context with prepared durable campaign, ${widgetCount} painted widgets / 10 active map bindings (budget dataset: 50 widgets / 10 active bindings)`,
			profile: 'desktop',
		};
	},
};

/**
 * Widget update: move a widget through the real `scene.move-widget` command and time the round trip
 * — command accepted, state updated, and the moved widget repainted at its new position. Timed
 * inside the page across a rAF so the sample includes the render the DM waits for, not just the
 * command's promise.
 */
/** `widget-update` moves the home scene's first widget to each of these rows, one command per sample. */
export const WIDGET_UPDATE_ROWS: readonly number[] = Array.from(
	{ length: 25 },
	(_, i) => 40 + (i % 8) * 30,
);

/** `graph-indexing` adds each of these linked notes, one `content.create-item` per sample. */
export const GRAPH_INDEXING_NOTES: readonly {
	kind: 'note';
	title: string;
	body: string;
	visibility: 'player-visible';
}[] = Array.from({ length: 5 }, (_, i) => ({
	kind: 'note',
	title: `Perf indexed note ${i}`,
	body: 'Linked to [[Perf note 1]] and [[Perf note 2]].',
	visibility: 'player-visible',
}));

/**
 * The commands each :large scenario dispatches after its snapshot is restored, built from the same
 * data the scenarios send. `seedNotes` and the map rows write nothing on the large profile; only
 * `widget-update` and `graph-indexing` commit. `tests/perf/large-vault.test.ts` replays these through
 * the storage boundary, so a scenario that starts writing on the large vault must be listed here.
 */
export function largeScenarioCommits(
	state: CoreStateSlice,
	actorId: string,
): Record<string, { type: string; actorId: string; payload: Record<string, unknown> }[]> {
	const sceneId = state.commandCenter.homeSceneId!;
	const widget = state.scenes.scenes[sceneId].widgets[0];
	const commits: Record<
		string,
		{ type: string; actorId: string; payload: Record<string, unknown> }[]
	> = Object.fromEntries(STANDARD_SCENARIOS.map((scenario) => [`${scenario.budgetId}:large`, []]));
	commits['widget-update:large'] = WIDGET_UPDATE_ROWS.map((y) => ({
		type: 'scene.move-widget',
		actorId,
		payload: { sceneId, widgetInstanceId: widget.id, x: widget.layout.x, y },
	}));
	commits['graph-indexing:large'] = GRAPH_INDEXING_NOTES.map((payload) => ({
		type: 'content.create-item',
		actorId,
		payload: { ...payload },
	}));
	return commits;
}

const widgetUpdate: Scenario = {
	budgetId: 'widget-update',
	run: async ({ browser, options }) => {
		const { page, close } = await newPage(browser, options.port, 'desktop', options.vaultProfile);
		try {
			await page.goto('/#/board', { waitUntil: 'domcontentloaded' });
			await waitReady(page);
			await page.waitForFunction(
				() => {
					const rt = (
						window as unknown as {
							__rt?: {
								state: {
									commandCenter: { homeSceneId: string | null };
									scenes: { scenes: Record<string, { widgets: unknown[] }> };
								};
							};
						}
					).__rt;
					const id = rt?.state.commandCenter.homeSceneId;
					return !!id && (rt?.state.scenes.scenes[id]?.widgets.length ?? 0) > 0;
				},
				undefined,
				{ timeout: READY_TIMEOUT },
			);
			const samples = await page.evaluate<number[], readonly number[]>(async (rows) => {
				interface Widget {
					id: string;
					layout: { x: number; y: number };
				}
				const rt = (
					window as unknown as {
						__rt: {
							defaultActorId: string;
							dispatch: (c: unknown) => Promise<{ status: string }>;
							state: {
								commandCenter: { homeSceneId: string | null };
								scenes: { scenes: Record<string, { widgets: Widget[] }> };
							};
						};
					}
				).__rt;
				const sceneId = rt.state.commandCenter.homeSceneId!;
				const widget = rt.state.scenes.scenes[sceneId].widgets[0];
				const out: number[] = [];
				for (const y of rows) {
					const started = performance.now();
					performance.mark('rc-perf:widget-update:start');
					const res = await rt.dispatch({
						type: 'scene.move-widget',
						actorId: rt.defaultActorId,
						payload: { sceneId, widgetInstanceId: widget.id, x: widget.layout.x, y },
					});
					if (res.status !== 'accepted') continue;
					// Wait for the frame that paints the new position, so the sample is what the DM sees.
					await new Promise<void>((done) => requestAnimationFrame(() => done()));
					performance.mark('rc-perf:widget-update:painted');
					performance.measure(
						'rc-perf:widget-update',
						'rc-perf:widget-update:start',
						'rc-perf:widget-update:painted',
					);
					out.push(Math.round((performance.now() - started) * 1000) / 1000);
				}
				return out;
			}, WIDGET_UPDATE_ROWS);
			return {
				samples,
				scenario: 'Dispatch scene.move-widget 25× and time command acceptance → repainted frame.',
				fixture: 'Single accepted command on the demo home scene',
				profile: 'desktop',
			};
		} finally {
			await close();
		}
	},
};

/**
 * Live session delivery: enter and leave "preview as player", timing how long the DM's own client
 * takes to produce and paint the player-safe projection. That projection is the payload a remote
 * player receives, so this is the delivery path minus the network — named plainly in `fixture`,
 * because a captured number that quietly excluded the transport would be a lie.
 */
const liveSessionDelivery: Scenario = {
	budgetId: 'live-session-delivery',
	run: async ({ browser, options }) => {
		const { page, close } = await newPage(browser, options.port, 'desktop', options.vaultProfile);
		try {
			await gotoRoute(page, '/');
			const samples = await page.evaluate<number[], number>(async (runs) => {
				const rt = (
					window as unknown as {
						__rt: {
							enterPreview: (s: { role: 'player' | 'observer' }) => void;
							exitPreview: () => void;
							preview: { role: string } | null;
						};
					}
				).__rt;
				const out: number[] = [];
				for (let i = 0; i < runs; i += 1) {
					const started = performance.now();
					performance.mark('rc-perf:live-session-delivery:start');
					rt.enterPreview({ role: 'player' });
					await new Promise<void>((done) => requestAnimationFrame(() => done()));
					if (rt.preview?.role !== 'player') continue;
					performance.mark('rc-perf:live-session-delivery:projected');
					performance.measure(
						'rc-perf:live-session-delivery',
						'rc-perf:live-session-delivery:start',
						'rc-perf:live-session-delivery:projected',
					);
					out.push(Math.round((performance.now() - started) * 1000) / 1000);
					rt.exitPreview();
					await new Promise<void>((done) => requestAnimationFrame(() => done()));
				}
				return out;
			}, 15);
			return {
				samples,
				scenario:
					'Project the DM state to a player view 15× and time until the projection is painted.',
				fixture:
					'Local player-safe projection of the demo vault; the network hop is NOT included (budget dataset: near-real-time projected session ops)',
				profile: 'desktop',
			};
		} finally {
			await close();
		}
	},
};

/** Matches no node title, folder or tag in the large vault, so the result list starts empty. */
const LARGE_SEARCH_RESET = 'rc-perf-no-match';

/** Fill the graph search box and time until the result list settles on the new query. */
const search: Scenario = {
	budgetId: 'search',
	run: async ({ browser, options }) => {
		// The standard row restores the prepared note campaign (RC-ENG-3.2); the large vault was
		// restored before this document loaded. Either way the query runs against stored data.
		const large = options.vaultProfile === 'large';
		const campaign = large ? null : await noteCampaign(browser, options);
		const { page, close } = await newPage(
			browser,
			options.port,
			'desktop',
			options.vaultProfile,
			campaign?.storageState,
		);
		try {
			await gotoRoute(page, '/graph');
			const seeded = campaign?.seeded ?? (await seedNotes(page, options.notes, 'large'));
			const box = page.getByRole('textbox', { name: 'Search the graph' });
			await box.waitFor({ state: 'visible', timeout: READY_TIMEOUT });
			const samples: number[] = [];
			// Clearing the box lists every node. On the large vault that re-renders 5,000 rows between
			// samples, so each large sample starts from a query that matches nothing instead.
			const reset = options.vaultProfile === 'large' ? LARGE_SEARCH_RESET : '';
			for (let i = 0; i < 20; i += 1) {
				const query = `Perf note ${i}`;
				await box.fill(reset);
				await page.evaluate<void>(() => {
					performance.mark('rc-perf:search:start');
				});
				await box.fill(query);
				await page.waitForFunction<string>(
					(needle) => {
						const main = document.querySelector('#main-content');
						if (!main) return false;
						const rows = Array.from(main.querySelectorAll('button')).filter((b) =>
							(b.textContent ?? '').includes(needle),
						);
						return rows.length > 0;
					},
					query,
					{ timeout: 15_000, polling: 'raf' },
				);
				samples.push(
					round(
						await page.evaluate<number>(() => {
							performance.mark('rc-perf:search:results');
							return performance.measure(
								'rc-perf:search',
								'rc-perf:search:start',
								'rc-perf:search:results',
							).duration;
						}),
					),
				);
			}
			return {
				samples,
				scenario:
					'Type 20 distinct queries into Graph & Search and time each until its result row appears.',
				fixture: `${seeded} seeded notes + demo content (budget dataset: 10,000 indexed records)`,
				profile: 'desktop',
			};
		} finally {
			await close();
		}
	},
};

/**
 * Graph indexing: change ONE note in the seeded vault and time until the graph reflects it — the
 * affected-node update the budget owns, measured end to end rather than estimated by a cost model.
 */
const graphIndexing: Scenario = {
	budgetId: 'graph-indexing',
	run: async ({ browser, options }) => {
		const large = options.vaultProfile === 'large';
		const campaign = large ? null : await noteCampaign(browser, options);
		const { page, close } = await newPage(
			browser,
			options.port,
			'desktop',
			options.vaultProfile,
			campaign?.storageState,
		);
		try {
			await gotoRoute(page, '/graph');
			const seeded = campaign?.seeded ?? (await seedNotes(page, options.notes, 'large'));
			// `gotoRoute` resolves once the shell exists, before the lazy Graph screen has fetched and
			// rendered. Wait for it as `search` does, so the first sample times one note's update, not
			// however much of the screen's first mount happened to overlap it (RC-ENG-3.2).
			await page
				.getByRole('textbox', { name: 'Search the graph' })
				.waitFor({ state: 'visible', timeout: READY_TIMEOUT });
			const actor = await actorId(page);
			const samples = await page.evaluate<
				number[],
				{ actor: string; notes: typeof GRAPH_INDEXING_NOTES }
			>(
				async ({ actor: a, notes }) => {
					const rt = (
						window as unknown as {
							__rt: { dispatch: (c: unknown) => Promise<{ status: string }> };
						}
					).__rt;
					const out: number[] = [];
					for (const note of notes) {
						const title = note.title;
						const started = performance.now();
						performance.mark('rc-perf:graph-indexing:start');
						const res = await rt.dispatch({
							type: 'content.create-item',
							actorId: a,
							payload: note,
						});
						if (res.status !== 'accepted') continue;
						// Wait for the graph rail to show the changed note — the affected-node update.
						// NOTE: no named inner function here. `tsx` compiles this file with esbuild's
						// keep-names transform, which rewrites a named function/arrow into a `__name(...)`
						// call — and `__name` does not exist inside the page, so the evaluate would throw.
						const deadline = performance.now() + 10_000;
						while (performance.now() < deadline) {
							const main = document.querySelector('#main-content');
							const hit =
								!!main &&
								Array.from(main.querySelectorAll('button')).some((b) =>
									(b.textContent ?? '').includes(title),
								);
							if (hit) break;
							await new Promise<void>((done) => requestAnimationFrame(() => done()));
						}
						if (performance.now() >= deadline)
							throw new Error('Graph node did not appear before the deadline');
						performance.mark('rc-perf:graph-indexing:reindexed');
						performance.measure(
							'rc-perf:graph-indexing',
							'rc-perf:graph-indexing:start',
							'rc-perf:graph-indexing:reindexed',
						);
						out.push(Math.round((performance.now() - started) * 1000) / 1000);
					}
					return out;
				},
				{ actor, notes: GRAPH_INDEXING_NOTES },
			);
			return {
				samples,
				scenario: 'Add one linked note 5× and time until the graph rail shows the affected node.',
				fixture: `One changed note in a ${seeded}-note vault (budget dataset: one changed note in a 10,000-record vault)`,
				profile: 'desktop',
			};
		} finally {
			await close();
		}
	},
};

/** The standard map scenario's dataset, built through real `map.create` / `map.create-poi` commands. */
async function seedPanZoomMap(
	page: Page,
	profile: 'desktop' | 'slim',
): Promise<{ mapName: string; poiCount: number } | { unavailableReason: string }> {
	const actor = await actorId(page);
	const mapName = `Perf map ${profile}`;
	const created = await dispatch(page, {
		type: 'map.create',
		actorId: actor,
		payload: {
			name: mapName,
			visibility: 'dm-only',
			projection: { kind: 'flat', rotationDegrees: 0 },
			initialLayers: [
				{ name: 'Base', category: 'base', visibility: 'dm-only' },
				{ name: 'Terrain', category: 'terrain', visibility: 'dm-only' },
				{ name: 'Roads', category: 'roads', visibility: 'dm-only' },
				{ name: 'Points of interest', category: 'poi', visibility: 'dm-only' },
			],
		},
	});
	const mapId = (created.events ?? [])
		.map((event) => event as { kind?: string; mapId?: string })
		.find((event) => event.kind === 'map.created')?.mapId;
	if (created.status !== 'accepted' || !mapId) {
		return {
			unavailableReason: `map.create was ${created.status}${created.rejection?.message ? `: ${created.rejection.message}` : ''}; no map to pan.`,
		};
	}
	// RC-ENG-3.2 — the budget's map carries generated world output, not just hand-placed POIs.
	const generated = await dispatch(page, {
		type: 'map.generate',
		actorId: actor,
		payload: {
			mapId,
			generatorId: 'world.continent',
			seed: 'runtime-recovery',
			params: {},
			idPrefix: 'perf-world',
			visibility: 'dm-only',
		},
	});
	if (generated.status !== 'accepted')
		throw new Error(`World generation rejected: ${JSON.stringify(generated.rejection)}`);
	const layerIds = await page.evaluate<string[], string>(
		(id) =>
			Object.values(
				(
					window as unknown as {
						__rt: {
							state: {
								maps: {
									maps: Record<string, { id: string; layers: Record<string, { id: string }> }>;
								};
							};
						};
					}
				).__rt.state.maps.maps[id]?.layers ?? {},
			).map((layer) => layer.id),
		mapId,
	);
	if (layerIds.length === 0) {
		return { unavailableReason: 'the created map exposed no layers to place POIs on.' };
	}
	const poiCount = await page.evaluate<
		number,
		{ actor: string; mapId: string; layerIds: string[] }
	>(
		async ({ actor: a, mapId: m, layerIds: layers }) => {
			const rt = (
				window as unknown as {
					__rt: { dispatch: (c: unknown) => Promise<{ status: string }> };
				}
			).__rt;
			let placed = 0;
			for (let i = 0; i < 100; i += 1) {
				const res = await rt.dispatch({
					type: 'map.create-poi',
					actorId: a,
					payload: {
						mapId: m,
						// PLAT-006: the core mints the id; the harness never invents one.
						layerId: layers[i % layers.length],
						label: `Perf POI ${i}`,
						category: 'other',
						position: { x: 0.05 + ((i * 37) % 90) / 100, y: 0.05 + ((i * 53) % 90) / 100 },
						visibility: 'dm-only',
					},
				});
				if (res.status === 'accepted') placed += 1;
			}
			return placed;
		},
		{ actor, mapId, layerIds },
	);
	return { mapName, poiCount };
}

/**
 * The large vault already holds the same 4-layer / 100-POI map, built by the same commands. Creating
 * it here instead would commit 101 times through the storage boundary of a 5,000-note vault, which
 * the pinned reference validates at twice the vault's size.
 */
async function largeSnapshotMap(
	page: Page,
): Promise<{ mapName: string; poiCount: number } | { unavailableReason: string }> {
	const map = await page.evaluate<{ layers: number; pois: number } | null, string>((name) => {
		const maps = (
			window as unknown as {
				__rt: {
					state: {
						maps: { maps: Record<string, { name: string; layers: unknown[]; pois: unknown[] }> };
					};
				};
			}
		).__rt.state.maps.maps;
		const found = Object.values(maps).find((candidate) => candidate.name === name);
		return found ? { layers: found.layers.length, pois: found.pois.length } : null;
	}, LARGE_VAULT_PAN_ZOOM_MAP.name);
	if (
		!map ||
		map.layers !== LARGE_VAULT_PAN_ZOOM_MAP.layers ||
		map.pois !== LARGE_VAULT_PAN_ZOOM_MAP.pois
	) {
		return {
			unavailableReason: `the restored large vault has no ${LARGE_VAULT_PAN_ZOOM_MAP.layers}-layer / ${LARGE_VAULT_PAN_ZOOM_MAP.pois}-POI "${LARGE_VAULT_PAN_ZOOM_MAP.name}".`,
		};
	}
	return { mapName: LARGE_VAULT_PAN_ZOOM_MAP.name, poiCount: map.pois };
}

/**
 * Map pan/zoom frame rate on one viewport profile: build the declared fixture (4 layers, 100 POIs)
 * through real `map.create` / `map.create-layer` / `map.create-poi` commands, open the full-screen
 * editor, then pan and zoom while sampling every animation frame. Each sample is one frame's
 * instantaneous rate; the core grades the SLOW tail of those samples against the fps floor.
 */
function mapPanZoom(budgetId: string, profile: 'desktop' | 'slim'): Scenario {
	return {
		budgetId,
		run: async ({ browser, options }) => {
			const { page, close } = await newPage(browser, options.port, profile, options.vaultProfile);
			try {
				await gotoRoute(page, '/atlas');
				const seeded =
					options.vaultProfile === 'large'
						? await largeSnapshotMap(page)
						: await seedPanZoomMap(page, profile);
				if ('unavailableReason' in seeded) {
					return {
						samples: [],
						scenario: 'Pan and zoom the full-screen map editor while sampling animation frames.',
						fixture: '4 layers / 100 POIs',
						profile,
						unavailableReason: seeded.unavailableReason,
					};
				}
				const { mapName, poiCount } = seeded;
				const fixture =
					options.vaultProfile === 'large'
						? `4 layers / ${poiCount} POIs`
						: `world.continent default output (seed runtime-recovery) + 4 layers / ${poiCount} additional POIs`;

				// Open the map in the full-screen editor — the only surface where the canvas is pannable.
				// A map seeded in-page is reloaded first; the large snapshot's map was restored before
				// this document loaded.
				if (options.vaultProfile !== 'large') {
					await page.reload({ waitUntil: 'domcontentloaded' });
					await waitReady(page);
				}
				const chip = page.getByRole('button', { name: new RegExp(mapName) }).first();
				await chip.waitFor({ state: 'visible', timeout: READY_TIMEOUT });
				await chip.click();
				const open = page.getByRole('button', { name: 'Open in map editor' });
				await open.waitFor({ state: 'visible', timeout: READY_TIMEOUT });
				await open.click();
				const editor = page.getByRole('dialog', { name: new RegExp('^Map editor') });
				await editor.waitFor({ state: 'visible', timeout: READY_TIMEOUT });
				const well = page.locator('[data-testid="map-canvas-well"]').first();
				await well.waitFor({ state: 'visible', timeout: READY_TIMEOUT });
				const box = await well.boundingBox();
				if (!box) {
					return {
						samples: [],
						scenario: 'Pan and zoom the full-screen map editor while sampling animation frames.',
						fixture,
						profile,
						unavailableReason: 'the editor canvas had no layout box to pan.',
					};
				}

				// Start recording frames, then drive a real pan gesture and two wheel zooms over it.
				// Start recording frames. The recorder is an await loop rather than a named rAF callback:
				// `tsx`'s esbuild keep-names transform would rewrite a named callback into a `__name(...)`
				// call that does not exist inside the page.
				const recording = page.evaluate<void>(async () => {
					const store = window as unknown as { __rcPerfFrames?: number[]; __rcPerfStop?: boolean };
					store.__rcPerfFrames = [];
					store.__rcPerfStop = false;
					let last = performance.now();
					const deadline = last + 20_000;
					while (
						!store.__rcPerfStop &&
						store.__rcPerfFrames.length < 900 &&
						performance.now() < deadline
					) {
						const now = await new Promise<number>((done) =>
							requestAnimationFrame((stamp) => done(stamp)),
						);
						const delta = now - last;
						last = now;
						if (delta > 0) store.__rcPerfFrames.push(1000 / delta);
					}
				});
				const cx = box.x + box.width / 2;
				const cy = box.y + box.height / 2;
				await page.mouse.move(cx, cy);
				await page.mouse.down();
				for (let i = 0; i < 4; i += 1) {
					await page.mouse.move(cx + box.width * 0.25, cy + box.height * 0.2, { steps: 20 });
					await page.mouse.move(cx - box.width * 0.25, cy - box.height * 0.2, { steps: 20 });
				}
				await page.mouse.up();
				await page.mouse.wheel(0, -240);
				await page.waitForTimeout(250);
				await page.mouse.wheel(0, 240);
				await page.waitForTimeout(250);
				await page.evaluate<void>(() => {
					// Signal the recorder to stop, so it exits on its next frame instead of padding samples.
					(window as unknown as { __rcPerfStop?: boolean }).__rcPerfStop = true;
				});
				await recording;
				const samples = await page.evaluate<number[]>(() => {
					const store = window as unknown as { __rcPerfFrames?: number[] };
					const frames = (store.__rcPerfFrames ?? []).map((fps) => Math.round(fps * 1000) / 1000);
					store.__rcPerfFrames = [];
					// Drop the first frame: its delta is measured from the moment recording started, not
					// from a previous painted frame.
					return frames.slice(1);
				});
				return {
					samples,
					scenario:
						'Drag-pan the full-screen map editor 8× across the canvas and wheel-zoom twice, sampling every animation frame.',
					fixture,
					profile,
				};
			} finally {
				await close();
			}
		},
	};
}

/**
 * Smoke CI: the only budget that is not a browser workflow. It runs the repo's own `test:smoke`
 * target and times it, because that is exactly what the budget owns — how long a contributor waits
 * for smoke feedback. One sample; the budget grades the worst run.
 */
const smokeCi: Scenario = {
	budgetId: 'smoke-ci',
	run: async ({ root }) => {
		const started = Date.now();
		const result = spawnSync('pnpm', ['test:smoke'], {
			cwd: root,
			encoding: 'utf8',
			timeout: 15 * 60 * 1000,
		});
		const elapsed = Date.now() - started;
		if (result.status !== 0) {
			return {
				samples: [],
				scenario: 'Run `pnpm test:smoke` and time it.',
				fixture: 'This runner',
				profile: 'node',
				unavailableReason: `pnpm test:smoke exited ${result.status ?? 'null'}; a failing smoke run is not a timing sample.`,
			};
		}
		return {
			samples: [round(elapsed)],
			scenario: 'Run `pnpm test:smoke` (boundary lint + typecheck) and time it end to end.',
			fixture: 'This runner, warm pnpm store',
			profile: 'node',
		};
	},
};

const STANDARD_SCENARIOS: readonly Scenario[] = [
	smokeCi,
	appStartup,
	vaultOpen,
	sceneFirstRender,
	widgetUpdate,
	mapPanZoom('map-pan-zoom-desktop', 'desktop'),
	mapPanZoom('map-pan-zoom-slim', 'slim'),
	search,
	graphIndexing,
	syncReconciliation,
	liveSessionDelivery,
];

const SMOKE_CI_LARGE_FIXTURE = `${LARGE_VAULT_DATASET}; smoke CI does not open the browser vault, so this row records the smoke-ci batches measured in the same capture`;

/** Each fixture is a separate baseline key; never overwrite the standard observation. */
export const SCENARIOS: readonly Scenario[] = [
	...STANDARD_SCENARIOS,
	...STANDARD_SCENARIOS.map(
		(scenario): Scenario => ({
			budgetId: `${scenario.budgetId}:large`,
			...(scenario.budgetId === 'smoke-ci'
				? { sharesBatchesWith: { budgetId: scenario.budgetId, fixture: SMOKE_CI_LARGE_FIXTURE } }
				: {}),
			run: async (ctx) => {
				const capture = await scenario.run({
					...ctx,
					options: { ...ctx.options, vaultProfile: 'large' },
				});
				return {
					...capture,
					scenario: capture.scenario.replace(
						'Cold context',
						'Restored context (once per batch), new page per sample',
					),
					fixture:
						scenario.budgetId === 'smoke-ci'
							? SMOKE_CI_LARGE_FIXTURE
							: `${LARGE_VAULT_DATASET}; compacted snapshot + ${LARGE_VAULT_NOTE_EDITS} note edits${
									scenario.budgetId.startsWith('map-pan-zoom')
										? `; pans the snapshot's "${LARGE_VAULT_PAN_ZOOM_MAP.name}" (${LARGE_VAULT_PAN_ZOOM_MAP.layers} layers / ${LARGE_VAULT_PAN_ZOOM_MAP.pois} POIs)`
										: scenario.budgetId === 'search'
											? `; each query starts from an empty result list ("${LARGE_SEARCH_RESET}")`
											: scenario.budgetId === 'graph-indexing'
												? '; add five linked notes'
												: scenario.budgetId === 'live-session-delivery'
													? '; local projection, network hop excluded'
													: ''
								}`,
				};
			},
		}),
	),
];

// ── Runner ───────────────────────────────────────────────────────────────────────────────────────

async function loadChromium(): Promise<ChromiumLauncher> {
	const requireFromApp = createRequire(join(REPO_ROOT, 'apps/gm-react/package.json'));
	const entry = requireFromApp.resolve('@playwright/test');
	// `@playwright/test` is CommonJS, so a dynamic import may surface its exports on the namespace
	// object, on `default`, or both depending on how the loader interops it. Accept either shape.
	const mod = (await import(pathToFileURL(entry).href)) as {
		chromium?: ChromiumLauncher;
		default?: { chromium?: ChromiumLauncher };
	};
	const chromium = mod.chromium ?? mod.default?.chromium;
	if (!chromium) throw new Error('@playwright/test resolved without a chromium launcher');
	return chromium;
}

function hostDescription(): PerfRunFile['host'] {
	const cores = cpus();
	return {
		hostname: process.env.CI ? 'ci-runner' : hostname(),
		os: `${type()} ${process.platform} ${process.arch}`,
		cpuCount: cores.length,
		cpuModel: cores[0]?.model ?? 'unknown',
		totalMemoryMb: Math.round(totalmem() / (1024 * 1024)),
		ci: !!process.env.CI,
		runnerLabel: process.env.PERF_RUNNER_LABEL ?? process.env.RUNNER_NAME ?? 'local',
	};
}

/** One revision a capture measures: its checkout, the port its dev server uses, and its run file. */
interface Side {
	readonly label: 'reference' | 'candidate';
	readonly root: string;
	readonly port: number;
	readonly out: string;
}

/**
 * The order the revisions run in on batch `repeat`: as given on even repeats, reversed on odd ones.
 * Pairing batches in time means a machine that speeds up or slows down mid-job moves both revisions
 * together, and alternating which goes first cancels any bias from always running second.
 */
export function interleavedOrder<T>(sides: readonly T[], repeat: number): T[] {
	return repeat % 2 === 0 ? [...sides] : [...sides].reverse();
}

async function main(): Promise<void> {
	const options = parseOptions(process.argv.slice(2));
	const selected = SCENARIOS.filter(
		(scenario) =>
			(options.only === null ||
				options.only.has(scenario.budgetId) ||
				options.only.has(scenario.budgetId.replace(/:large$/, ''))) &&
			!options.skip.has(scenario.budgetId) &&
			!options.skip.has(scenario.budgetId.replace(/:large$/, '')),
	);
	if (selected.length === 0) throw new Error('no scenarios selected; check --only / --skip');

	const sides: Side[] = [];
	if (options.referenceRoot !== null) {
		if (options.referenceOut === null || options.referencePort === options.port) {
			throw new Error(
				'--reference-root needs --reference-out and a --reference-port distinct from --port',
			);
		}
		sides.push({
			label: 'reference',
			root: resolve(options.referenceRoot),
			port: options.referencePort,
			out: options.referenceOut,
		});
	}
	sides.push({ label: 'candidate', root: REPO_ROOT, port: options.port, out: options.out });
	const paired = sides.length > 1;
	const revisions = new Map(sides.map((side) => [side.label, captureRevision(side.root)]));

	const needsBrowser = selected.some((scenario) => !scenario.budgetId.startsWith('smoke-ci'));
	const servers: Array<{ stop: () => Promise<void> }> = [];
	let browser: Browser | null = null;
	const captured = new Map<Side['label'], CapturedBudget[]>(sides.map((side) => [side.label, []]));
	// Completed seven-batch captures by budget id, for rows that share another row's batches.
	const measured = new Map<string, Map<Side['label'], Capture[]>>();
	try {
		if (needsBrowser) {
			for (const side of sides) {
				const server = await ensureDevServer(side.port, side.root);
				servers.push(server);
				// A reused server could be serving any revision; a paired capture must know which it measures.
				if (paired && server.reused) {
					throw new Error(
						`:${side.port} already had a server listening; a paired capture starts its own.`,
					);
				}
				console.log(
					server.reused
						? `· reusing the dev server already on :${side.port}`
						: `· started a dev server on :${side.port}${paired ? ` (${side.label})` : ''}`,
				);
			}
			const chromium = await loadChromium();
			browser = await chromium.launch({ headless: !options.headed });
		}
		for (const scenario of selected) {
			const label = scenario.budgetId;
			process.stdout.write(`· ${label} … `);
			const started = Date.now();
			try {
				const sharing = scenario.sharesBatchesWith;
				const shared = sharing ? measured.get(sharing.budgetId) : undefined;
				const batches = new Map<Side['label'], Capture[]>(
					sides.map((side) => [
						side.label,
						(shared?.get(side.label) ?? []).map((batch) => ({
							...batch,
							fixture: sharing!.fixture,
						})),
					]),
				);
				for (let repeat = shared ? 7 : 0; repeat < 7; repeat += 1) {
					for (const side of interleavedOrder(sides, repeat)) {
						const batch = await scenario
							.run({
								browser: browser as Browser,
								options: { ...options, port: side.port },
								root: side.root,
							})
							.catch((error: unknown) => {
								throw new Error(`${side.label} batch ${repeat + 1}: ${String(error)}`, {
									cause: error,
								});
							});
						if (batch.samples.length === 0) {
							throw new Error(`${side.label}: ${batch.unavailableReason ?? 'empty batch'}`);
						}
						batches.get(side.label)!.push(batch);
					}
				}
				for (const side of sides) {
					const sideBatches = batches.get(side.label)!;
					captured.get(side.label)!.push({
						budgetId: label,
						...sideBatches[0],
						samples: sideBatches.flatMap((batch) => [...batch.samples]),
						repetitions: sideBatches.map((batch) => batch.samples),
					});
				}
				measured.set(label, batches);
				const candidate = batches.get('candidate')!;
				console.log(
					shared
						? `${candidate.flatMap((batch) => batch.samples).length} samples per revision, shared with ${sharing!.budgetId}`
						: `${candidate.flatMap((batch) => batch.samples).length} samples${paired ? ' per revision, interleaved,' : ''} in ${Math.round((Date.now() - started) / 1000)}s`,
				);
			} catch (error) {
				// A scenario that throws records ZERO samples and the reason, on every side of a paired
				// capture, so neither file can grade a half-measured budget. It must never be omitted: a
				// missing budget would silently shrink the report, while an empty one grades `unknown`.
				const reason = error instanceof Error ? error.message : String(error);
				for (const side of sides) {
					captured.get(side.label)!.push({
						budgetId: label,
						samples: [],
						scenario: 'Scenario failed before it could record a sample.',
						fixture: 'n/a',
						profile: 'node',
						unavailableReason: reason,
					});
				}
				console.log(`FAILED (${reason.split('\n')[0]})`);
			}
		}
	} finally {
		await browser?.close();
		for (const server of servers) await server.stop();
	}

	// RC-ENG-3.2 — each run file names the exact tree it measured, and a checkout that moved mid-capture
	// fails instead of mislabelling its numbers.
	for (const side of sides) assertSameRevision(side.root, revisions.get(side.label)!);
	const capturedAt = new Date().toISOString();
	for (const side of sides) {
		const budgets = captured.get(side.label)!;
		const run: PerfRunFile = {
			schemaVersion: 1,
			capturedAt,
			commit: revisions.get(side.label)!.commit,
			sourceTree: revisions.get(side.label)!.tree,
			aggregation: 'median-of-batches-v1',
			host: hostDescription(),
			budgets,
		};
		mkdirSync(dirname(side.out), { recursive: true });
		writeFileSync(side.out, `${JSON.stringify(run, null, '\t')}\n`, 'utf8');
		console.log(
			`\nWrote ${side.out} (${budgets.length} budgets${paired ? `, ${side.label}` : ''}).`,
		);
		const empty = budgets.filter((entry) => entry.samples.length === 0);
		if (empty.length > 0) {
			process.exitCode = 1;
			console.log(
				`${empty.length} budget(s) recorded no samples: ${empty.map((entry) => entry.budgetId).join(', ')}`,
			);
		}
	}
}

// Run only when executed directly, so the unit tests can import `interleavedOrder`.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	main().catch((error: unknown) => {
		console.error(error);
		process.exitCode = 1;
	});
}
