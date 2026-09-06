import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh } from './_helpers';

/**
 * RC-MAP-3.4 — the room graph and the stocking editor (`app/map/dock/GraphPanel.tsx` over the core's
 * `deriveRoomGraph`).
 *
 * The map is seeded with the shape the dungeon generators emit — two rooms joined by a corridor
 * polygon, plus a third room nothing connects to — through durable commands, so the panel is reading a
 * real map rather than a fixture. The assertions are on the DERIVED reading (what the graph says about
 * connectivity) and on DURABLE state (the stocking a GM sets survives as a feature prop), never on a
 * fragment of markup.
 *
 * Runs on both profiles: the dock is a bottom sheet on the compact one, so a panel that is reachable
 * on desktop and stranded on a phone fails here.
 */

const DM = 'dm-1';

function isPhone(testInfo: TestInfo): boolean {
	return testInfo.project.name === 'mobile-chromium';
}

async function openAtlas(page: Page): Promise<void> {
	await markOnboarded(page);
	await gotoRoute(page, '/atlas');
	await seedFresh(page);
}

/** Create a map with one base layer; return the map and layer ids. */
async function createMap(page: Page, name: string): Promise<{ mapId: string; layerId: string }> {
	const res = await dispatch(page, {
		type: 'map.create',
		actorId: DM,
		payload: {
			name,
			visibility: 'dm-only',
			projection: { kind: 'flat', rotationDegrees: 0 },
			initialLayers: [{ name: 'Floor', category: 'base', visibility: 'dm-only' }],
		},
	});
	expect(res.status).toBe('accepted');
	const mapId = (
		(res.events ?? []).find((e) => (e as { kind?: string }).kind === 'map.created') as
			| { mapId?: string }
			| undefined
	)?.mapId as string;
	expect(mapId).toBeTruthy();
	const layerId = await page.evaluate((mid) => {
		const m = window.__rt?.state?.maps?.maps?.[mid] as
			| { layers: Array<{ id: string }> }
			| undefined;
		return m?.layers[0]?.id ?? '';
	}, mapId);
	expect(layerId).toBeTruthy();
	return { mapId, layerId };
}

function newId(page: Page): Promise<string> {
	return page.evaluate(() => window.__rt!.newId());
}

/** Two rooms joined by a corridor, plus a room with no way in. Ids come from the runtime (PLAT-006). */
async function seedDungeon(page: Page, mapId: string, layerId: string): Promise<void> {
	const [roomA, roomB, roomC, hall] = await Promise.all([
		newId(page),
		newId(page),
		newId(page),
		newId(page),
	]);
	const res = await dispatch(page, {
		type: 'map.add-features',
		actorId: DM,
		payload: {
			mapId,
			layerId,
			features: [
				{
					id: roomA,
					kind: 'room',
					points: [
						{ x: 0.1, y: 0.1 },
						{ x: 0.2, y: 0.2 },
					],
					style: 'dungeon:room',
					props: { role: 'entrance', name: 'Gatehouse' },
				},
				{
					id: roomB,
					kind: 'room',
					points: [
						{ x: 0.5, y: 0.1 },
						{ x: 0.6, y: 0.2 },
					],
					style: 'dungeon:room',
					props: { name: 'Shrine' },
				},
				{
					id: roomC,
					kind: 'room',
					points: [
						{ x: 0.8, y: 0.8 },
						{ x: 0.85, y: 0.85 },
					],
					style: 'dungeon:room',
					props: { name: 'Sealed vault' },
				},
				{
					id: hall,
					kind: 'polygon',
					points: [
						{ x: 0.15, y: 0.14 },
						{ x: 0.55, y: 0.14 },
						{ x: 0.55, y: 0.16 },
						{ x: 0.15, y: 0.16 },
					],
					style: 'dungeon:corridor',
				},
			],
		},
	});
	expect(res.status).toBe('accepted');
}

/** Every feature's id and stocking prop, straight off the durable map. */
function stockings(
	page: Page,
	mapId: string,
): Promise<Array<{ name?: string; stocking?: string }>> {
	return page.evaluate((mid) => {
		const m = window.__rt?.state?.maps?.maps?.[mid] as
			| { layers: Array<{ content: Array<{ props?: { name?: string; stocking?: string } }> }> }
			| undefined;
		return (m?.layers ?? [])
			.flatMap((l) => l.content)
			.map((f) => ({ name: f.props?.name, stocking: f.props?.stocking }));
	}, mapId);
}

async function openEditor(page: Page, mapName: string): Promise<void> {
	await page.getByRole('button', { name: mapName, exact: true }).click();
	const openBtn = page.getByRole('button', { name: 'Open in map editor' });
	await expect(openBtn).toBeEnabled();
	await openBtn.click();
	await expect(page.getByRole('dialog', { name: `Map editor — ${mapName}` })).toBeVisible();
}

/** On the compact profile the dock lives behind a bottom sheet; open it. No-op on desktop. */
async function revealDock(page: Page, testInfo: TestInfo): Promise<void> {
	if (!isPhone(testInfo)) return;
	const sheet = page.getByRole('dialog', { name: 'Map panels' });
	if (await sheet.isVisible().catch(() => false)) return;
	await page.getByRole('button', { name: 'Panels' }).click();
	await expect(sheet).toBeVisible();
}

async function openGraphPanel(page: Page, testInfo: TestInfo): Promise<void> {
	await revealDock(page, testInfo);
	await page.getByRole('tab', { name: 'Graph' }).click();
	await expect(page.getByRole('list', { name: 'Rooms and corridors' })).toBeVisible();
}

test.describe('map room graph', () => {
	test('derives the rooms, corridors and links, and names the wing with no way in', async ({
		page,
	}, testInfo) => {
		await openAtlas(page);
		const name = `Graph Keep ${Date.now()}`;
		const { mapId, layerId } = await createMap(page, name);
		await seedDungeon(page, mapId, layerId);
		await openEditor(page, name);
		await openGraphPanel(page, testInfo);

		await expect(page.getByText('3 rooms · 1 corridor · 0 keyed')).toBeVisible();
		await expect(page.getByText('1 room has no way in')).toBeVisible();

		// The two rooms the corridor joins each have one link; the sealed vault has none.
		await expect(page.getByRole('button', { name: /1\. Gatehouse/ })).toBeVisible();
		await expect(page.getByRole('button', { name: /2\. Shrine.*1 link/ })).toBeVisible();
		await expect(page.getByRole('button', { name: /3\. Sealed vault.*0 links/ })).toBeVisible();
		await expect(page.getByRole('button', { name: /Sealed vault.*no way in/ })).toBeVisible();
	});

	test('selecting a node selects the room, by pointer and by keyboard', async ({
		page,
	}, testInfo) => {
		await openAtlas(page);
		const name = `Graph Select ${Date.now()}`;
		const { mapId, layerId } = await createMap(page, name);
		await seedDungeon(page, mapId, layerId);
		await openEditor(page, name);
		await openGraphPanel(page, testInfo);

		const shrine = page.getByRole('button', { name: /2\. Shrine/ });
		await shrine.click();
		await expect(shrine).toHaveAttribute('aria-pressed', 'true');
		// The editor's own readout — the status bar counts the selection the panel just made.
		await expect(page.getByText('1 selected')).toBeVisible();

		// The same operation from the keyboard: focus the row and press Enter.
		const vault = page.getByRole('button', { name: /3\. Sealed vault/ });
		await vault.focus();
		await page.keyboard.press('Enter');
		await expect(vault).toHaveAttribute('aria-pressed', 'true');
		await expect(shrine).toHaveAttribute('aria-pressed', 'false');
	});

	test('keying a room writes a durable stocking that survives on the feature', async ({
		page,
	}, testInfo) => {
		await openAtlas(page);
		const name = `Graph Stock ${Date.now()}`;
		const { mapId, layerId } = await createMap(page, name);
		await seedDungeon(page, mapId, layerId);
		await openEditor(page, name);
		await openGraphPanel(page, testInfo);

		await page.getByLabel('What is in Gatehouse').selectOption('monster');
		await expect(page.getByText('3 rooms · 1 corridor · 1 keyed')).toBeVisible();
		await expect
			.poll(
				async () => (await stockings(page, mapId)).find((f) => f.name === 'Gatehouse')?.stocking,
			)
			.toBe('monster');

		await page.getByLabel('What is in Shrine').selectOption('treasure');
		await expect(page.getByText('3 rooms · 1 corridor · 2 keyed')).toBeVisible();

		// Clearing removes the key rather than leaving a stale one behind.
		await page.getByLabel('What is in Gatehouse').selectOption('');
		await expect(page.getByText('3 rooms · 1 corridor · 1 keyed')).toBeVisible();
		await expect
			.poll(
				async () => (await stockings(page, mapId)).find((f) => f.name === 'Gatehouse')?.stocking,
			)
			.toBeUndefined();
	});

	test('the open graph panel passes the axe critical/serious gate', async ({ page }, testInfo) => {
		await openAtlas(page);
		const name = `Graph A11y ${Date.now()}`;
		const { mapId, layerId } = await createMap(page, name);
		await seedDungeon(page, mapId, layerId);
		await openEditor(page, name);
		await openGraphPanel(page, testInfo);

		const results = await new AxeBuilder({ page })
			.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
			.analyze();
		const blocking = results.violations
			.filter((v) => v.impact === 'critical' || v.impact === 'serious')
			.map(
				(v) =>
					`[${v.impact}] ${v.id}\n` +
					v.nodes.map((n) => `    ${n.target.join(' ')}\n    ${n.failureSummary}`).join('\n'),
			);
		expect(blocking, `Graph panel axe violations:\n${blocking.join('\n')}`).toEqual([]);
	});

	test('a map with no rooms says so instead of showing an empty graph', async ({
		page,
	}, testInfo) => {
		await openAtlas(page);
		const name = `Graph Empty ${Date.now()}`;
		await createMap(page, name);
		await openEditor(page, name);
		await revealDock(page, testInfo);
		await page.getByRole('tab', { name: 'Graph' }).click();
		await expect(page.getByText('No rooms yet.', { exact: false })).toBeVisible();
	});
});
