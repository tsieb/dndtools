import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { preferPhoneCanvas } from './_helpers';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

// The automated accessibility release gate for the React GM app (ported from the archived Svelte
// gate). Runs axe-core against every primary durable workspace on BOTH the desktop-chromium and
// mobile-chromium profiles. Each test writes an isolated, worker-scoped artifact so parallel
// workers never race on a shared file, and asserts inline that no critical/serious violation
// escapes the approved known-violation register. The merged gate + remediation-date expiry
// enforcement lives in `scripts/a11y-axe-report.ts`, which consumes these artifacts.

const HERE = dirname(fileURLToPath(import.meta.url));
const ARTIFACT_DIR = join(HERE, '..', '..', 'test-results', 'a11y');
const REGISTER_PATH = join(HERE, '..', 'a11y', 'known-violations.json');

// axe tag set including the WCAG 2.2 AA rules.
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const BLOCKING_IMPACTS = new Set(['critical', 'serious']);

// Primary durable workspaces that currently render in the React app.
const ROUTES: ReadonlyArray<{ path: string; slug: string }> = [
	{ path: '/', slug: 'command-center' },
	{ path: '/board', slug: 'board' },
	{ path: '/scenes', slug: 'scenes' },
	{ path: '/atlas', slug: 'atlas' },
	{ path: '/characters', slug: 'characters' },
	{ path: '/knowledge', slug: 'knowledge' },
	{ path: '/campaign', slug: 'campaign' },
	{ path: '/session', slug: 'session' },
	{ path: '/graph', slug: 'graph' },
	{ path: '/audio', slug: 'audio' },
	{ path: '/extensions', slug: 'extensions' },
	{ path: '/community', slug: 'community' },
	{ path: '/upgrade', slug: 'upgrade' },
	{ path: '/player', slug: 'player' },
	{ path: '/settings', slug: 'settings' },
];

interface ViolationNode {
	id: string;
	impact: string | null;
	route: string;
	project: string;
	selector: string;
	help: string;
	helpUrl: string;
}

interface KnownEntry {
	id: string;
	route: string;
	impact?: string;
	targetResolutionDate: string;
}

function loadRegister(): KnownEntry[] {
	if (!existsSync(REGISTER_PATH)) return [];
	const parsed = JSON.parse(readFileSync(REGISTER_PATH, 'utf8')) as { violations?: KnownEntry[] };
	return parsed.violations ?? [];
}

function isApproved(node: ViolationNode, register: KnownEntry[], now: number): boolean {
	return register.some((entry) => {
		if (entry.id !== node.id) return false;
		if (entry.route !== '*' && entry.route !== node.route) return false;
		if (entry.impact && entry.impact !== node.impact) return false;
		const due = Date.parse(`${entry.targetResolutionDate}T23:59:59.999Z`);
		return !Number.isNaN(due) && due >= now;
	});
}

async function openRoute(page: Page, path: string) {
	// Bypass the first-run onboarding overlay (it covers the surfaces being scanned).
	await page.addInitScript(() => {
		try {
			window.localStorage.setItem('dndtools:react:onboarded', 'gate');
		} catch {
			/* best-effort */
		}
	});
	// HashRouter route + wait for the DEV runtime seam and the shell landmark.
	await page.goto(`/#${path}`, { waitUntil: 'domcontentloaded' });
	await page.waitForFunction(() => !!window.__rt && window.__rt.loaded === true, null, {
		timeout: 20_000,
	});
	await page.locator('#main-content').waitFor({ state: 'attached', timeout: 20_000 });
	// The per-route <h1> is always in the DOM but hidden in the compact/mobile layout.
	await page.locator('h1').first().waitFor({ state: 'attached', timeout: 20_000 });
	// Let the lazy route chunk settle before the scan.
	await page.waitForTimeout(400);
}

/** Run the same release gate against an interactive state, not only a route shell. */
async function assertAxeState(page: Page, testInfo: TestInfo, route: string, slug: string) {
	const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
	const project = testInfo.project.name;
	const nodes: ViolationNode[] = [];
	for (const violation of results.violations) {
		for (const node of violation.nodes) {
			nodes.push({
				id: violation.id,
				impact: violation.impact ?? null,
				route,
				project,
				selector: Array.isArray(node.target) ? node.target.join(' ') : String(node.target),
				help: violation.help,
				helpUrl: violation.helpUrl,
			});
		}
	}
	mkdirSync(ARTIFACT_DIR, { recursive: true });
	writeFileSync(
		join(ARTIFACT_DIR, `axe-${project}-${slug}-w${testInfo.workerIndex}.json`),
		`${JSON.stringify({ project, route, workerIndex: testInfo.workerIndex, violations: nodes }, null, 2)}\n`,
		'utf8',
	);
	const register = loadRegister();
	const blocking = nodes.filter(
		(node) => BLOCKING_IMPACTS.has(node.impact ?? '') && !isApproved(node, register, Date.now()),
	);
	expect(
		blocking,
		`Unapproved critical/serious axe violations on ${route} (${project}):\n` +
			blocking.map((b) => `  - [${b.impact}] ${b.id} — ${b.selector} (${b.helpUrl})`).join('\n'),
	).toEqual([]);
}

for (const route of ROUTES) {
	test(`a11y axe gate: ${route.path}`, async ({ page }, testInfo) => {
		await openRoute(page, route.path);

		const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
		const project = testInfo.project.name;

		const nodes: ViolationNode[] = [];
		for (const violation of results.violations) {
			for (const node of violation.nodes) {
				nodes.push({
					id: violation.id,
					impact: violation.impact ?? null,
					route: route.path,
					project,
					selector: Array.isArray(node.target) ? node.target.join(' ') : String(node.target),
					help: violation.help,
					helpUrl: violation.helpUrl,
				});
			}
		}

		// Isolated, worker-scoped artifact — the merge step (a11y-axe-report.ts) de-duplicates.
		mkdirSync(ARTIFACT_DIR, { recursive: true });
		writeFileSync(
			join(ARTIFACT_DIR, `axe-${project}-${route.slug}-w${testInfo.workerIndex}.json`),
			`${JSON.stringify({ project, route: route.path, workerIndex: testInfo.workerIndex, violations: nodes }, null, 2)}\n`,
			'utf8',
		);

		const register = loadRegister();
		const now = Date.now();
		const blocking = nodes.filter(
			(node) => BLOCKING_IMPACTS.has(node.impact ?? '') && !isApproved(node, register, now),
		);
		expect(
			blocking,
			`Unapproved critical/serious axe violations on ${route.path} (${project}):\n` +
				blocking.map((b) => `  - [${b.impact}] ${b.id} — ${b.selector} (${b.helpUrl})`).join('\n'),
		).toEqual([]);
	});
}

// `/play` and `/join` render OUTSIDE AppShell (they bring their own chrome), so `openRoute`'s wait
// on `#main-content` — the shell's landmark — can never resolve there. That is exactly why the two
// routes a real PLAYER actually lands on were the only durable surfaces missing from this gate.
const STANDALONE_ROUTES: ReadonlyArray<{ path: string; slug: string }> = [
	{ path: '/play', slug: 'play' },
	{ path: '/join', slug: 'join' },
	{ path: '/join?token=axe-invalid', slug: 'join-unavailable' },
];

async function openStandaloneRoute(page: Page, path: string) {
	await page.addInitScript(() => {
		try {
			window.localStorage.setItem('dndtools:react:onboarded', 'gate');
		} catch {
			/* best-effort */
		}
	});
	await page.goto(`/#${path}`, { waitUntil: 'domcontentloaded' });
	await page.waitForFunction(() => !!window.__rt && window.__rt.loaded === true, null, {
		timeout: 20_000,
	});
	// These routes own their own `<main>`; wait on the landmark role rather than the shell's id.
	await page.getByRole('main').first().waitFor({ state: 'visible', timeout: 20_000 });
	await page.waitForTimeout(400);
}

for (const route of STANDALONE_ROUTES) {
	test(`a11y axe gate: ${route.path}`, async ({ page }, testInfo) => {
		await openStandaloneRoute(page, route.path);
		await assertAxeState(page, testInfo, route.path, route.slug);
	});
}

// The public wiki reader (`#/wiki?id=…`) is chrome-less AND vault-less: unlike /play and /join it has
// no `__rt` seam at all, so it needs its own opener. It was in NEITHER this gate nor
// responsive.spec.ts — the one shipped route with no automated a11y guard whatsoever. Offline the
// only reachable phase is the honest "Wiki unavailable" notice (`getPublicWiki` has no API URL), and
// scanning that still guards the notice card's landmark, name and contrast contract.
test('a11y axe gate: /wiki (public reader)', async ({ page }, testInfo) => {
	await page.goto('/#/wiki?id=axe-gate-not-a-real-wiki', { waitUntil: 'domcontentloaded' });
	await page.getByRole('main').first().waitFor({ state: 'visible', timeout: 20_000 });
	await expect(page.getByText('Wiki unavailable')).not.toHaveCount(0);
	await assertAxeState(page, testInfo, '/wiki', 'wiki');
});

// ⚠️ Every scan above runs against a FRESH vault, i.e. the EMPTY state of each surface. A fresh
// vault has no running combat, so `/session`'s initiative tracker — the densest interactive surface
// in the app, and the one a DM stares at all evening — was never actually reached by this gate.
// Seeding the state the DM works in is the point: an empty table cannot violate anything.
test('a11y axe gate: /session with a running initiative tracker', async ({ page }, testInfo) => {
	await openRoute(page, '/session');
	const result = await page.evaluate(async () => {
		const rt = window.__rt!;
		const state = rt.state as unknown as {
			session: { activeSceneId: string | null };
			commandCenter: { homeSceneId: string | null };
			scenes: { scenes: Record<string, { id: string; isTemplate?: boolean }> };
		};
		const sceneId =
			state.session.activeSceneId ??
			state.commandCenter.homeSceneId ??
			Object.values(state.scenes.scenes).find((s) => !s.isTemplate)?.id;
		const live = await rt.dispatch({
			type: 'session.set-workflow',
			actorId: rt.defaultActorId,
			payload: { workflow: 'active', activeSceneId: sceneId },
		});
		if (live.status !== 'accepted') return { step: 'go live', ...live };
		return {
			step: 'start combat',
			...(await rt.dispatch({
				type: 'combat.start',
				actorId: rt.defaultActorId,
				payload: {
					combatants: [
						{ kind: 'monster', name: 'Bog Lurker', ac: 13, initiative: 18, maxHp: 22 },
						{ kind: 'monster', name: 'Reed Stalker', ac: 12, initiative: 9, maxHp: 14 },
					],
				},
			})),
		};
	});
	expect(result.status, `${result.step}: ${JSON.stringify(result.rejection ?? {})}`).toBe(
		'accepted',
	);
	await expect(page.getByRole('button', { name: 'End combat' })).toBeVisible();
	await page.waitForTimeout(250);

	await assertAxeState(page, testInfo, '/session#combat', 'session-combat');
});

// RC-UX-2.1 — the scene canvas editor (`/scene/:id`) is a durable workspace but, unlike the other
// routes above, it needs a REAL scene id: an empty vault's default scene is enough, so resolve the
// one the demo seed already carries (Command Center's home Scene, or the first non-template Scene)
// rather than inventing an id that would only ever render the route's "not found" state.
test('a11y axe gate: /scene/:id', async ({ page }, testInfo) => {
	await openRoute(page, '/');
	const sceneId = await page.evaluate(() => {
		const rt = window.__rt!;
		const state = rt.state as unknown as {
			commandCenter: { homeSceneId: string | null };
			scenes: { scenes: Record<string, { id: string; isTemplate?: boolean }> };
		};
		return (
			state.commandCenter.homeSceneId ??
			Object.values(state.scenes.scenes).find((s) => !s.isTemplate)?.id ??
			null
		);
	});
	expect(sceneId, 'the default vault has no Scene to open the editor on').not.toBeNull();
	await openRoute(page, `/scene/${sceneId}`);
	await assertAxeState(page, testInfo, '/scene/:id', 'scene-editor');
});

// RC-CAN-5.4 — a phone reads `/board` as a panel list (scanned by the route loop above) and offers a
// Layout view: the canvas at a legible step, a titles-only overview at Fit, the "Jump to tile" sheet
// and a full-screen tile. Each of those is its own interactive state, so each is scanned.
test('a11y axe gate: /board phone Layout, overview, jump sheet and full-screen tile', async ({
	page,
}, testInfo) => {
	test.skip(testInfo.project.name !== 'mobile-chromium', 'the Layout view is the phone tier');
	await openRoute(page, '/board');
	await page
		.getByRole('group', { name: 'Board view' })
		.getByRole('button', { name: 'Layout' })
		.click();
	await expect(page.getByTestId('scene-board-bounded')).toBeVisible();
	await assertAxeState(page, testInfo, '/board (phone layout)', 'board-phone-layout');
	const zoom = page.getByTestId('board-zoom-presets');
	await zoom.getByRole('button', { name: 'Fit', exact: true }).click();
	await expect(page.getByTestId('phone-layout-overview')).toBeVisible();
	await assertAxeState(page, testInfo, '/board (phone overview)', 'board-phone-overview');
	await page.getByTestId('phone-jump-open').click();
	const sheet = page.getByRole('dialog', { name: 'Jump to tile' });
	await expect(sheet).toBeVisible();
	await assertAxeState(page, testInfo, '/board (phone jump sheet)', 'board-phone-jump');
	await sheet
		.getByRole('button', { name: /^Expand / })
		.first()
		.click();
	await expect(page.getByTestId('phone-fullscreen')).toBeVisible();
	await assertAxeState(page, testInfo, '/board (phone full-screen tile)', 'board-phone-fullscreen');
});

// RC-UX-2.1 — `/display` (I11 S11.2.2's second-screen projector) is chrome-less like `/play` and
// `/join`, but unlike them it carries no shell OR `role="main"` landmark at all: it is a single fixed
// full-bleed surface (`SceneDisplay.tsx`), so `openStandaloneRoute`'s landmark wait can never resolve
// there. Wait on that surface's own wrapper instead.
test('a11y axe gate: /display', async ({ page }, testInfo) => {
	await page.addInitScript(() => {
		try {
			window.localStorage.setItem('dndtools:react:onboarded', 'gate');
		} catch {
			/* best-effort */
		}
	});
	await page.goto('/#/display', { waitUntil: 'domcontentloaded' });
	await page.locator('.app-fixed-viewport').waitFor({ state: 'attached', timeout: 20_000 });
	await page.waitForTimeout(400);
	await assertAxeState(page, testInfo, '/display', 'display');
});

// RC-UX-2.1 — the full-screen creative-app overlays (map editor, widget builder, system builder,
// character builder) are durable workspaces in their own right but only exist in an OPEN state, so
// each gets its own scan of that state rather than a ROUTES entry.

/**
 * Create a map (one `Base` layer, plus a DM-only POI per label) and open it in the full-screen
 * editor from `/atlas`. Shared by the axe scan below and the RC-UX-2.2 accessibility-tree contract.
 */
async function openMapEditor(page: Page, name: string, poiLabels: readonly string[] = []) {
	await openRoute(page, '/atlas');
	const mapId = await page.evaluate(
		async ({ mapName, labels }) => {
			const rt = window.__rt!;
			const res = await rt.dispatch({
				type: 'map.create',
				actorId: rt.defaultActorId,
				payload: {
					name: mapName,
					visibility: 'dm-only',
					projection: { kind: 'flat', rotationDegrees: 0 },
					initialLayers: [{ name: 'Base', category: 'base', visibility: 'dm-only' }],
				},
			});
			if (res.status !== 'accepted') return null;
			const created = (res.events ?? []).find(
				(e) => (e as { kind?: string }).kind === 'map.created',
			) as { mapId?: string } | undefined;
			const id = created?.mapId;
			if (!id) return null;
			const maps = rt.state.maps as unknown as {
				maps: Record<string, { layers: Array<{ id: string }> }>;
			};
			const layerId = maps.maps[id]?.layers[0]?.id;
			for (const [i, label] of labels.entries()) {
				const poi = await rt.dispatch({
					type: 'map.create-poi',
					actorId: rt.defaultActorId,
					payload: {
						mapId: id,
						id: `a11y-poi-${i}-${Date.now()}`,
						layerId,
						label,
						category: 'other',
						position: { x: 0.3 + i * 0.2, y: 0.4 },
						visibility: 'dm-only',
					},
				});
				if (poi.status !== 'accepted') return null;
			}
			return id;
		},
		{ mapName: name, labels: [...poiLabels] },
	);
	expect(mapId, 'map.create (and every map.create-poi) must be accepted').not.toBeNull();
	await page.getByRole('button', { name, exact: true }).click();
	const openBtn = page.getByRole('button', { name: 'Open in map editor' });
	await expect(openBtn).toBeEnabled();
	await openBtn.click();
	const editor = page.getByRole('dialog', { name: `Map editor — ${name}` });
	await expect(editor).toBeVisible();
	return editor;
}

test('a11y axe gate: map editor (open state)', async ({ page }, testInfo) => {
	await openMapEditor(page, 'Axe Gate Map');
	await page.waitForTimeout(250);
	await assertAxeState(page, testInfo, '/atlas#map-editor', 'map-editor');
});

test('a11y axe gate: widget builder (open state)', async ({ page }, testInfo) => {
	await openRoute(page, '/extensions');
	await page.getByRole('button', { name: 'Build a widget' }).click();
	const dialog = page.getByRole('dialog', { name: /Widget builder/ });
	await expect(dialog).toBeVisible();
	await page.waitForTimeout(250);
	await assertAxeState(page, testInfo, '/extensions#widget-builder', 'widget-builder');
});

test('a11y axe gate: system builder (open state)', async ({ page }, testInfo) => {
	await openRoute(page, '/extensions');
	await page.getByRole('tab', { name: 'System' }).click();
	await expect(page.getByText('Choose a system')).not.toHaveCount(0);
	await page.getByRole('button', { name: /Build your own/ }).click();
	const forkDialog = page.getByRole('dialog');
	await expect(forkDialog.getByText('Copy a system')).toBeVisible();
	await forkDialog.getByRole('button', { name: 'Create copy' }).click();
	const builder = page.getByRole('dialog', { name: /^System builder/ });
	await expect(builder).toBeVisible();
	await page.waitForTimeout(250);
	await assertAxeState(page, testInfo, '/extensions#system-builder', 'system-builder');
});

test('a11y axe gate: character builder (open state)', async ({ page }, testInfo) => {
	await openRoute(page, '/characters');
	await page.getByRole('button', { name: 'New character', exact: true }).first().click();
	await page.getByRole('button', { name: /Build from scratch/ }).click();
	const wizard = page.getByRole('dialog', { name: 'New character wizard' });
	await expect(wizard).toBeVisible();
	await page.waitForTimeout(250);
	await assertAxeState(page, testInfo, '/characters#new-character-wizard', 'char-builder');
});

test('a11y axe gate: opened command palette and compact table controls', async ({
	page,
}, testInfo) => {
	await openRoute(page, '/');
	await page
		.getByRole('button', { name: /Search/ })
		.first()
		.click();
	await page.getByRole('dialog', { name: 'Command palette' }).waitFor({ state: 'visible' });
	await page.waitForTimeout(250);
	await assertAxeState(page, testInfo, '/#command-palette', 'command-palette');

	await page.keyboard.press('Escape');
	await page.setViewportSize({ width: 375, height: 520 });
	await page.getByRole('button', { name: 'Table controls' }).click();
	await page.getByRole('dialog', { name: 'Table controls' }).waitFor({ state: 'visible' });
	// A sheet is visibly mounted while it is still translated below the viewport. Wait for its
	// entrance transform before asking axe to calculate foreground/background contrast.
	await page.waitForTimeout(250);
	await assertAxeState(page, testInfo, '/#table-controls', 'table-controls');
});

// ── RC-UX-2.2 — screen-reader contracts for the canvas surfaces ──────────────────────────────────
//
// axe proves the tree is VALID; it cannot prove it says the right thing. These assert what a screen
// reader is actually handed on the three spatial surfaces — role, accessible name, and the counts in
// that name — on both profiles, against the accessibility tree Playwright snapshots (the same tree
// Chromium exposes to NVDA/TalkBack). The contract itself is documented in ACCESSIBILITY.md §3.

const widgetsWord = (n: number) => `${n} ${n === 1 ? 'widget' : 'widgets'}`;

/** The home Scene's id and widget count, once `command-center.ensure-home` has seeded it. */
async function homeScene(page: Page) {
	await page.waitForFunction(
		() => {
			const rt = window.__rt!;
			const state = rt.state as unknown as {
				commandCenter: { homeSceneId: string | null };
				scenes: { scenes: Record<string, { widgets: unknown[] }> };
			};
			const id = state.commandCenter.homeSceneId;
			return !!id && (state.scenes.scenes[id]?.widgets.length ?? 0) > 0;
		},
		null,
		{ timeout: 20_000 },
	);
	return page.evaluate(() => {
		const state = window.__rt!.state as unknown as {
			commandCenter: { homeSceneId: string };
			scenes: { scenes: Record<string, { widgets: unknown[] }> };
		};
		const id = state.commandCenter.homeSceneId;
		return { id, count: state.scenes.scenes[id]!.widgets.length };
	});
}

test('a11y tree: /board names its surface, counts its widgets, and voices keyboard moves', async ({
	page,
}) => {
	await preferPhoneCanvas(page);
	await openRoute(page, '/board');
	const { count } = await homeScene(page);
	const board = page.getByTestId('scene-board-bounded');
	// Every widget frame is a named group, in reading order — the non-visual list of the board.
	const frames = board.locator('[role="group"][data-testid^="widget-"]');
	await expect(frames).toHaveCount(count);

	// VIEW: a labelled region, so browse mode still reads widget content.
	await expect(board).toHaveAttribute('role', 'region');
	await expect(board).toHaveAccessibleName(`GM Screen, ${widgetsWord(count)}`);
	await expect(board).toMatchAriaSnapshot(`
		- region "GM Screen, ${widgetsWord(count)}":
		  - group /^.+, .+ widget$/
	`);

	// EDIT: the canvas owns the arrow keys, so it becomes an application — same count.
	await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
	await expect(board).toHaveAttribute('role', 'application');
	await expect(board).toHaveAccessibleName(`GM Screen layout editor, ${widgetsWord(count)}`);
	await expect(board).toMatchAriaSnapshot(`
		- application "GM Screen layout editor, ${widgetsWord(count)}":
		  - group /^.+, .+ widget, position \\d+, \\d+, size \\d+ by \\d+$/
	`);
	await expect(frames).toHaveCount(count);

	// Every keyboard operation speaks through the one operation live region.
	const live = page.getByTestId('canvas-resize-announcement');
	await expect(live).toHaveAttribute('aria-live', 'polite');
	const first = frames.first();
	const title = (await first.getAttribute('aria-label'))!.split(',')[0]!;
	await first.focus();
	await first.press('Space');
	await expect(live).toHaveText(new RegExp(`^${title} selected\\. Arrows move it`));
	await first.press('ArrowDown');
	await expect(live).toHaveText(new RegExp(`^${title}, moved to \\d+, \\d+$`));
	await first.press('Escape');
	await expect(live).toHaveText(`${title} put down.`);
});

test('a11y tree: scene editor names its surface and counts its widgets', async ({ page }) => {
	await preferPhoneCanvas(page);
	// `/board` is what seeds the home Scene (`command-center.ensure-home`); then open it as a Scene.
	await openRoute(page, '/board');
	const { id, count } = await homeScene(page);
	await openRoute(page, `/scene/${id}`);
	// The home Scene may render under either layout policy; the contract is the same for both.
	const surface = page.locator(
		'[data-testid="scene-board-canvas"], [data-testid="scene-board-flow"]',
	);
	await expect(surface).toHaveCount(1);
	await expect(surface).toHaveAttribute('role', 'region');
	await expect(surface).toHaveAccessibleName(
		new RegExp(`^Scene (canvas|layout), ${widgetsWord(count)}$`),
	);
	await expect(surface).toMatchAriaSnapshot(`
		- region /^Scene (canvas|layout), ${widgetsWord(count)}$/:
		  - group /^.+, .+ widget$/
	`);
	await expect(surface.locator('[role="group"][data-testid^="widget-"]')).toHaveCount(count);

	await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
	await expect(surface).toHaveAttribute('role', 'application');
	await expect(surface).toHaveAccessibleName(`Scene layout editor, ${widgetsWord(count)}`);
	await expect(surface).toMatchAriaSnapshot(`
		- application "Scene layout editor, ${widgetsWord(count)}":
		  - group /^.+, .+ widget, position .+$/
	`);
});

test('a11y tree: map editor canvas carries counts; the List view is the full non-visual path', async ({
	page,
}) => {
	const editor = await openMapEditor(page, 'Contract Map', ['Old Mill', 'Watchtower']);
	const canvas = editor.getByRole('application');
	await expect(canvas).toHaveCount(1);
	await expect(canvas).toHaveAccessibleName(
		/^Map canvas — Contract Map\. 2 points of interest, 0 tokens, 0 routes, 1 layer\. Drawing tool: .+\.$/,
	);

	await editor.getByRole('button', { name: 'Show list', exact: true }).click();
	// The swap is voiced, and the drawing surface leaves the tree rather than sitting behind the list.
	await expect(editor.getByText('List view shown.')).toBeAttached();
	await expect(editor.getByRole('application')).toHaveCount(0);
	// The same map as tables: counts in the region's and each table's name, one row per object, and
	// every row's label editable and its "Navigate to" reachable without pointing.
	await expect(editor).toMatchAriaSnapshot(`
		- region "Map inventory — Contract Map. 2 points of interest, 0 tokens, 0 routes, 1 layer.":
		  - paragraph: 2 points of interest, 0 tokens, 0 routes, 1 layer.
		  - group "Points of interest, 2 rows":
		    - table:
		      - rowgroup:
		        - row /^Label Category Visibility/
		      - rowgroup:
		        - row /^Old Mill /:
		          - cell "Old Mill":
		            - textbox "Label for point of interest Old Mill"
		          - cell "Navigate to Old Mill":
		            - button "Navigate to Old Mill"
		        - row /^Watchtower /
		  - group "Layers, 1 row":
		    - table:
		      - rowgroup:
		        - row /^Name Category/
		      - rowgroup:
		        - row /^Base /
	`);
});
