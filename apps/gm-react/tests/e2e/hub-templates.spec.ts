import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gotoRoute, markOnboarded, seedFresh, dispatch } from './_helpers';

const baseline = readFileSync(
	new URL('../../../../state/RC-CAN-7.5/aria/aria-home-desktop.yaml', import.meta.url),
	'utf8',
);
const slices = {
	hero: baseline.slice(
		baseline.indexOf('    - heading "Your campaign"'),
		baseline.indexOf('    - heading "Scenes"'),
	),
	'card-grid':
		baseline.slice(
			baseline.indexOf('    - button "Ready Harbor'),
			baseline.indexOf('    - heading "Create"'),
		) + '    - button "New scene"\n',
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
	await dialog.getByRole('button', { name: 'Data', exact: true }).click();
	// Narrow viewports show one builder pane at a time behind an Edit / Preview switch.
	const paneSwitch = dialog.getByRole('radio', { name: 'Preview', exact: true });
	const narrow = await paneSwitch.isVisible();
	for (const kind of ['hero', 'card-grid', 'launcher', 'link-list']) {
		await dialog.getByLabel('Template kind', { exact: true }).selectOption(kind);
		if (narrow) await paneSwitch.click();
		await expect(dialog.getByTestId(`widget-template-${kind}`)).toHaveCount(1);
		if (narrow) await dialog.getByRole('radio', { name: 'Edit', exact: true }).click();
	}
});

test('bare frame keeps a labelled region and focus ring, and edit mode restores chrome', async ({
	page,
}, testInfo) => {
	// Phones read a scene through the PhoneNavigator list, which never draws WidgetFrame chrome.
	test.skip(testInfo.project.name.startsWith('mobile'), 'bare applies to canvas frames');
	const dialog = await openBuilder(page);
	await dialog.getByRole('button', { name: 'Data', exact: true }).click();
	await dialog.getByLabel('Template kind', { exact: true }).selectOption('launcher');
	await dialog.getByRole('button', { name: 'Layout', exact: true }).click();
	await dialog.getByLabel('Presentation', { exact: true }).selectOption('bare');
	await dialog.getByRole('button', { name: 'Review', exact: true }).click();
	await dialog.getByRole('button', { name: 'Install widget' }).click();
	await expect(dialog).toHaveCount(0);
	await page.getByRole('switch', { name: 'Enable Hub example' }).click();
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
