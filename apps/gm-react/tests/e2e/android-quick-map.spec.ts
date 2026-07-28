import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { Buffer } from 'node:buffer';
import { dispatch, gotoRoute, markOnboarded, seedFresh } from './_helpers';

const DM = 'dm-1';

async function enableAndroidRuntime(page: Page): Promise<void> {
	await page.addInitScript(() => {
		(
			globalThis as typeof globalThis & {
				__DNDTOOLS_TEST_RUNTIME_KIND__?: 'android';
			}
		).__DNDTOOLS_TEST_RUNTIME_KIND__ = 'android';
	});
}

async function openQuickMap(page: Page, suffix: string): Promise<{ mapId: string; name: string }> {
	await enableAndroidRuntime(page);
	await page.setViewportSize({ width: 360, height: 640 });
	await markOnboarded(page);
	await gotoRoute(page, '/atlas');
	await seedFresh(page);
	const name = `Android Quick Map ${suffix}`;
	const result = await dispatch(page, {
		type: 'map.create',
		actorId: DM,
		payload: {
			name,
			visibility: 'dm-only',
			projection: { kind: 'flat', rotationDegrees: 0 },
			initialLayers: [
				{ name: 'Base', category: 'base', visibility: 'dm-only' },
				{ name: 'Fog', category: 'fog', visibility: 'shared' },
				{ name: 'Tokens', category: 'player-overlay', visibility: 'shared' },
				{ name: 'POIs', category: 'poi', visibility: 'dm-only' },
			],
		},
	});
	expect(result.status).toBe('accepted');
	const mapId = result.events?.find((event) => event.kind === 'map.created')?.mapId;
	expect(mapId).toBeTruthy();
	await page.getByRole('button', { name, exact: true }).click();
	await page.getByRole('button', { name: 'Open in map editor' }).click();
	await expect(page.getByRole('dialog', { name: `Map editor — ${name}` })).toBeVisible();
	return { mapId: String(mapId), name };
}

function rawMap(page: Page, mapId: string) {
	return page.evaluate((id) => {
		const map = (window.__rt!.state.maps as { maps: Record<string, unknown> }).maps[id] as {
			layers: Array<{
				id: string;
				name: string;
				enabled: boolean;
				visibility: 'dm-only' | 'player-visible' | 'shared';
				content: unknown[];
			}>;
			assetIds: string[];
			fog: Array<{ id: string; kind: 'reveal' | 'conceal' }>;
			pois: Array<{ id: string; position: { x: number; y: number } }>;
			tokens: Array<{ id: string; position: { x: number; y: number } }>;
		};
		return map;
	}, mapId);
}

test.describe('Android quick map', () => {
	test('is canvas-first, touch-sized, bounded, resizable, and free of precision tools', async ({
		page,
	}) => {
		await openQuickMap(page, 'surface');
		const editor = page.getByRole('dialog', { name: /^Map editor/ });
		await expect(editor).toHaveAttribute('data-quick-map', 'true');
		await expect(page.getByRole('toolbar', { name: 'Quick map actions' })).toBeVisible();
		await expect(page.getByRole('toolbar', { name: 'Map tools' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Navigate map' })).toHaveAttribute(
			'aria-pressed',
			'true',
		);
		for (const hidden of ['Terrain', 'Structure', 'Lighting', 'Marquee', 'Room', 'Wall']) {
			await expect(editor.getByRole('button', { name: hidden, exact: true })).toHaveCount(0);
		}

		const dimensions = await editor.evaluate((element) => ({
			clientWidth: element.clientWidth,
			scrollWidth: element.scrollWidth,
			clientHeight: element.clientHeight,
			scrollHeight: element.scrollHeight,
		}));
		expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
		expect(dimensions.scrollHeight).toBeLessThanOrEqual(dimensions.clientHeight + 1);

		const undersized = await editor.locator('button:visible').evaluateAll((buttons) =>
			buttons.flatMap((button) => {
				const rect = button.getBoundingClientRect();
				if (rect.width >= 47.5 && rect.height >= 47.5) return [];
				return [
					`${button.getAttribute('aria-label') || button.textContent?.trim() || 'button'} (${Math.round(rect.width)}x${Math.round(rect.height)})`,
				];
			}),
		);
		expect(undersized, 'Android quick-map buttons must be at least 48dp').toEqual([]);

		await page.getByRole('button', { name: 'More map actions' }).click();
		await page.getByRole('button', { name: 'About advanced drawing' }).click();
		await expect(
			page.getByText(/Advanced map drawing is available in the desktop app/),
		).toBeVisible();

		await page.getByRole('button', { name: 'Panels' }).click();
		const sheet = page.getByRole('dialog', { name: 'Map details' });
		await expect(sheet).toBeVisible();
		const handle = sheet.getByRole('separator', { name: 'Resize map details sheet' });
		const before = await sheet.boundingBox();
		await handle.focus();
		await page.keyboard.press('ArrowUp');
		await expect
			.poll(async () => (await sheet.boundingBox())?.height ?? 0)
			.toBeGreaterThan(before?.height ?? 0);
		await sheet.getByRole('button', { name: 'Close' }).click();

		const axe = await new AxeBuilder({ page })
			.withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
			.analyze();
		expect(
			axe.violations.filter((violation) =>
				['critical', 'serious'].includes(violation.impact ?? ''),
			),
		).toEqual([]);
	});

	test('supports live-session edits, undo/redo, generation, import/export, and preservation', async ({
		page,
	}) => {
		const { mapId, name } = await openQuickMap(page, 'workflow');
		const editor = page.getByRole('dialog', { name: `Map editor — ${name}` });
		const initial = await rawMap(page, mapId);
		const baseLayer = initial.layers.find((layer) => layer.name === 'Base')!;
		const precisionFeature = {
			id: 'desktop-secret-door',
			kind: 'door',
			points: [
				{ x: 0.2, y: 0.2 },
				{ x: 0.3, y: 0.2 },
			],
			style: 'door',
			props: { portal: 'secret', state: 'locked', blocksSight: true },
		};
		expect(
			(
				await dispatch(page, {
					type: 'map.add-features',
					actorId: DM,
					payload: { mapId, layerId: baseLayer.id, features: [precisionFeature] },
				})
			).status,
		).toBe('accepted');
		const preservedBefore = JSON.stringify((await rawMap(page, mapId)).layers[0]!.content);

		const canvas = page.getByRole('application');
		const box = await canvas.boundingBox();
		expect(box).not.toBeNull();
		const point = { x: box!.x + box!.width * 0.44, y: box!.y + box!.height * 0.44 };

		await page.getByRole('button', { name: 'Token', exact: true }).click();
		await canvas.click({ position: { x: box!.width * 0.44, y: box!.height * 0.44 } });
		await expect.poll(async () => (await rawMap(page, mapId)).tokens.length).toBe(1);
		const selectedSheet = page.getByRole('dialog', { name: 'Map details' });
		await expect(selectedSheet).toBeVisible();
		await selectedSheet.getByRole('button', { name: 'Close' }).click();
		await expect(selectedSheet).toBeHidden();
		await expect(page.getByRole('button', { name: 'Navigate map' })).toHaveAttribute(
			'aria-pressed',
			'true',
		);
		// Closing the properties sheet does not itself deselect the marker. Clear that selection so
		// arming the next one-shot placement tool cannot legitimately reopen the sheet over the canvas.
		const placedTokenMarker = canvas.getByRole('button', { name: 'Token: Token 1' });
		if ((await placedTokenMarker.getAttribute('aria-pressed')) === 'true') {
			await page.keyboard.press('Escape');
			await expect(placedTokenMarker).toHaveAttribute('aria-pressed', 'false');
		}

		await page.getByRole('button', { name: 'Point of interest' }).click();
		await expect(page.getByRole('button', { name: 'Point of interest' })).toHaveAttribute(
			'aria-pressed',
			'true',
		);
		const refreshedBox = await canvas.boundingBox();
		expect(refreshedBox).not.toBeNull();
		await canvas.click({
			position: { x: refreshedBox!.width * 0.7, y: refreshedBox!.height * 0.3 },
		});
		await expect.poll(async () => (await rawMap(page, mapId)).pois.length).toBe(1);
		await selectedSheet.getByRole('button', { name: 'Close' }).click();
		await expect(selectedSheet).toBeHidden();
		const placedPoiMarker = canvas.getByRole('button', { name: 'POI: New POI' });
		if ((await placedPoiMarker.getAttribute('aria-pressed')) === 'true') {
			await page.keyboard.press('Escape');
			await expect(placedPoiMarker).toHaveAttribute('aria-pressed', 'false');
		}
		await expect(editor).toBeVisible();

		const beforeMove = await rawMap(page, mapId);
		const tokenBefore = beforeMove.tokens[0]!;
		const poiBefore = beforeMove.pois[0]!;
		await page.getByRole('button', { name: 'Select & move' }).click();

		const tokenMarker = canvas.getByRole('button', { name: 'Token: Token 1' });
		const tokenBox = await tokenMarker.boundingBox();
		expect(tokenBox).not.toBeNull();
		await page.mouse.move(tokenBox!.x + tokenBox!.width / 2, tokenBox!.y + tokenBox!.height / 2);
		await page.mouse.down();
		await page.mouse.move(
			tokenBox!.x + tokenBox!.width / 2 + 34,
			tokenBox!.y + tokenBox!.height / 2 + 24,
			{
				steps: 5,
			},
		);
		await page.mouse.up();
		await expect
			.poll(async () => {
				const token = (await rawMap(page, mapId)).tokens.find(({ id }) => id === tokenBefore.id)!;
				return Math.hypot(
					token.position.x - tokenBefore.position.x,
					token.position.y - tokenBefore.position.y,
				);
			})
			.toBeGreaterThan(0.02);

		const poiMarker = canvas.getByRole('button', { name: 'POI: New POI' });
		const poiBox = await poiMarker.boundingBox();
		expect(poiBox).not.toBeNull();
		await page.mouse.move(poiBox!.x + poiBox!.width / 2, poiBox!.y + poiBox!.height / 2);
		await page.mouse.down();
		await page.mouse.move(poiBox!.x + poiBox!.width / 2 - 28, poiBox!.y + poiBox!.height / 2 + 32, {
			steps: 5,
		});
		await page.mouse.up();
		await expect
			.poll(async () => {
				const poi = (await rawMap(page, mapId)).pois.find(({ id }) => id === poiBefore.id)!;
				return Math.hypot(
					poi.position.x - poiBefore.position.x,
					poi.position.y - poiBefore.position.y,
				);
			})
			.toBeGreaterThan(0.02);

		await page.getByRole('button', { name: 'Fog', exact: true }).click();
		await page.mouse.move(point.x - 35, point.y - 35);
		await page.mouse.down();
		await page.mouse.move(point.x + 55, point.y + 45, { steps: 5 });
		await page.mouse.up();
		await expect.poll(async () => (await rawMap(page, mapId)).fog.length).toBe(1);
		expect((await rawMap(page, mapId)).fog[0]!.kind).toBe('reveal');
		await page.getByRole('button', { name: 'Undo' }).click();
		await expect.poll(async () => (await rawMap(page, mapId)).fog.length).toBe(0);
		await page.getByRole('button', { name: 'Redo' }).click();
		await expect.poll(async () => (await rawMap(page, mapId)).fog.length).toBe(1);

		await page.getByRole('button', { name: 'Fog', exact: true }).click();
		await page.getByRole('radio', { name: 'Conceal' }).click();
		await page.mouse.move(point.x + 20, point.y - 70);
		await page.mouse.down();
		await page.mouse.move(point.x + 80, point.y - 20, { steps: 5 });
		await page.mouse.up();
		await expect.poll(async () => (await rawMap(page, mapId)).fog.length).toBe(2);
		expect((await rawMap(page, mapId)).fog[1]!.kind).toBe('conceal');

		await page.getByRole('button', { name: 'Panels' }).click();
		const mapDetails = page.getByRole('dialog', { name: 'Map details' });
		await mapDetails.getByRole('tab', { name: 'Layers' }).click();
		const baseRow = mapDetails.getByRole('listitem', { name: /^Base, type base,/ });
		await baseRow.getByRole('button', { name: 'Base: DM display on' }).click();
		await expect
			.poll(
				async () =>
					(await rawMap(page, mapId)).layers.find(({ id }) => id === baseLayer.id)?.enabled,
			)
			.toBe(false);
		await baseRow.getByRole('button', { name: 'Base: DM display off' }).click();
		await expect
			.poll(
				async () =>
					(await rawMap(page, mapId)).layers.find(({ id }) => id === baseLayer.id)?.enabled,
			)
			.toBe(true);
		await baseRow.getByRole('button', { name: 'Visibility: dm-only' }).click();
		await expect
			.poll(
				async () =>
					(await rawMap(page, mapId)).layers.find(({ id }) => id === baseLayer.id)?.visibility,
			)
			.toBe('player-visible');
		await baseRow.getByRole('button', { name: 'Visibility: players' }).click();
		await baseRow.getByRole('button', { name: 'Visibility: shared' }).click();
		await expect
			.poll(
				async () =>
					(await rawMap(page, mapId)).layers.find(({ id }) => id === baseLayer.id)?.visibility,
			)
			.toBe('dm-only');
		await mapDetails.getByRole('button', { name: 'Close' }).click();
		await expect(mapDetails).toBeHidden();

		await page.getByRole('button', { name: 'Generate', exact: true }).click();
		const generateSheet = page.getByRole('dialog', { name: 'Generate map' });
		await expect(generateSheet).toBeVisible();
		await generateSheet.getByRole('button', { name: 'Dungeon — Organic' }).click();
		await generateSheet.getByRole('button', { name: 'Cramped crypt' }).click();
		await expect(
			generateSheet.getByText(/Ghost preview on the canvas · \d+ features/),
		).toBeVisible();
		await generateSheet.getByRole('button', { name: 'Accept' }).click();
		await expect(generateSheet).toBeHidden();
		await expect(page.getByRole('button', { name: 'Navigate map' })).toHaveAttribute(
			'aria-pressed',
			'true',
		);

		const preservedAfter = JSON.stringify(
			(await rawMap(page, mapId)).layers.find((layer) => layer.id === baseLayer.id)!.content,
		);
		expect(preservedAfter).toBe(preservedBefore);

		expect(
			(
				await dispatch(page, {
					type: 'command-center.ensure-home',
					actorId: DM,
					payload: {},
				})
			).status,
		).toBe('accepted');
		const activeSceneId = await page.evaluate(() => {
			const commandCenter = window.__rt!.state.commandCenter as { homeSceneId: string | null };
			return commandCenter.homeSceneId;
		});
		expect(activeSceneId).toBeTruthy();
		expect(
			(
				await dispatch(page, {
					type: 'session.set-workflow',
					actorId: DM,
					payload: { workflow: 'active', activeSceneId },
				})
			).status,
		).toBe('accepted');
		await editor.getByRole('button', { name: 'Project to players' }).click();
		await expect(page.getByText(`Projected “${name}” to 3 players.`)).toBeVisible();
		await expect
			.poll(() =>
				page.evaluate((id) => {
					const session = window.__rt!.state.session as {
						activeMap: { mapId: string } | null;
						activeMapProjections: Record<string, { mapId: string }>;
					};
					return (
						session.activeMap?.mapId === id &&
						Object.values(session.activeMapProjections).filter(
							(projection) => projection.mapId === id,
						).length
					);
				}, mapId),
			)
			.toBe(3);

		await page.getByRole('button', { name: 'More map actions' }).click();
		const download = page.waitForEvent('download');
		await page.getByRole('button', { name: 'Export for other VTTs (.dd2vtt)' }).click();
		expect((await download).suggestedFilename()).toMatch(/\.dd2vtt$/);

		await page.getByRole('button', { name: 'More map actions' }).click();
		await page.getByRole('button', { name: 'Import map…' }).click();
		const importDialog = page.getByRole('dialog', { name: 'Import map' });
		await expect(importDialog).toBeVisible();
		const assetsBefore = (await rawMap(page, mapId)).assetIds.length;
		await importDialog.locator('input[type="file"]').setInputFiles({
			name: 'quick-map-alpha.svg',
			mimeType: 'image/svg+xml',
			buffer: Buffer.from(
				'<svg xmlns="http://www.w3.org/2000/svg" width="12" height="8"><rect width="12" height="8" fill="#123456"/></svg>',
			),
		});
		await expect(importDialog.getByText('quick-map-alpha.svg')).toBeVisible();
		await importDialog.getByRole('button', { name: 'Preview' }).click();
		await expect(importDialog.getByText('File fingerprint')).toBeVisible();
		await importDialog.getByRole('button', { name: 'Import' }).click();
		await expect(importDialog.getByText(`Import committed to “${name}”`)).toBeVisible();
		await expect
			.poll(async () => (await rawMap(page, mapId)).assetIds.length)
			.toBe(assetsBefore + 1);
		await importDialog.getByRole('button', { name: 'Done' }).click();
		await expect(importDialog).toBeHidden();

		const preservedAfterImport = JSON.stringify(
			(await rawMap(page, mapId)).layers.find((layer) => layer.id === baseLayer.id)!.content,
		);
		expect(preservedAfterImport).toBe(preservedBefore);
	});

	test('uses two fingers for centroid-aware navigation even while an edit mode is armed', async ({
		page,
	}) => {
		await openQuickMap(page, 'pinch');
		await page.getByRole('button', { name: 'Fog', exact: true }).click();
		const canvas = page.getByRole('application');
		const box = await canvas.boundingBox();
		expect(box).not.toBeNull();
		const x = box!.x + box!.width * 0.5;
		const y = box!.y + box!.height * 0.5;
		const cdp = await page.context().newCDPSession(page);
		await cdp.send('Input.dispatchTouchEvent', {
			type: 'touchStart',
			touchPoints: [
				{ id: 1, x: x - 35, y, radiusX: 4, radiusY: 4, force: 1 },
				{ id: 2, x: x + 35, y, radiusX: 4, radiusY: 4, force: 1 },
			],
		});
		await cdp.send('Input.dispatchTouchEvent', {
			type: 'touchMove',
			touchPoints: [
				{ id: 1, x: x - 90, y: y + 10, radiusX: 4, radiusY: 4, force: 1 },
				{ id: 2, x: x + 90, y: y + 10, radiusX: 4, radiusY: 4, force: 1 },
			],
		});
		await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

		await expect
			.poll(async () => {
				const text = await page
					.getByRole('dialog', { name: /^Map editor/ })
					.getByText(/^\d+%$/)
					.textContent();
				return Number(text?.replace('%', '') ?? 0);
			})
			.toBeGreaterThan(100);
		// Multi-touch cancelled the armed fog gesture; it never produced a durable fog region.
		await expect(page.getByRole('button', { name: 'Fog', exact: true })).toHaveAttribute(
			'aria-pressed',
			'true',
		);
	});
});
