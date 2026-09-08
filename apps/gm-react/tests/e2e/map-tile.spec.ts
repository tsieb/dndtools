import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh } from './_helpers';

/**
 * MAP TILE — RC-CAN-4.5. The `map` widget on the board is the real map: the actor-filtered
 * `getMapViewForActor` drawn through the shared `MapCanvas`, pannable and zoomable, with the running
 * fight's tokens on it and the four DM actions that used to mean leaving the board.
 *
 * Everything durable is asserted against the COMMITTED core state rather than the pixels: the
 * overlay toggle and the map swap are `scene.configure-widget` writes, and projecting is
 * `session.set-active-map` + `session.project-active-map`.
 */

const TILE = '[data-testid="map-tile"]';

interface Fixture {
	widgetId: string;
	sceneId: string;
	mapA: string;
	mapB: string;
	nameA: string;
	nameB: string;
	combatants: string[];
}

async function createMap(
	page: Page,
	name: string,
	visibility: 'dm-only' | 'player-visible' = 'dm-only',
): Promise<string> {
	const res = await dispatch(page, {
		type: 'map.create',
		actorId: await page.evaluate(() => window.__rt!.defaultActorId),
		payload: {
			name,
			visibility,
			projection: { kind: 'flat', rotationDegrees: 0 },
			initialLayers: [{ name: 'Base', category: 'base', visibility }],
		},
	});
	expect(res.status, JSON.stringify(res.rejection ?? {})).toBe('accepted');
	const created = (res.events ?? []).find(
		(e) => (e as { kind?: string }).kind === 'map.created',
	) as { mapId?: string } | undefined;
	expect(created?.mapId, 'map.create emits map.created').toBeTruthy();
	return created!.mapId as string;
}

/** Two maps, a live session, a map tile bound to the first, and a two-creature fight standing on it. */
async function boardWithMapTile(page: Page): Promise<Fixture> {
	const stamp = Date.now();
	const nameA = `Sunken Vault ${stamp}`;
	const nameB = `Cliff Road ${stamp}`;
	const mapA = await createMap(page, nameA);
	const mapB = await createMap(page, nameB);

	// `/board` draws the HOME scene. On a cold worker `__rt.loaded` flips before the seed has finished
	// minting it, and the old `?? activeSceneId` fallback quietly put the tile on a scene the board
	// never shows — so wait for the real id rather than guessing one.
	await page.waitForFunction(() => !!window.__rt?.state.commandCenter.homeSceneId, null, {
		timeout: 20_000,
	});

	const placed = await page.evaluate(async (mapId) => {
		const rt = window.__rt!;
		const sceneId = rt.state.commandCenter.homeSceneId!;
		const live = await rt.dispatch({
			type: 'session.set-workflow',
			actorId: rt.defaultActorId,
			payload: { workflow: 'active', activeSceneId: sceneId },
		});
		if (live.status !== 'accepted') return { step: 'go live', sceneId, widgetId: '', ...live };
		const added = await rt.dispatch({
			type: 'scene.add-widget',
			actorId: rt.defaultActorId,
			payload: {
				sceneId,
				widget: {
					type: 'map',
					version: '1.0.0',
					layout: { x: 0, y: 0, w: 420, h: 320 },
					configuration: {},
					localState: {},
					binding: {
						source: { entityType: 'map', entityId: mapId },
						mode: 'read',
						requiredCapability: 'viewer',
					},
				},
			},
		});
		const event = (added.events ?? []).find(
			(e) => (e as { kind?: string }).kind === 'scene.widget-added',
		) as { widgetInstanceId?: string } | undefined;
		return { step: 'place map tile', sceneId, widgetId: event?.widgetInstanceId ?? '', ...added };
	}, mapA);
	expect(placed.status, `${placed.step}: ${JSON.stringify(placed.rejection ?? {})}`).toBe(
		'accepted',
	);
	expect(placed.widgetId, 'scene.add-widget emits the new instance id').toBeTruthy();

	const started = await dispatch(page, {
		type: 'combat.start',
		actorId: await page.evaluate(() => window.__rt!.defaultActorId),
		payload: {
			combatants: [
				{ kind: 'monster', name: 'Bog Lurker', ac: 13, initiative: 18, maxHp: 22 },
				{ kind: 'monster', name: 'Reed Stalker', ac: 12, initiative: 9, maxHp: 14 },
			],
		},
	});
	expect(started.status, JSON.stringify(started.rejection ?? {})).toBe('accepted');

	const combatants = await page.evaluate(
		() => (window.__rt!.state.session as { combat: { order: string[] } }).combat.order,
	);
	const spots = [
		{ x: 0.35, y: 0.35 },
		{ x: 0.65, y: 0.6 },
	];
	for (const [index, combatantId] of combatants.entries()) {
		const token = await dispatch(page, {
			type: 'combat.place-token',
			actorId: await page.evaluate(() => window.__rt!.defaultActorId),
			payload: { combatantId, mapId: mapA, ...spots[index]! },
		});
		expect(token.status, JSON.stringify(token.rejection ?? {})).toBe('accepted');
	}

	return {
		widgetId: placed.widgetId,
		sceneId: placed.sceneId,
		mapA,
		mapB,
		nameA,
		nameB,
		combatants,
	};
}

/** The tile's committed configuration and binding, straight out of the scene. */
function tileState(
	page: Page,
	sceneId: string,
	widgetId: string,
): Promise<{ configuration: Record<string, unknown>; boundMapId: string | null } | null> {
	return page.evaluate(
		({ scene, widget }) => {
			const found = (
				window.__rt!.state.scenes.scenes[scene] as unknown as {
					widgets: Array<{
						id: string;
						configuration: Record<string, unknown>;
						binding: { source: { entityId: string } } | null;
					}>;
				}
			)?.widgets.find((w) => w.id === widget);
			if (!found) return null;
			return {
				configuration: found.configuration,
				boundMapId: found.binding?.source.entityId ?? null,
			};
		},
		{ scene: sceneId, widget: widgetId },
	);
}

/** The `transform` the canvas's zoom/pan layer is currently drawing with. */
function canvasTransform(page: Page): Promise<string> {
	return page.evaluate(
		(sel) =>
			(document.querySelector(`${sel} [data-testid="map-canvas-well"] > div`) as HTMLElement)?.style
				.transform ?? '',
		TILE,
	);
}

let fixture: Fixture;

test.beforeEach(async ({ page }) => {
	await markOnboarded(page);
	await gotoRoute(page, '/board');
	await seedFresh(page);
	fixture = await boardWithMapTile(page);
	// Deliberately NO second navigation: the board re-renders from the runtime on every dispatch, and
	// reloading here raced the vault's persistence flush (the scene write lost, the session write not).
});

test('draws the bound map with the running fight standing on it', async ({ page }) => {
	const tile = page.locator(TILE);
	await expect(tile).toBeVisible();
	await expect(tile.getByTestId('map-tile-summary')).toContainText(fixture.nameA);

	// The overlay is the core's `MapView.combatTokens` — one disc per combatant this actor may see,
	// named in the group's own label so the fight is legible without sight.
	const overlay = tile.getByRole('group', { name: /Combat tokens/ });
	await expect(overlay).toBeVisible();
	const label = await overlay.getAttribute('aria-label');
	expect(label).toContain('Bog Lurker');
	expect(label).toContain('Reed Stalker');
	await expect(overlay.locator('> div')).toHaveCount(2);
});

test('pans and zooms from the keyboard as well as the pointer', async ({ page }) => {
	const tile = page.locator(TILE);
	expect(await canvasTransform(page)).toContain('scale(1)');

	await tile.getByRole('button', { name: 'Zoom in' }).click();
	await expect.poll(() => canvasTransform(page)).toContain('scale(1.25)');

	// Arrow keys are the keyboard equivalent of the drag; the board's own arrow bindings must not
	// swallow them while the map region has focus.
	const region = tile.getByRole('group', { name: new RegExp(`Map view — ${fixture.nameA}`) });
	await region.focus();
	const before = await canvasTransform(page);
	await page.keyboard.press('ArrowRight');
	await expect.poll(() => canvasTransform(page)).not.toBe(before);

	// `0` refits: back to the starting frame.
	await page.keyboard.press('0');
	await expect.poll(() => canvasTransform(page)).toBe('scale(1) translate(0%, 0%)');
});

test('hiding the combat overlay is a durable configuration change, not a local one', async ({
	page,
}) => {
	const tile = page.locator(TILE);
	await expect(tile.getByRole('group', { name: /Combat tokens/ })).toBeVisible();

	await tile.getByRole('button', { name: 'Hide combat overlay' }).click();

	await expect
		.poll(async () => (await tileState(page, fixture.sceneId, fixture.widgetId))?.configuration)
		.toMatchObject({ combatOverlay: false });
	await expect(tile.getByRole('group', { name: /Combat tokens/ })).toHaveCount(0);
	await expect(tile.getByRole('button', { name: 'Show combat overlay' })).toBeVisible();
});

test('changing the map rebinds the tile and redraws it', async ({ page }) => {
	const tile = page.locator(TILE);
	await tile.getByLabel('Change map').selectOption({ label: fixture.nameB });

	await expect
		.poll(async () => (await tileState(page, fixture.sceneId, fixture.widgetId))?.boundMapId)
		.toBe(fixture.mapB);
	await expect(tile.getByTestId('map-tile-summary')).toContainText(fixture.nameB);
	// The fight is standing on the OTHER map, so it is honestly absent here.
	await expect(tile.getByRole('group', { name: /Combat tokens/ })).toHaveCount(0);
});

test('projects the tile’s map to the table', async ({ page }) => {
	await page.locator(TILE).getByRole('button', { name: 'Project to players' }).click();

	await expect
		.poll(() =>
			page.evaluate(() => {
				const session = window.__rt!.state.session as unknown as {
					activeMap: { mapId: string } | null;
					activeMapProjections: Record<string, { mapId: string }>;
				};
				return {
					active: session.activeMap?.mapId ?? null,
					projected: Object.values(session.activeMapProjections).map((p) => p.mapId),
				};
			}),
		)
		.toEqual({ active: fixture.mapA, projected: expect.arrayContaining([fixture.mapA]) });
});

test('draws the map’s fog, so a projection of the tile can only ever show what the view carries', async ({
	page,
}) => {
	const actorId = await page.evaluate(() => window.__rt!.defaultActorId);

	// A map a player may see at all, with a concealed patch on a player-visible layer.
	const shared = await createMap(page, `Tidal Steps ${Date.now()}`, 'player-visible');
	const layerId = await page.evaluate(
		(mid) =>
			(
				window.__rt!.state.maps as unknown as {
					maps: Record<string, { layers: Array<{ id: string }> }>;
				}
			).maps[mid]!.layers[0]!.id,
		shared,
	);
	const fog = await dispatch(page, {
		type: 'map.append-fog',
		actorId,
		payload: {
			mapId: shared,
			layerId,
			kind: 'conceal',
			region: { x: 0.1, y: 0.1, w: 0.4, h: 0.4 },
			visibility: 'player-visible',
		},
	});
	expect(fog.status, JSON.stringify(fog.rejection ?? {})).toBe('accepted');

	await page.locator(TILE).getByLabel('Change map').selectOption(shared);

	// The tile composes the fog the ACTOR-FILTERED view carries, at this actor's opacity. `/board` is
	// the DM's own control board and refuses to draw for a player at all, so the player half of this —
	// the same fog painted at the concealing opacity — is asserted against the tile itself in
	// `src/app/widgets/builtin/map-tile.test.tsx`.
	await expect(page.locator(`${TILE} rect[mask]`)).toHaveAttribute(
		'opacity',
		'var(--map-fog-opacity-dm)',
	);
});
