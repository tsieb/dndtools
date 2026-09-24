import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded } from './_helpers';

async function openAtlas(page: Page) {
	await markOnboarded(page);
	await gotoRoute(page, '/atlas');
}

async function createMap(page: Page) {
	const result = await dispatch(page, {
		type: 'map.create',
		actorId: 'dm-1',
		payload: {
			name: 'Polish map',
			visibility: 'dm-only',
			projection: { kind: 'flat', rotationDegrees: 0 },
			initialLayers: [{ name: 'Base', category: 'base', visibility: 'dm-only' }],
		},
	});
	expect(result.status).toBe('accepted');
	await page.getByRole('button', { name: 'Polish map', exact: true }).click();
}

async function scan(page: Page) {
	// Scan the settled overlay, not a partially transparent entrance-animation frame.
	await page.evaluate(async () => {
		await Promise.all(
			document
				.getAnimations()
				.filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
				.map((animation) => animation.finished.catch(() => {})),
		);
	});
	const result = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
		.analyze();
	// No register exemptions, including moderate/minor violations in these interactive states.
	expect(
		result.violations.map(({ id, nodes }) => ({
			id,
			targets: nodes.map((n) => ({ target: n.target, failure: n.failureSummary })),
		})),
	).toEqual([]);
}

test('Atlas polish: empty, filtered and creation states are accessible', async ({ page }) => {
	await openAtlas(page);
	const maps = await page.evaluate(() =>
		Object.keys((window.__rt!.state.maps as { maps: Record<string, unknown> }).maps),
	);
	for (const mapId of maps)
		expect(
			(
				await dispatch(page, {
					type: 'map.delete',
					actorId: 'dm-1',
					payload: { mapId, force: true },
				})
			).status,
		).toBe('accepted');
	await expect(page.locator('[data-illustration="map-library"]')).toBeVisible();
	await scan(page);
	await page.getByRole('button', { name: 'New map', exact: true }).click();
	await scan(page);
	await page.getByRole('button', { name: 'Cancel', exact: true }).click();
	await createMap(page);
	await scan(page);
	await page.getByRole('searchbox').fill('No matching map');
	await expect(page.locator('[data-illustration="search-none"]')).toBeVisible();
	await scan(page);
});

test('Atlas polish: editor overlays pass axe and return keyboard focus', async ({ page }, info) => {
	test.setTimeout(120_000);
	await openAtlas(page);
	await createMap(page);
	const opener = page.getByRole('button', { name: 'Open in map editor' });
	await opener.focus();
	await page.keyboard.press('Enter');
	const editor = page.getByRole('dialog', { name: 'Map editor — Polish map' });
	await expect(editor).toBeVisible();
	await scan(page);
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	await expect(page.getByRole('dialog', { name: 'Export map', exact: true })).toBeVisible();
	await scan(page);
	await page.getByRole('button', { name: 'Import map…', exact: true }).click();
	const importer = page.getByRole('dialog', { name: 'Import map', exact: true });
	await expect(importer).toBeVisible();
	await scan(page);
	await importer.getByRole('button', { name: 'Close', exact: true }).click();
	await page.getByRole('button', { name: 'Search — command palette' }).click();
	await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
	await scan(page);
	await page.keyboard.press('Escape');
	await editor.focus();
	await page.keyboard.press('?');
	const shortcuts = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
	await expect(shortcuts).toBeVisible();
	await scan(page);
	await shortcuts.getByRole('button', { name: 'Close', exact: true }).click();
	if (info.project.name === 'mobile-chromium') {
		await page.getByRole('button', { name: 'Panels', exact: true }).click();
		await scan(page);
		await page
			.getByRole('dialog', { name: 'Map panels' })
			.getByRole('button', { name: 'Close', exact: true })
			.click();
	}
	await page.getByRole('button', { name: 'Back to Atlas', exact: true }).click();
	await expect(editor).not.toBeVisible();
	await expect(opener).toBeFocused();
});

test('Atlas polish: unavailable deep link reports recovery; large text keeps controls reachable', async ({
	page,
}) => {
	await openAtlas(page);
	await createMap(page);
	await page.evaluate(() => {
		location.hash = '/atlas?map=missing-map';
	});
	await expect(page.getByRole('alert')).toContainText('isn’t available to you');
	await scan(page);
	await page.getByRole('button', { name: 'Dismiss notice' }).click();
	await page.evaluate(() => {
		document.documentElement.style.fontSize = '200%';
	});
	await page.getByRole('button', { name: 'Open in map editor' }).click();
	await page.getByRole('button', { name: 'Show list', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Show map', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Back to Atlas', exact: true }).click();
	await expect(page.getByRole('button', { name: 'New map', exact: true })).toBeVisible();
});

test('Atlas polish: layer menus, tags and named deletion remain accessible', async ({
	page,
}, info) => {
	await openAtlas(page);
	await createMap(page);
	await page.getByRole('button', { name: 'Open in map editor' }).click();
	if (info.project.name === 'mobile-chromium')
		await page.getByRole('button', { name: 'Panels', exact: true }).click();
	await page.getByRole('button', { name: 'Base actions', exact: true }).click();
	await expect(page.getByRole('dialog', { name: 'Layer actions — Base' })).toBeVisible();
	await scan(page);
	await page.getByRole('button', { name: 'Edit tags', exact: true }).click();
	const tags = page.getByRole('dialog', { name: 'Tags — Base' });
	await expect(tags).toBeVisible();
	await scan(page);
	const target = await page.evaluate(() => {
		const maps = (
			window.__rt!.state.maps as {
				maps: Record<string, { id: string; name: string; layers: { id: string }[] }>;
			}
		).maps;
		const map = Object.values(maps).find((entry) => entry.name === 'Polish map')!;
		return { mapId: map.id, layerId: map.layers[0]!.id };
	});
	expect(
		(
			await dispatch(page, {
				type: 'map.lock-layer',
				actorId: 'dm-1',
				payload: { ...target, locked: true },
			})
		).status,
	).toBe('accepted');
	await tags.getByRole('textbox').fill('coast');
	await tags.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(tags).toBeVisible();
	await expect(tags.getByRole('alert')).toContainText('locked');
	await scan(page);
	expect(
		(
			await dispatch(page, {
				type: 'map.lock-layer',
				actorId: 'dm-1',
				payload: { ...target, locked: false },
			})
		).status,
	).toBe('accepted');
	await tags.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(tags).not.toBeVisible();
	await page.getByRole('button', { name: 'Base actions', exact: true }).click();
	await page
		.getByRole('dialog', { name: 'Layer actions — Base' })
		.getByRole('button', { name: 'Delete', exact: true })
		.click();
	const confirmation = page.getByRole('dialog', { name: 'Delete layer “Base”?' });
	await expect(confirmation).toBeVisible();
	await scan(page);
	await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
});

test('Atlas polish: rail header actions fit on one line', async ({ page }) => {
	await page.setViewportSize({ width: 834, height: 1112 });
	await openAtlas(page);
	await createMap(page);
	await page.getByRole('button', { name: 'Open in map editor' }).click();
	const header = page.getByRole('dialog', { name: 'Map editor — Polish map' }).locator('header');
	const bounds = await header.boundingBox();
	expect(bounds).not.toBeNull();
	expect(bounds!.height).toBeLessThanOrEqual(72);
	for (const name of ['Export', 'Project to players']) {
		const button = header.getByRole('button', { name, exact: true });
		const box = await button.boundingBox();
		expect(box).not.toBeNull();
		expect(box!.height).toBeLessThanOrEqual(48);
		expect(box!.x + box!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
	}
});
