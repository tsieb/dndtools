import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
	armFrictionSeed,
	countActions,
	expectOneExtraStep,
	FRICTION_BUDGETS,
	type FrictionSeed,
	gotoRoute,
	markOnboarded,
	preferPhoneCanvas,
	seedDialog,
	waitReady,
} from './_helpers';

// Touch is enabled at both viewport sizes so the counter's tap branch is tested in each project.
test.use({ hasTouch: true });

async function drag(page: Page, target: Locator, dx: number, dy: number) {
	// Hover performs Playwright's visibility, stability and hit-target checks before mouse.down.
	// A bounding box alone can point through an inspector or another overlay.
	await target.hover();
	const box = (await target.boundingBox())!;
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 8 });
	await page.mouse.up();
}

test('action counter unit: scripted clicks, tap, chord, typing, pointer/native drags and excluded scroll', async ({
	page,
}) => {
	await page.setContent(
		'<button>Action</button><input aria-label="Text"><div aria-label="Drag" style="width:100px;height:100px;touch-action:none"></div><div draggable="true" aria-label="Native drag" style="width:100px;height:50px">Native drag</div><div aria-label="Drop target" style="width:100px;height:50px">Drop here</div><div style="height:2000px"></div>',
	);
	await page.getByLabel('Drop target').evaluate((target) => {
		target.addEventListener('dragover', (event) => event.preventDefault());
		target.addEventListener('drop', (event) => {
			event.preventDefault();
			target.textContent = 'Dropped';
		});
	});
	const actions = await countActions(page);
	const button = page.getByRole('button');
	await button.click();
	await button.tap();
	await button.press('Enter'); // The resulting synthetic click must not count twice.
	await page.keyboard.press('Control+k');
	await page.getByLabel('Text').click();
	await page.keyboard.type('ab');
	await drag(page, page.getByLabel('Drag', { exact: true }), 40, 20);
	await page.getByLabel('Native drag').dragTo(page.getByLabel('Drop target'));
	await expect(page.getByLabel('Drop target')).toHaveText('Dropped');
	await page.mouse.wheel(0, 100);
	expect((await actions.snapshot()).map((action) => action.kind)).toEqual([
		'click',
		'tap',
		'key',
		'key',
		'click',
		'key',
		'key',
		'drag',
		'drag',
	]);
	await actions.stop();
	await button.click();
	expect(await actions.snapshot()).toHaveLength(9);
	const next = await countActions(page);
	await button.click();
	expect(await next.snapshot()).toHaveLength(1);
});

test('action counter excludes native touch scrolling after pointercancel', async ({ page }) => {
	await page.setContent(
		'<meta name="viewport" content="width=device-width, initial-scale=1"><div style="height:3000px">Scroll</div>',
	);
	await page.evaluate(() => {
		window.addEventListener(
			'pointercancel',
			() => {
				document.body.dataset.pointerCancelled = 'true';
			},
			{ once: true },
		);
	});
	const actions = await countActions(page);
	const session = await page.context().newCDPSession(page);
	try {
		await session.send('Input.dispatchTouchEvent', {
			type: 'touchStart',
			touchPoints: [{ x: 200, y: 400 }],
		});
		for (let y = 380; y >= 100; y -= 20) {
			await session.send('Input.dispatchTouchEvent', {
				type: 'touchMove',
				touchPoints: [{ x: 200, y }],
			});
		}
		await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
		await expect(page.locator('body')).toHaveAttribute('data-pointer-cancelled', 'true');
		await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
		expect(await actions.snapshot()).toEqual([]);
	} finally {
		await session.detach();
	}
});

// Boundary fixtures intentionally use the full allowance, not the current journey's spare room.
// One new dialog therefore rejects every ceiling, even when today's journey is below its limit.
for (const budget of Object.keys(FRICTION_BUDGETS) as Array<keyof typeof FRICTION_BUDGETS>) {
	test(`friction ${budget} rejects one added dialog`, async ({ page }) => {
		await page.setContent(
			'<button>Continue journey</button><dialog aria-label="Extra confirmation"><button onclick="this.closest(\'dialog\').close()">Confirm extra step</button></dialog>',
		);
		const actions = await countActions(page);
		for (let i = 0; i < FRICTION_BUDGETS[budget]; i++) {
			if (budget === 'onboarding-keys') await page.keyboard.press('Tab');
			else if (budget === 'player-damage')
				await page.getByRole('button', { name: 'Continue journey' }).tap();
			else await page.getByRole('button', { name: 'Continue journey' }).click();
		}
		await actions.assertWithin(budget);
		await page.evaluate(() => document.querySelector('dialog')!.showModal());
		if (budget === 'onboarding-keys') await page.keyboard.press('Enter');
		else if (budget === 'player-damage')
			await page.getByRole('button', { name: 'Confirm extra step' }).tap();
		else await page.getByRole('button', { name: 'Confirm extra step' }).click();
		await expect(page.getByRole('dialog')).toBeHidden();
		await expect(actions.assertWithin(budget)).rejects.toThrow(
			`Friction ${budget}: ${FRICTION_BUDGETS[budget] + 1}/${FRICTION_BUDGETS[budget]} actions`,
		);
		await expect(actions.assertWithin(budget)).rejects.toThrow('Confirm extra step');
	});
}

/**
 * Every committed version of the table in HEAD's history. A shallow checkout (CI clones depth 1)
 * cannot see it, so the commit graph and trees of HEAD are fetched from origin into a scratch
 * repository without blobs; the few table versions are then read lazily. Unavailable history
 * throws: the tightening-only rule fails closed rather than comparing against nothing.
 */
function recordedTables(root: string, path: string): string[] {
	// CI runs as root in a container over a runner-owned checkout; read it regardless of owner.
	const git = (cwd: string, ...args: string[]) =>
		execFileSync('git', ['-c', 'safe.directory=*', ...args], {
			cwd,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		}).trim();
	let scratch: string | undefined;
	try {
		const head = git(root, 'rev-parse', 'HEAD');
		let repo = root;
		if (git(root, 'rev-parse', '--is-shallow-repository') === 'true') {
			scratch = mkdtempSync(join(tmpdir(), 'friction-history-'));
			git(scratch, 'init', '--quiet', '--bare');
			git(scratch, 'remote', 'add', 'origin', git(root, 'remote', 'get-url', 'origin'));
			git(scratch, 'fetch', '--quiet', '--no-tags', '--filter=blob:none', 'origin', head);
			if (git(scratch, 'rev-parse', '--is-shallow-repository') !== 'false')
				throw new Error('fetched history is still shallow');
			repo = scratch;
		}
		const revisions = git(repo, 'log', '--format=%H', head, '--', path).split('\n').filter(Boolean);
		if (revisions.length === 0) throw new Error(`no commit of ${path} reachable from ${head}`);
		return revisions.map((sha) => git(repo, 'show', `${sha}:${path}`));
	} catch (error) {
		throw new Error(
			`Friction budget history unavailable, so tightening-only cannot be verified: ${(error as Error).message}`,
			{ cause: error },
		);
	} finally {
		if (scratch) rmSync(scratch, { recursive: true, force: true });
	}
}

test('budget table matches executable ceilings and cannot loosen recorded history', () => {
	test.setTimeout(120_000);
	const root = fileURLToPath(new URL('../../../../', import.meta.url));
	const path = 'docs/planning/FRICTION_BUDGETS.md';
	const parse = (text: string) =>
		Object.fromEntries(
			[...text.matchAll(/^\| `([^`]+)`\s*\| (\d+)\s*\|/gm)].map((match) => [
				match[1],
				Number(match[2]),
			]),
		);
	expect(parse(readFileSync(`${root}${path}`, 'utf8'))).toEqual(FRICTION_BUDGETS);
	const original = {
		'onboarding-clicks': 5,
		'onboarding-keys': 12,
		'capture-note': 2,
		'quick-track': 6,
		'tile-layout': 4,
		'player-damage': 2,
		help: 1,
		'table-scene': 1,
	};
	for (const previous of [original, ...recordedTables(root, path).map(parse)]) {
		for (const [id, limit] of Object.entries(previous)) {
			expect(
				FRICTION_BUDGETS[id as keyof typeof FRICTION_BUDGETS],
				`${id} may only tighten`,
			).toBeLessThanOrEqual(limit);
		}
	}
});

// Measured journeys. An optional seed arms one extra dialog on a step just before measurement
// starts; the journey answers it straight after that step. Each journey ends on its own outcome,
// never on "some dialog is open", so an intermediate dialog cannot pass for completion.
async function keyboardOnboarding(page: Page) {
	await page.goto('/#/');
	await waitReady(page);
	const overlay = page.locator('[data-fullscreen-overlay="onboarding"]');
	await expect(overlay.locator('[data-onboarding-content]')).toBeFocused();
	const actions = await countActions(page);
	await page.keyboard.press('Tab');
	await expect(overlay.getByLabel('Campaign name')).toBeFocused();
	await page.keyboard.insertText('Golden campaign');
	// Step content is focused on entry; backwards reaches the preceding footer's last action.
	for (let step = 0; step < 3; step++) {
		const target = overlay.getByRole('button', {
			name: step === 2 ? 'Open the Command Center' : 'Continue',
			exact: true,
		});
		for (let i = 0; i < 5 && !(await target.evaluate((el) => el === document.activeElement)); i++)
			await page.keyboard.press(step === 0 ? 'Tab' : 'Shift+Tab');
		await expect(target).toBeFocused();
		await page.keyboard.press('Enter');
	}
	await expect(overlay).toBeHidden();
	await expect(page.locator('[data-first-session-guide]')).toBeVisible();
	return actions;
}

test('golden friction: onboarding with keyboard only', async ({ page }) => {
	const actions = await keyboardOnboarding(page);
	await actions.assertWithin('onboarding-keys');
});

async function tileLayout(page: Page, seed?: FrictionSeed) {
	await markOnboarded(page);
	await preferPhoneCanvas(page);
	await gotoRoute(page, '/board');
	await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
	const frames = page
		.getByTestId('scene-board-bounded')
		.locator('[data-testid^="widget-"][role="group"]');
	await expect(frames.first()).toBeVisible();
	const before = new Set(
		await frames.evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')!)),
	);
	const interrupt = await armFrictionSeed(page, seed);
	const actions = await countActions(page);
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await interrupt();
	await page
		.getByTestId('add-widget-gallery')
		.getByRole('button', { name: 'Add Dice', exact: true })
		.click();
	await expect(frames).toHaveCount(before.size + 1);
	const ids = await frames.evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')!));
	const tileId = ids.find((id) => !before.has(id))!;
	const tile = page.getByTestId(tileId);
	const layout = () =>
		page.evaluate((id) => {
			const rt = window.__rt!;
			return rt.state.scenes.scenes[rt.state.commandCenter.homeSceneId!]!.widgets.find(
				(widget) => `widget-${widget.id}` === id,
			)!.layout;
		}, tileId);
	await expect(tile).toBeFocused();
	const initialLayout = await layout();
	const initial = await tile.getAttribute('aria-label');
	await drag(page, tile.getByTestId('tile-drag-surface'), 0, 40);
	await expect(tile).not.toHaveAttribute('aria-label', initial!);
	await expect.poll(async () => (await layout()).y).toBeGreaterThan(initialLayout.y);
	const movedLayout = await layout();
	const moved = await tile.getAttribute('aria-label');
	// Selecting the tile by dragging opens its inspector, which covers the corner handle on
	// phones. The selected tile retains focus and offers Shift+Arrow resize as one action.
	await expect(tile).toBeFocused();
	await page.keyboard.press('Shift+ArrowDown');
	await expect(tile).not.toHaveAttribute('aria-label', moved!);
	await expect.poll(layout).toEqual({ ...movedLayout, h: movedLayout.h + 20 });
	return actions;
}

test('golden friction: add, move and resize a tile in four actions from Edit layout', async ({
	page,
}) => {
	const actions = await tileLayout(page);
	await actions.assertWithin('tile-layout');
	expect((await actions.snapshot()).map((action) => action.kind)).toEqual([
		'click',
		'click',
		'drag',
		'key',
	]);
});

/**
 * Real Help, never just "a dialog": the Help menu (its Guides section) or, on a route with its
 * own guide, that guide's article with the way back to every topic.
 */
const helpShown = (page: Page) =>
	page
		.getByRole('dialog', { name: 'Help', exact: true })
		.filter({ has: page.getByRole('region', { name: 'Guides', exact: true }) })
		.or(
			page
				.getByRole('dialog')
				.filter({ has: page.getByRole('article') })
				.filter({ has: page.getByRole('button', { name: 'All help topics', exact: true }) }),
		);

/** One Help activation, measured until real Help content is showing. */
async function openHelp(page: Page, seed?: FrictionSeed) {
	const interrupt = await armFrictionSeed(page, seed);
	const actions = await countActions(page);
	await page.getByRole('button', { name: 'Help', exact: true }).click();
	await interrupt();
	await expect(helpShown(page)).toBeVisible();
	return actions;
}

// Seeded defects inside the application: the same journeys and completion checks, with one dialog
// added to the real UI. Rows whose journey has spare room (onboarding) cannot fail on one added
// step; the boundary fixtures above cover every ceiling.
for (const route of ['/', '/board']) {
	test(`seeded app defect: a dialog before Help on ${route} fails the Help budget`, async ({
		page,
	}) => {
		await markOnboarded(page);
		await gotoRoute(page, route);
		const actions = await openHelp(
			page,
			seedDialog('Help', () => expect(helpShown(page)).toHaveCount(0), 'click'),
		);
		await expectOneExtraStep(actions, 'help');
	});
}

test('seeded app defect: a dialog before the Add panel fails the tile budget', async ({ page }) => {
	const actions = await tileLayout(
		page,
		seedDialog('Add', () => expect(page.getByTestId('add-widget-gallery')).toHaveCount(0), 'click'),
	);
	await expectOneExtraStep(actions, 'tile-layout');
});

// Every shell route, including entity detail routes and aliases. Standalone join, legal, wiki,
// projection and companion documents do not mount the GM shell or its Help launcher.
const routes = [
	'/',
	'/screens',
	'/scenes',
	'/board',
	'/session',
	'/characters',
	'/atlas',
	'/campaign',
	'/campaign/calendar',
	'/campaign/relationships',
	'/knowledge',
	'/graph',
	'/graph/repair',
	'/audio',
	'/extensions',
	'/community',
	'/upgrade',
	'/player',
	'/settings',
];
for (const route of routes) {
	test(`golden friction: Help from ${route}`, async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, route);
		const actions = await openHelp(page);
		await actions.assertWithin('help');
	});
}

test('golden friction: Help from entity details', async ({ page }) => {
	await markOnboarded(page);
	await gotoRoute(page, '/board');
	await expect(page.locator('[data-widget-region]').first()).toBeVisible();
	const routes = await page.evaluate(() => {
		const rt = window.__rt!;
		return [
			`/screen/${rt.state.commandCenter.homeSceneId}`,
			`/scene/${rt.state.commandCenter.homeSceneId}`,
			`/characters/${Object.keys(rt.state.characters.characters)[0]}`,
			`/knowledge/${Object.keys(rt.state.content.items)[0]}`,
		];
	});
	for (const route of routes) {
		await gotoRoute(page, route);
		const actions = await openHelp(page);
		await actions.assertWithin('help');
		await actions.stop();
		await page.keyboard.press('Escape');
		await expect(page.getByRole('dialog')).toBeHidden();
	}
});

test('Help inventory includes every declared GM shell route', () => {
	const app = readFileSync(fileURLToPath(new URL('../../src/App.tsx', import.meta.url)), 'utf8');
	const shell = app.slice(app.indexOf('<Route path="/"'), app.indexOf('<Route path="*"'));
	const declared = [...shell.matchAll(/<Route path="([^"]+)"/g)].map((match) => match[1]);
	const covered = [
		...routes.filter((route) => !['/characters', '/knowledge'].includes(route)),
		'/screen/:id',
		'/scene/:id',
		'/characters/:id?',
		'/knowledge/:id?',
	];
	expect(covered.sort()).toEqual(declared.sort());
});

test('action counter fails closed across a document navigation', async ({ page }) => {
	await page.route('**/friction-navigation', (route) =>
		route.fulfill({ contentType: 'text/html', body: '<button>Action</button>' }),
	);
	await page.goto('/friction-navigation');
	const actions = await countActions(page);
	await page.getByRole('button').click();
	await page.reload();
	await expect(actions.assertWithin('help')).rejects.toThrow(
		'Friction counter lost across document navigation',
	);
});
