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
 *
 * `--only` / `--skip` take comma-separated budget ids. With no filter every budget is captured.
 */

import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { cpus, hostname, totalmem, type } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
	newPage(): Promise<Page>;
	close(): Promise<void>;
}

interface Browser {
	newContext(options?: {
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
	only: Set<string> | null;
	skip: Set<string>;
	headed: boolean;
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
		only: flags.has('only') ? list(flags.get('only')) : null,
		skip: list(flags.get('skip')),
		headed: bare.has('headed'),
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
async function ensureDevServer(port: number): Promise<{ stop: () => void; reused: boolean }> {
	if (await isPortOpen(port)) return { stop: () => {}, reused: true };
	mkdirSync(join(REPO_ROOT, 'tmp'), { recursive: true });
	const log = createWriteStream(join(REPO_ROOT, 'tmp/perf-dev-server.log'), { flags: 'a' });
	const child = spawn(
		'pnpm',
		['--filter', '@dndtools/gm-react', 'exec', 'vite', '--port', String(port)],
		{
			cwd: REPO_ROOT,
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
		stop: () => {
			if (child.pid !== undefined) {
				try {
					process.kill(-child.pid, 'SIGTERM');
				} catch {
					/* already gone */
				}
			}
		},
	};
}

// ── Page drivers (the same idioms the e2e suite uses: `__rt`, HashRouter, no brittle test-ids) ───

const READY_TIMEOUT = 30_000;

async function newPage(
	browser: Browser,
	port: number,
	profile: 'desktop' | 'slim',
): Promise<{ page: Page; close: () => Promise<void> }> {
	const context = await browser.newContext({
		baseURL: `http://localhost:${port}`,
		viewport: profile === 'desktop' ? { width: 1280, height: 800 } : { width: 390, height: 844 },
		deviceScaleFactor: 1,
		isMobile: false,
		hasTouch: profile === 'slim',
	});
	const page = await context.newPage();
	// The first-run onboarding overlay covers every surface; bypass it before the first navigation
	// exactly as `tests/e2e/_helpers.ts` does.
	await page.addInitScript(() => {
		try {
			window.localStorage.setItem('dndtools:react:onboarded', 'gate');
		} catch {
			/* storage may be unavailable; the bypass is best-effort */
		}
	});
	return { page, close: () => context.close() };
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
async function seedNotes(page: Page, count: number): Promise<number> {
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
				if (res.status === 'accepted') accepted += 1;
			}
			return accepted;
		},
		{ actor, count },
	);
}

// ── Scenarios ────────────────────────────────────────────────────────────────────────────────────

type Capture = Omit<CapturedBudget, 'budgetId'>;

/** A scenario measures ONE budget. It returns samples, or an empty set plus a reason. */
interface Scenario {
	readonly budgetId: string;
	readonly run: (ctx: ScenarioContext) => Promise<Capture>;
}

interface ScenarioContext {
	readonly browser: Browser;
	readonly options: Options;
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
		// One discarded warm-up: the FIRST navigation of a session pays the dev server's on-demand
		// transform of every route chunk, which is a property of Vite, not of the app's startup path.
		// Every recorded sample is a real cold browser context against an already-warm server.
		for (let i = -1; i < 3; i += 1) {
			const { page, close } = await newPage(browser, options.port, 'desktop');
			try {
				await gotoRoute(page, '/');
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
			} finally {
				await close();
			}
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
		const { page, close } = await newPage(browser, options.port, 'desktop');
		try {
			await gotoRoute(page, '/');
			const seeded = await seedNotes(page, options.notes);
			const samples: number[] = [];
			for (let i = 0; i < 3; i += 1) {
				await page.reload({ waitUntil: 'domcontentloaded' });
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
				scenario: 'Reload a seeded vault → runtime hydrated + Command Center heading rendered.',
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
		const { page, close } = await newPage(browser, options.port, 'desktop');
		try {
			await gotoRoute(page, '/');
			const seeded = await seedNotes(page, options.notes);
			const samples: number[] = [];
			for (let i = 0; i < 5; i += 1) {
				await page.reload({ waitUntil: 'domcontentloaded' });
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
				scenario: 'Reload → hydrate storage and replay the durable op log to a loaded runtime.',
				fixture: `${ops} queued operations (${seeded} seeded notes) (budget dataset: 1,000 queued operations)`,
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
		// As in app-startup, the first navigation warms the dev server's module graph and is discarded.
		for (let i = -1; i < 3; i += 1) {
			const { page, close } = await newPage(browser, options.port, 'desktop');
			try {
				await page.goto('/#/board', { waitUntil: 'domcontentloaded' });
				await page.waitForFunction(
					() => {
						const rt = (
							window as unknown as {
								__rt?: {
									loaded?: boolean;
									state: {
										commandCenter: { homeSceneId: string | null };
										scenes: { scenes: Record<string, { widgets: unknown[] }> };
									};
								};
							}
						).__rt;
						if (!rt?.loaded) return false;
						const id = rt.state.commandCenter.homeSceneId;
						if (!id) return false;
						if ((rt.state.scenes.scenes[id]?.widgets.length ?? 0) === 0) return false;
						// The painted widgets, not just the state: the board's own rendered children, which
						// `SceneBoardCanvas` tags `data-testid="widget-<id>"`.
						const board = document.querySelector('[data-testid="scene-board-bounded"]');
						return !!board && board.querySelectorAll('[data-testid^="widget-"]').length > 0;
					},
					undefined,
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
			} finally {
				await close();
			}
		}
		return {
			samples,
			scenario: 'Cold context → /board → home scene widgets painted on the bounded GM Screen.',
			fixture: `Demo-seeded home scene, ${widgetCount} painted widgets (budget dataset: 50 widgets / 10 active bindings)`,
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
const widgetUpdate: Scenario = {
	budgetId: 'widget-update',
	run: async ({ browser, options }) => {
		const { page, close } = await newPage(browser, options.port, 'desktop');
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
			const samples = await page.evaluate<number[], number>(async (runs) => {
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
				for (let i = 0; i < runs; i += 1) {
					const y = 40 + (i % 8) * 30;
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
			}, 25);
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
		const { page, close } = await newPage(browser, options.port, 'desktop');
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

/** Fill the graph search box and time until the result list settles on the new query. */
const search: Scenario = {
	budgetId: 'search',
	run: async ({ browser, options }) => {
		const { page, close } = await newPage(browser, options.port, 'desktop');
		try {
			await gotoRoute(page, '/graph');
			const seeded = await seedNotes(page, options.notes);
			await page.reload({ waitUntil: 'domcontentloaded' });
			await waitReady(page);
			const box = page.getByRole('textbox', { name: 'Search the graph' });
			await box.waitFor({ state: 'visible', timeout: READY_TIMEOUT });
			const samples: number[] = [];
			for (let i = 0; i < 20; i += 1) {
				const query = `Perf note ${i}`;
				await box.fill('');
				await page.evaluate<void>(() => {
					performance.mark('rc-perf:search:start');
				});
				await box.fill(query);
				const started = Date.now();
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
				await page.evaluate<void>(() => {
					performance.mark('rc-perf:search:results');
					performance.measure('rc-perf:search', 'rc-perf:search:start', 'rc-perf:search:results');
				});
				samples.push(round(Date.now() - started));
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
		const { page, close } = await newPage(browser, options.port, 'desktop');
		try {
			await gotoRoute(page, '/graph');
			const seeded = await seedNotes(page, options.notes);
			await page.reload({ waitUntil: 'domcontentloaded' });
			await waitReady(page);
			const actor = await actorId(page);
			const samples = await page.evaluate<number[], { actor: string; runs: number }>(
				async ({ actor: a, runs }) => {
					const rt = (
						window as unknown as {
							__rt: { dispatch: (c: unknown) => Promise<{ status: string }> };
						}
					).__rt;
					const out: number[] = [];
					for (let i = 0; i < runs; i += 1) {
						const title = `Perf indexed note ${i}`;
						const started = performance.now();
						performance.mark('rc-perf:graph-indexing:start');
						const res = await rt.dispatch({
							type: 'content.create-item',
							actorId: a,
							payload: {
								kind: 'note',
								title,
								body: `Linked to [[Perf note 1]] and [[Perf note 2]].`,
								visibility: 'player-visible',
							},
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
				{ actor, runs: 5 },
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
			const { page, close } = await newPage(browser, options.port, profile);
			try {
				await gotoRoute(page, '/atlas');
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
						samples: [],
						scenario: 'Pan and zoom the full-screen map editor while sampling animation frames.',
						fixture: '4 layers / 100 POIs',
						profile,
						unavailableReason: `map.create was ${created.status}${created.rejection?.message ? `: ${created.rejection.message}` : ''}; no map to pan.`,
					};
				}
				const layerIds = await page.evaluate<string[], string>(
					(id) =>
						Object.values(
							(
								window as unknown as {
									__rt: {
										state: {
											maps: {
												maps: Record<
													string,
													{ id: string; layers: Record<string, { id: string }> }
												>;
											};
										};
									};
								}
							).__rt.state.maps.maps[id]?.layers ?? {},
						).map((layer) => layer.id),
					mapId,
				);
				if (layerIds.length === 0) {
					return {
						samples: [],
						scenario: 'Pan and zoom the full-screen map editor while sampling animation frames.',
						fixture: '4 layers / 100 POIs',
						profile,
						unavailableReason: 'the created map exposed no layers to place POIs on.',
					};
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

				// Open the map in the full-screen editor — the only surface where the canvas is pannable.
				await page.reload({ waitUntil: 'domcontentloaded' });
				await waitReady(page);
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
						fixture: `4 layers / ${poiCount} POIs`,
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
					fixture: `4 layers / ${poiCount} POIs`,
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
	run: async () => {
		const started = Date.now();
		const result = spawnSync('pnpm', ['test:smoke'], {
			cwd: REPO_ROOT,
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

const SCENARIOS: readonly Scenario[] = [
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
		runnerLabel: process.env.RUNNER_NAME ?? process.env.PERF_RUNNER_LABEL ?? 'local',
	};
}

async function main(): Promise<void> {
	const options = parseOptions(process.argv.slice(2));
	const selected = SCENARIOS.filter(
		(scenario) =>
			(options.only === null || options.only.has(scenario.budgetId)) &&
			!options.skip.has(scenario.budgetId),
	);
	if (selected.length === 0) throw new Error('no scenarios selected; check --only / --skip');

	const needsBrowser = selected.some((scenario) => scenario.budgetId !== 'smoke-ci');
	const server = needsBrowser
		? await ensureDevServer(options.port)
		: { stop: () => {}, reused: true };
	if (needsBrowser) {
		console.log(
			server.reused
				? `· reusing the dev server already on :${options.port}`
				: `· started a dev server on :${options.port}`,
		);
	}

	let browser: Browser | null = null;
	const captured: CapturedBudget[] = [];
	try {
		if (needsBrowser) {
			const chromium = await loadChromium();
			browser = await chromium.launch({ headless: !options.headed });
		}
		for (const scenario of selected) {
			const label = scenario.budgetId;
			process.stdout.write(`· ${label} … `);
			const started = Date.now();
			try {
				const capture = await scenario.run({ browser: browser as Browser, options });
				captured.push({ budgetId: label, ...capture });
				console.log(
					capture.samples.length === 0
						? `no samples (${capture.unavailableReason ?? 'scenario recorded nothing'})`
						: `${capture.samples.length} samples in ${Math.round((Date.now() - started) / 1000)}s`,
				);
			} catch (error) {
				// A scenario that throws records ZERO samples and the reason. It must never be omitted:
				// a missing budget would silently shrink the report, while an empty one grades `unknown`.
				const reason = error instanceof Error ? error.message : String(error);
				captured.push({
					budgetId: label,
					samples: [],
					scenario: 'Scenario failed before it could record a sample.',
					fixture: 'n/a',
					profile: 'node',
					unavailableReason: reason,
				});
				console.log(`FAILED (${reason.split('\n')[0]})`);
			}
		}
	} finally {
		await browser?.close();
		server.stop();
	}

	const run: PerfRunFile = {
		schemaVersion: 1,
		capturedAt: new Date().toISOString(),
		host: hostDescription(),
		budgets: captured,
	};
	mkdirSync(dirname(options.out), { recursive: true });
	writeFileSync(options.out, `${JSON.stringify(run, null, '\t')}\n`, 'utf8');
	console.log(`\nWrote ${options.out} (${captured.length} budgets).`);
	const empty = captured.filter((entry) => entry.samples.length === 0);
	if (empty.length > 0) {
		console.log(
			`${empty.length} budget(s) recorded no samples: ${empty.map((entry) => entry.budgetId).join(', ')}`,
		);
	}
}

main().catch((error: unknown) => {
	console.error(error);
	process.exitCode = 1;
});
