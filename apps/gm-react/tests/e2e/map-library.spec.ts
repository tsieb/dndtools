import { expect, test } from '@playwright/test';
import {
	dispatch,
	enterPreview,
	exitPreview,
	gotoRoute,
	markOnboarded,
	seedFresh,
	waitReady,
} from './_helpers';

test.beforeEach(async ({ page }) => {
	await markOnboarded(page);
	await gotoRoute(page, '/atlas');
	await seedFresh(page);
	await page.goto('/#/atlas');
	await waitReady(page);
});

test('gallery thumbnails, keyboard preview, region filtering and illustrated empty results', async ({
	page,
}) => {
	const gallery = page.getByRole('group', { name: 'Map library', exact: true });
	const cards = gallery.getByRole('button');
	await expect(cards).not.toHaveCount(0);
	const firstName = await cards.first().locator('.map-library-name').innerText();
	await expect(gallery.getByRole('button', { name: firstName, exact: true })).toHaveCount(1);
	await expect(cards.first()).toHaveAccessibleDescription(/POIs.*layers?/);

	await expect(gallery.locator('img').first()).toBeVisible();
	const image = gallery.locator('img').first();
	await expect(image).toHaveAttribute('src', /^data:image\/svg\+xml/);
	const box = await image.boundingBox();
	expect(box!.width / box!.height).toBeCloseTo(16 / 9, 1);
	await cards.first().focus();
	await page.keyboard.press('End');
	await expect(cards.last()).toBeFocused();
	await page.keyboard.press('Space');
	await expect(cards.last()).toHaveAttribute('aria-current', 'true');
	const preview = page.locator('.atlas-library-preview');
	const spaceName = await cards.last().locator('.map-library-name').innerText();
	await expect(preview.getByText(spaceName, { exact: true })).toBeVisible();
	await page.keyboard.press('Home');
	await expect(cards.first()).toBeFocused();
	await page.keyboard.press('ArrowRight');
	await expect(cards.nth(1)).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(cards.nth(1)).toHaveAttribute('aria-current', 'true');
	const selectedName = await cards.nth(1).locator('.map-library-name').innerText();
	await expect(preview.getByText(selectedName, { exact: true })).toBeVisible();
	if (test.info().project.name === 'desktop-chromium') {
		const left = await gallery.boundingBox();
		const right = await preview.boundingBox();
		expect(right!.x).toBeGreaterThanOrEqual(left!.x + left!.width);
	}
	await cards.first().focus();
	const columns = await cards.evaluateAll(
		(buttons) =>
			buttons.filter(
				(button) => (button as HTMLElement).offsetTop === (buttons[0] as HTMLElement).offsetTop,
			).length,
	);
	await page.keyboard.press('ArrowDown');
	await expect(cards.nth(Math.min(columns, (await cards.count()) - 1))).toBeFocused();
	await page.keyboard.press('ArrowUp');
	await expect(cards.first()).toBeFocused();
	await page.screenshot({ path: test.info().outputPath('map-library.png'), fullPage: true });
	const region = await cards.nth(1).locator(':scope > span').nth(1).innerText();
	await page.getByRole('searchbox').fill(region);
	await expect(cards).not.toHaveCount(0);
	await page.getByRole('searchbox').fill('no-map-has-this-name-44');
	await expect(page.getByText('No matching maps', { exact: true })).toBeVisible();
	await expect(page.locator('[data-illustration="search-none"]')).toBeVisible();
	await page.getByRole('button', { name: 'Clear filter' }).click();
	await expect(cards).not.toHaveCount(0);
});

test('worker renders each uncached vector thumbnail under 100 ms and caches data URIs', async ({
	page,
}) => {
	const samples = await page.evaluate(async () => {
		const clientPath = '/src/app/map/thumbnail.ts';
		const { MapThumbnailClient } = await import(/* @vite-ignore */ clientPath);
		const client = new MapThumbnailClient();
		const durations: number[] = [];
		try {
			for (let i = 0; i < 12; i++) {
				const model = {
					view: {
						kind: 'available',
						mapId: `perf-${i}`,
						name: 'Performance map',
						fog: [],
						routes: [],
						pois: [],
					},
					layers: [
						{
							layerId: 'base',
							enabled: true,
							order: 0,
							opacity: 1,
							category: 'base',
							content: Array.from({ length: 500 }, (_, j) => ({
								id: `f-${j}`,
								kind: 'room',
								style: '',
								points: [
									{ x: (j % 20) / 20, y: Math.floor(j / 20) / 25 },
									{ x: (j % 20) / 20 + 0.04, y: Math.floor(j / 20) / 25 + 0.03 },
								],
								props: {},
							})),
						},
					],
					colors: { '--map-canvas-bg': '#201810', '--layer-base': '#aa9977' },
				};
				const pending = client.generate(model);
				if (client.generate(model) !== pending) throw new Error('In-flight request was not cached');
				const result = await pending;
				if ((await client.generate(model)).uri !== result.uri)
					throw new Error('Data URI cache missed');
				durations.push(result.durationMs);
			}
		} finally {
			client.dispose();
		}
		return durations;
	});
	console.log('Uncached 500-feature thumbnail worker render times (ms):', samples);
	for (const duration of samples) expect(duration).toBeLessThan(100);
});

test('party badge follows the durable location and hidden maps disappear in player preview', async ({
	page,
}) => {
	const data = await page.evaluate(() => ({
		actorId: window.__rt!.defaultActorId,
		maps: Object.values(window.__rt!.state.maps.maps) as { id: string; name: string }[],
	}));
	const created = await dispatch(page, {
		type: 'map.create',
		actorId: data.actorId,
		payload: { name: 'Private party camp', visibility: 'dm-only' },
	});
	expect(created.status).toBe('accepted');
	const map = {
		id: created.events!.find((event) => event.kind === 'map.created')!.mapId as string,
		name: 'Private party camp',
	};
	expect(
		(
			await dispatch(page, {
				type: 'session.mark-party',
				actorId: data.actorId,
				payload: { mapId: map.id, x: 0.5, y: 0.5 },
			})
		).status,
	).toBe('accepted');
	const gallery = page.getByRole('group', { name: 'Map library', exact: true });
	await expect(gallery.getByRole('button', { name: new RegExp(map.name) })).toContainText(
		'Party here',
	);
	for (const entry of data.maps) {
		expect(
			(
				await dispatch(page, {
					type: 'map.delete',
					actorId: data.actorId,
					payload: { mapId: entry.id, force: true },
				})
			).status,
		).toBe('accepted');
	}
	await enterPreview(page, 'player');
	await expect(page.getByText('Your map library is empty', { exact: true })).toBeVisible();
	await expect(page.locator('[data-illustration="map-library"]')).toBeVisible();
	await expect(page.locator('.map-library-card')).toHaveCount(0);
	await exitPreview(page);
	await expect(gallery.getByRole('button', { name: new RegExp(map.name) })).toContainText(
		'Party here',
	);
});
