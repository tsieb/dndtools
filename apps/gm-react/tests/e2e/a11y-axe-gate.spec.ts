import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
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
