import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gotoRoute, markOnboarded, preferTier, seedFresh, dispatch } from './_helpers';
import { builderPane, builderStep } from './_widget-builder';

const baseline = readFileSync(
	new URL('../../../../state/RC-CAN-7.5/aria/aria-home-desktop.yaml', import.meta.url),
	'utf8',
);
const slices = {
	hero: baseline.slice(
		baseline.indexOf('    - heading "Your campaign"'),
		baseline.indexOf('    - heading "Scenes"'),
	),
	// The "New scene" action heads the scene tiles, as it does in the baseline (RC-CAN-7.6).
	'card-grid': baseline.slice(
		baseline.indexOf('    - button "New scene"\n    - button "Ready Harbor'),
		baseline.indexOf('    - heading "Create"'),
	),
	launcher: baseline.slice(
		baseline.indexOf('    - button "New scene A canvas'),
		baseline.indexOf('    - button "New map Battle'),
	),
	'link-list': baseline.slice(
		baseline.indexOf('    - button "Players Roster'),
		baseline.indexOf('    - button "Vault connections'),
	),
};

for (const kind of ['hero', 'card-grid', 'launcher', 'link-list'] as const) {
	test(`${kind} matches CAN-7.5 content and accessible controls`, async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/');
		await page.evaluate(async (kind) => {
			const load = (path: string) => import(/* @vite-ignore */ path);
			const { default: React } = await load('/node_modules/.vite/deps/react.js');
			const {
				default: { createRoot },
			} = await load('/node_modules/.vite/deps/react-dom_client.js');
			const { HubTemplate } = await load('/src/app/widgets/templates/Hub.tsx');
			const { hubFixture } = await load('/src/app/widgets/templates/hubFixtures.ts');
			const { I18nProvider } = await load('/src/i18n/index.tsx');
			const host = document.createElement('div');
			host.id = 'hub-fixture';
			document.body.append(host);
			host.style.cssText =
				'position:fixed;inset:0;z-index:99999;padding:32px;background:var(--color-bg);overflow:auto';
			createRoot(host).render(
				React.createElement(
					I18nProvider,
					null,
					React.createElement(HubTemplate, { ...hubFixture(kind), kind, onIntent: () => {} }),
				),
			);
		}, kind);
		const hub = page.locator('#hub-fixture');
		await expect(hub).toMatchAriaSnapshot(slices[kind].replace(/^ {4}/gm, ''));
		const action = hub.getByRole('button').first();
		await page.keyboard.press('Tab');
		await action.focus();
		await expect(action).toBeFocused();
		expect(await action.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
		await action.hover();
		expect((await new AxeBuilder({ page }).include('#hub-fixture').analyze()).violations).toEqual(
			[],
		);
	});
}

/** Opens the widget builder on a fresh vault, named for the hub example. */
async function openBuilder(page: Page) {
	await markOnboarded(page);
	await gotoRoute(page, '/extensions');
	await seedFresh(page);
	await page.getByRole('button', { name: 'Build a widget' }).click();
	const dialog = page.getByRole('dialog', { name: /Widget builder/ });
	await dialog.getByLabel('Name', { exact: true }).fill('Hub example');
	return dialog;
}

test('builder previews all four hub kinds', async ({ page }) => {
	const dialog = await openBuilder(page);
	await builderStep(dialog, 'Data');
	// Phones show one builder pane at a time behind the collapsed preview strip.
	for (const kind of ['hero', 'card-grid', 'launcher', 'link-list']) {
		await dialog.getByLabel('Template kind', { exact: true }).selectOption(kind);
		await builderPane(page, 'Preview');
		await expect(dialog.getByTestId(`widget-template-${kind}`)).toHaveCount(1);
		await builderPane(page, 'Edit');
	}
});

test('bare frame keeps a labelled region and focus ring, and edit mode restores chrome', async ({
	page,
}, testInfo) => {
	// Phones read a scene through the PhoneNavigator list, which never draws WidgetFrame chrome.
	test.skip(testInfo.project.name.startsWith('mobile'), 'bare applies to canvas frames');
	const dialog = await openBuilder(page);
	await builderStep(dialog, 'Data');
	await dialog.getByLabel('Template kind', { exact: true }).selectOption('launcher');
	await builderStep(dialog, 'Layout');
	await dialog.getByLabel('Presentation', { exact: true }).selectOption('bare');
	await builderStep(dialog, 'Review');
	await dialog
		.getByTestId('builder-footer')
		.getByRole('button', { name: 'Install widget' })
		.click();
	await expect(dialog).toHaveCount(0);
	// RC-WID-6.2 — a template with no permission installs trusted and already on.
	await expect(page.getByRole('switch', { name: 'Enable Hub example' })).toBeChecked();
	const actor = await page.evaluate(() => window.__rt!.defaultActorId);
	const result = await dispatch(page, {
		type: 'scene.create',
		actorId: actor,
		payload: { name: 'Hub test', description: '', visibility: 'shared', tags: [] },
	});
	expect(result.status).toBe('accepted');
	const sceneId = await page.evaluate(
		() => Object.values(window.__rt!.state.scenes.scenes).find((s) => s.name === 'Hub test')!.id,
	);
	const added = await dispatch(page, {
		type: 'scene.add-widget',
		actorId: actor,
		payload: {
			sceneId,
			widget: {
				type: 'hub-example',
				version: '1.0.0',
				layout: { x: 40, y: 40, w: 480, h: 300 },
				configuration: { title: 'Hub example' },
				localState: {},
				binding: null,
			},
		},
	});
	expect(added.status).toBe('accepted');
	await gotoRoute(page, `/scene/${sceneId}`);
	const region = page.locator('[data-testid^="widget-"][role="region"]');
	await expect(region).toBeVisible();
	await expect(region).toHaveAccessibleName(/Hub example/);
	await expect(region).toHaveAttribute('tabindex', '0');
	await expect(region.getByTestId('tile-accent-rail')).toHaveCount(0);
	await page.keyboard.press('Tab');
	await region.focus();
	expect(await region.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
	expect(
		(await new AxeBuilder({ page }).include('[role="region"][aria-label*="Hub example"]').analyze())
			.violations,
	).toEqual([]);
	await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
	await expect(page.getByTestId('tile-accent-rail')).toBeVisible();
	await expect(region).toHaveCount(0);
});

/** Each Command Center part's box as a fraction of its grid, keyed by its region label. */
async function partBoxes(page: Page, grid: string) {
	return page.locator(grid).evaluate((el) => {
		const frame = el.getBoundingClientRect();
		return [...el.querySelectorAll('section[data-widget-region]')].map((region) => {
			const box = region.getBoundingClientRect();
			return {
				part: region.getAttribute('aria-label'),
				left: Math.round(((box.left - frame.left) / frame.width) * 100),
				width: Math.round((box.width / frame.width) * 100),
				top: Math.round(box.top - frame.top),
			};
		});
	});
}

test('the Command Center reads the same at /screen/:id, and its Presentation and Style settings take effect', async ({
	page,
}, testInfo) => {
	// The desktop arrangement; rail and phone are the next test's.
	test.skip(testInfo.project.name.startsWith('mobile'), 'flow grid parity is a desktop check');
	await preferTier(page, 'advanced');
	await markOnboarded(page);
	await gotoRoute(page, '/');
	const home = page.getByTestId('home-screen');
	await expect(home.locator('section[data-widget-region]')).toHaveCount(5);
	const homeId = (await home.getAttribute('data-screen-id'))!;
	const onHome = await partBoxes(page, '[data-testid="home-screen"]');
	// Create over Manage beside Scenes.
	const [, scenes, create, manage] = onHome;
	expect(manage!.left).toBe(create!.left);
	expect(manage!.top).toBeGreaterThan(create!.top);
	expect(create!.left).toBeGreaterThan(scenes!.left + scenes!.width - 5);

	await gotoRoute(page, `/screen/${homeId}`);
	const grid = page.getByTestId('flow-grid');
	await expect(grid.locator('section[data-widget-region]')).toHaveCount(5);
	// Bare parts: no tile chrome at the canonical route either.
	await expect(grid.getByTestId('tile-accent-rail')).toHaveCount(0);
	await expect(grid.getByRole('group')).toHaveCount(0);
	const onScreen = await partBoxes(page, '[data-testid="flow-grid"]');
	expect(onScreen.map(({ part, left, width }) => ({ part, left, width }))).toEqual(
		onHome.map(({ part, left, width }) => ({ part, left, width })),
	);
	expect(await grid.evaluate((el) => getComputedStyle(el).rowGap)).toBe(
		await page.evaluate(() => {
			const probe = document.createElement('div');
			probe.style.rowGap = 'calc(var(--space-6) + var(--space-1))';
			document.body.append(probe);
			const gap = getComputedStyle(probe).rowGap;
			probe.remove();
			return gap;
		}),
	);

	// Restyle the hero through its public settings: framed, with its own accent and text colours.
	const actor = await page.evaluate(() => window.__rt!.defaultActorId);
	const heroId = await page.evaluate(
		(id) => window.__rt!.state.scenes.scenes[id]!.widgets.find((w) => w.type === 'home-hero')!.id,
		homeId,
	);
	const configured = await dispatch(page, {
		type: 'scene.configure-widget',
		actorId: actor,
		payload: {
			sceneId: homeId,
			widgetInstanceId: heroId,
			configuration: {
				presentation: 'framed',
				styleTokens: { accent: '#ff00ff', text: '#00ff00' },
			},
		},
	});
	expect(configured.status).toBe('accepted');
	for (const [route, scope] of [
		['/', 'home-screen'],
		[`/screen/${homeId}`, 'flow-grid'],
	] as const) {
		await gotoRoute(page, route);
		const hero = page.getByTestId(scope).getByTestId('widget-template-hero');
		await expect(hero).toBeVisible();
		await expect(page.getByTestId(scope).getByTestId('tile-accent-rail')).toHaveCount(1);
		await expect(page.getByTestId(scope).getByRole('group', { name: /^Resume,/ })).toBeVisible();
		expect(
			await hero.getByRole('heading', { level: 2 }).evaluate((el) => getComputedStyle(el).color),
		).toBe('rgb(0, 255, 0)');
		expect(
			await hero
				.getByRole('button')
				.last()
				.evaluate((el) => getComputedStyle(el).backgroundColor),
		).toBe('rgb(255, 0, 255)');
		// The other parts keep the theme.
		const scenesHeading = page
			.getByTestId(scope)
			.locator('section[aria-label="2. Scenes"]')
			.getByRole('heading', { level: 2 });
		expect(await scenesHeading.evaluate((el) => getComputedStyle(el).color)).not.toBe(
			'rgb(0, 255, 0)',
		);
	}
});

test('the Command Center lays out the same on / and /screen/:id at rail and phone', async ({
	page,
}, testInfo) => {
	// The viewport is set per tier below; one profile is enough.
	test.skip(testInfo.project.name.startsWith('mobile'), 'tiers are set explicitly');
	await preferTier(page, 'advanced');
	await markOnboarded(page);
	await gotoRoute(page, '/');
	const homeId = (await page.getByTestId('home-screen').getAttribute('data-screen-id'))!;
	for (const size of [
		{ width: 900, height: 900 },
		{ width: 390, height: 844 },
	]) {
		await page.setViewportSize(size);
		await gotoRoute(page, '/');
		await expect(
			page.locator('[data-testid="home-screen"] section[data-widget-region]'),
		).toHaveCount(5);
		const onHome = await partBoxes(page, '[data-testid="home-screen"]');
		await gotoRoute(page, `/screen/${homeId}`);
		// The ordinary screen route draws the flow grid at every tier, not the phone's panel list.
		const grid = page.getByTestId('flow-grid');
		await expect(grid.locator('section[data-widget-region]')).toHaveCount(5);
		await expect(grid.getByTestId('tile-accent-rail')).toHaveCount(0);
		await expect(grid.getByRole('group')).toHaveCount(0);
		const onScreen = await partBoxes(page, '[data-testid="flow-grid"]');
		expect(
			onScreen.map(({ part, left, width }) => ({ part, left, width })),
			`${size.width}px`,
		).toEqual(onHome.map(({ part, left, width }) => ({ part, left, width })));
		// Content-sized: no part clips what it draws.
		const clipped = await grid.evaluate((el) =>
			[...el.querySelectorAll<HTMLElement>('section[data-widget-region]')]
				.filter((region) => region.scrollHeight > region.clientHeight + 1)
				.map((region) => region.getAttribute('aria-label')),
		);
		expect(clipped, `${size.width}px`).toEqual([]);
		const [, scenes, create, manage] = onScreen;
		if (size.width === 900) {
			// Rail keeps Create over Manage beside Scenes, as the hub did.
			expect(create!.left).toBeGreaterThan(scenes!.left + scenes!.width - 5);
			expect(manage!.left).toBe(create!.left);
		} else {
			expect(create!.left).toBe(scenes!.left);
			expect(create!.width).toBe(100);
		}
	}
});

test('Edit widget copies a Command Center part into the builder, and the copy reads the same', async ({
	page,
}, testInfo) => {
	test.skip(testInfo.project.name.startsWith('mobile'), 'the tile menu path is a desktop check');
	await preferTier(page, 'advanced');
	await markOnboarded(page);
	await gotoRoute(page, '/');
	const home = page.getByTestId('home-screen');
	const homeId = (await home.getAttribute('data-screen-id'))!;
	const heroText = await home.locator('section[aria-label="1. Resume"]').innerText();
	const heroId = await page.evaluate(
		(id) => window.__rt!.state.scenes.scenes[id]!.widgets.find((w) => w.type === 'home-hero')!.id,
		homeId,
	);
	const heroType = () =>
		page.evaluate(
			([id, widget]) =>
				window.__rt!.state.scenes.scenes[id]!.widgets.find((w) => w.id === widget)?.type,
			[homeId, heroId],
		);

	await gotoRoute(page, `/screen/${homeId}`);
	await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
	await page.getByTestId(`widget-${heroId}`).getByTestId('flow-tile-actions').click();
	await page.getByRole('menuitem', { name: 'Edit widget', exact: true }).click();
	const builder = page.getByRole('dialog', { name: /Widget builder/ });
	await expect(builder).toBeVisible();
	await expect.poll(heroType).toBe('home-hero-copy');
	await page.keyboard.press('Escape');
	await expect(builder).toHaveCount(0);
	// A template copy is on at once, so the part stays on the GM's own copy.
	await expect.poll(heroType).toBe('home-hero-copy');

	await gotoRoute(page, '/');
	// The copy carries the builder's copy name; it draws exactly what the part drew.
	const copied = page.locator('[data-testid="home-screen"] section[aria-label="1. Resume (copy)"]');
	await expect(copied).toBeVisible();
	expect(await copied.innerText()).toBe(heroText);
	await expect(page.getByTestId('home-screen').getByTestId('tile-accent-rail')).toHaveCount(0);
});
