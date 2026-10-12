import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
	countActions,
	FRICTION_BUDGETS,
	gotoRoute,
	markOnboarded,
	preferPhoneCanvas,
	waitReady,
} from './_helpers';

// Touch is enabled at both viewport sizes so the counter's tap branch is tested in each project.
test.use({ hasTouch: true });

async function drag(page: Page, target: Locator, dx: number, dy: number) {
	await target.scrollIntoViewIfNeeded();
	const box = (await target.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 8 });
	await page.mouse.up();
}

test('action counter unit: scripted clicks, tap, chord, typing, drag and excluded scroll', async ({
	page,
}) => {
	await page.setContent(
		'<button>Action</button><input aria-label="Text"><div aria-label="Drag" style="width:100px;height:100px;touch-action:none"></div><div style="height:2000px"></div>',
	);
	const actions = await countActions(page);
	const button = page.getByRole('button');
	await button.click();
	await button.tap();
	await button.press('Enter'); // The resulting synthetic click must not count twice.
	await page.keyboard.press('Control+k');
	await page.getByLabel('Text').click();
	await page.keyboard.type('ab');
	await drag(page, page.getByLabel('Drag'), 40, 20);
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
	]);
	await actions.stop();
	await button.click();
	expect(await actions.snapshot()).toHaveLength(8);
	const next = await countActions(page);
	await button.click();
	expect(await next.snapshot()).toHaveLength(1);
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

test('budget table matches executable ceilings and cannot loosen recorded history', () => {
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
	const revisions = execFileSync('git', ['log', '--format=%H', '--', path], {
		cwd: root,
		encoding: 'utf8',
	})
		.trim()
		.split('\n')
		.filter(Boolean);
	for (const previous of [
		original,
		...revisions.map((sha) =>
			parse(execFileSync('git', ['show', `${sha}:${path}`], { cwd: root, encoding: 'utf8' })),
		),
	]) {
		for (const [id, limit] of Object.entries(previous)) {
			expect(
				FRICTION_BUDGETS[id as keyof typeof FRICTION_BUDGETS],
				`${id} may only tighten`,
			).toBeLessThanOrEqual(limit);
		}
	}
});

test('golden friction: onboarding with keyboard only', async ({ page }) => {
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
	await actions.assertWithin('onboarding-keys');
});

test('golden friction: add, move and resize a tile in four actions from Edit layout', async ({
	page,
}) => {
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
	const actions = await countActions(page);
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page
		.getByTestId('add-widget-gallery')
		.getByRole('button', { name: 'Add Dice', exact: true })
		.click();
	await expect(frames).toHaveCount(before.size + 1);
	const ids = await frames.evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')!));
	const tile = page.getByTestId(ids.find((id) => !before.has(id))!);
	await expect(tile).toBeFocused();
	const initial = await tile.getAttribute('aria-label');
	await drag(page, tile.getByTestId('tile-drag-surface'), 0, 40);
	await expect(tile).not.toHaveAttribute('aria-label', initial!);
	const moved = await tile.getAttribute('aria-label');
	await drag(page, tile.getByRole('button', { name: /^Resize / }), 0, 40);
	await expect(tile).not.toHaveAttribute('aria-label', moved!);
	await actions.assertWithin('tile-layout');
	expect((await actions.snapshot()).map((action) => action.kind)).toEqual([
		'click',
		'click',
		'drag',
		'drag',
	]);
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
		const actions = await countActions(page);
		await page.getByRole('button', { name: 'Help', exact: true }).click();
		await expect(page.getByRole('dialog')).toBeVisible();
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
		const actions = await countActions(page);
		await page.getByRole('button', { name: 'Help', exact: true }).click();
		await expect(page.getByRole('dialog')).toBeVisible();
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
