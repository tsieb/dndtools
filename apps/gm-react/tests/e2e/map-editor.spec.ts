import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh } from './_helpers';

/**
 * MAP-021 — the rebuilt full-screen map editor (`src/app/map/*`, mounted from `screens/Atlas.tsx`).
 *
 * These specs drive the REAL editor against the live Processing Core through the DEV `window.__rt`
 * seam (the same seeding/waiting idiom as canvas.spec.ts): every map, layer, and POI is created with a
 * durable core command, and every assertion reads the actor-filtered core state back (never a brittle
 * test-id). Because a mobile overflow shifts the whole layout and moves the dock behind a bottom
 * sheet, the file runs on BOTH the desktop-chromium and mobile-chromium projects (repo rule); the
 * `revealDock` helper opens the sheet on the compact profile so the dock panels are reachable there.
 *
 * The editor is DM-only for authoring and player-safe for reads: the no-leak spec seeds a dm-only POI
 * and a dm-only layer, switches to a previewed player, and asserts neither name survives into the DOM
 * or the accessibility tree — a leak there is a release blocker.
 */

const DM = 'dm-1'; // DEFAULT_DM_ACTOR_ID

// ── helpers ──────────────────────────────────────────────────────────────────────────────────────

function isPhone(testInfo: TestInfo): boolean {
	return testInfo.project.name === 'mobile-chromium';
}

/** Fresh, onboarded /atlas with an empty vault (the demo seed creates no maps). */
async function openAtlas(page: Page): Promise<void> {
	await markOnboarded(page);
	await gotoRoute(page, '/atlas');
	await seedFresh(page);
}

interface CreateMapOpts {
	name: string;
	visibility?: 'dm-only' | 'player-visible' | 'shared';
	layers?: Array<{ name: string; category?: string; visibility?: string }>;
}

/** Create a map (with its initial layers) through the durable `map.create` command; return its id. */
async function createMap(page: Page, opts: CreateMapOpts): Promise<string> {
	const vis = opts.visibility ?? 'dm-only';
	const layers = opts.layers ?? [{ name: 'Base', category: 'base', visibility: vis }];
	const res = await dispatch(page, {
		type: 'map.create',
		actorId: DM,
		payload: {
			name: opts.name,
			visibility: vis,
			projection: { kind: 'flat', rotationDegrees: 0 },
			initialLayers: layers,
		},
	});
	expect(res.status).toBe('accepted');
	const created = (res.events ?? []).find(
		(e) => (e as { kind?: string }).kind === 'map.created',
	) as { mapId?: string } | undefined;
	const mapId = created?.mapId;
	expect(mapId, 'map.create emitted a map.created event with a mapId').toBeTruthy();
	return mapId as string;
}

interface MapSnapshot {
	layerCount: number;
	layerNames: string[];
	layers: Array<{ id: string; name: string; visibility: string; locked: boolean; order: number }>;
	featureCount: number;
	poiCount: number;
	routeCount: number;
	pois: Array<{ id: string; label: string; x: number; y: number; visibility: string }>;
	routes: Array<{ id: string; label: string; waypointCount: number }>;
}

/** Read the actor-filtered raw map entity back through the runtime (DM sees the full record). */
function readMap(page: Page, mapId: string): Promise<MapSnapshot | null> {
	return page.evaluate((mid) => {
		const m = window.__rt?.state?.maps?.maps?.[mid] as
			| {
					layers: Array<{
						id: string;
						name: string;
						visibility: string;
						locked: boolean;
						order: number;
						content: unknown[];
					}>;
					pois: Array<{
						id: string;
						label: string;
						position: { x: number; y: number };
						visibility: string;
					}>;
					routes: Array<{ id: string; label: string; waypoints: unknown[] }>;
			  }
			| undefined;
		if (!m) return null;
		return {
			layerCount: m.layers.length,
			layerNames: m.layers.map((l) => l.name),
			layers: m.layers.map((l) => ({
				id: l.id,
				name: l.name,
				visibility: l.visibility,
				locked: l.locked,
				order: l.order,
			})),
			featureCount: m.layers.reduce((n, l) => n + l.content.length, 0),
			poiCount: m.pois.length,
			routeCount: (m.routes ?? []).length,
			routes: (m.routes ?? []).map((r) => ({
				id: r.id,
				label: r.label,
				waypointCount: (r.waypoints ?? []).length,
			})),
			pois: m.pois.map((p) => ({
				id: p.id,
				label: p.label,
				x: p.position.x,
				y: p.position.y,
				visibility: p.visibility,
			})),
		};
	}, mapId);
}

/**
 * Select a map by name in the Atlas switcher, then open it in the full-screen editor. The vault is
 * seeded with several demo maps (`createDemoMapState`), so the map MUST be selected by its unique name
 * first — the default selection is the first demo map, not the one this spec just created.
 */
async function openEditor(page: Page, mapName: string): Promise<void> {
	await page.getByRole('button', { name: mapName, exact: true }).click();
	const openBtn = page.getByRole('button', { name: 'Open in map editor' });
	await expect(openBtn).toBeEnabled();
	await openBtn.click();
	await expect(page.getByRole('dialog', { name: `Map editor — ${mapName}` })).toBeVisible();
	// The interactive canvas well is the DM's authoring surface (role=application).
	await expect(page.getByRole('application')).toBeVisible();
}

/** The editor shell root (a focusable aria-modal dialog) — focus it before firing global shortcuts. */
function editorRoot(page: Page) {
	return page.getByRole('dialog', { name: /^Map editor/ });
}

async function focusEditor(page: Page): Promise<void> {
	await editorRoot(page).focus();
}

/** On the compact profile the dock lives behind a bottom sheet; open it. No-op on desktop. */
async function revealDock(page: Page, testInfo: TestInfo): Promise<void> {
	if (!isPhone(testInfo)) return;
	const sheet = page.getByRole('dialog', { name: 'Map panels' });
	if (await sheet.isVisible().catch(() => false)) return;
	await page.getByRole('button', { name: 'Panels' }).click();
	await expect(sheet).toBeVisible();
}

/** Assert the active tool via the always-present, context-sensitive tool-options bar. */
async function expectActiveTool(page: Page, label: string): Promise<void> {
	await expect(page.getByRole('group', { name: `${label} options` })).toBeVisible();
}

/**
 * Fire a keyboard undo/redo. The editor runs one command at a time (a `busyRef` guard): a mutation's
 * in-memory state lands before its durable-persistence promise resolves and clears that guard, so a
 * poll can observe the change while the editor is still "busy" and the very next undo/redo keypress
 * would be dropped. Focus the shell and let persistence settle first so the keystroke always lands.
 */
async function undoRedo(page: Page, combo: string): Promise<void> {
	await focusEditor(page);
	await page.waitForTimeout(300);
	await page.keyboard.press(combo);
}

// ── 1 · opens ─────────────────────────────────────────────────────────────────────────────────────

test.describe('map editor', () => {
	test('opens from /atlas with one h1, a tool rail, and a role=application canvas well', async ({
		page,
	}) => {
		await openAtlas(page);
		const name = `Atlas Keep ${Date.now()}`;
		await createMap(page, { name });
		await openEditor(page, name);

		// Exactly one <h1> inside the editor overlay (the breadcrumb map title). The AppShell keeps the
		// underlying /atlas route <h1> mounted beneath the overlay, so scope the count to the dialog.
		await expect(editorRoot(page).locator('h1')).toHaveCount(1);
		// The Foundry-style tool rail.
		await expect(page.getByRole('toolbar', { name: 'Map tools' })).toBeVisible();
		// The canvas well exposes the WCAG application role.
		await expect(page.getByRole('application')).toBeVisible();
	});

	// ── 2 · tool selection ──────────────────────────────────────────────────────────────────────────

	test('tool groups reveal sub-tools; clicks and single-key shortcuts switch the active tool', async ({
		page,
	}) => {
		await openAtlas(page);
		const name = `Toolbox Map ${Date.now()}`;
		await createMap(page, { name });
		await openEditor(page, name);
		await focusEditor(page);

		// Clicking a multi-tool group reveals its sub-tool flyout.
		await page.getByRole('button', { name: 'Structure', exact: true }).click();
		await expect(page.getByRole('group', { name: 'Structure tools' })).toBeVisible();

		// Clicking a single-tool group activates that tool directly (indicator updates).
		await page.getByRole('button', { name: 'Lighting', exact: true }).click();
		await expectActiveTool(page, 'Light');

		// Single-key shortcuts switch tools (industry keymap).
		await focusEditor(page);
		await page.keyboard.press('b');
		await expectActiveTool(page, 'Terrain brush');
		await page.keyboard.press('v');
		await expectActiveTool(page, 'Select & move');
		await page.keyboard.press('r');
		await expectActiveTool(page, 'Room');
		await page.keyboard.press('f');
		await expectActiveTool(page, 'Fog');
		await page.keyboard.press('n');
		await expectActiveTool(page, 'Point of interest');
		await page.keyboard.press('q');
		await expectActiveTool(page, 'Generate');

		// Shortcuts are ignored while a text field is focused (typing a value never fires a tool).
		await page.keyboard.press('b');
		await expectActiveTool(page, 'Terrain brush');
		await page.getByLabel('Size value').focus();
		await page.keyboard.press('r'); // would be Room — must be swallowed inside the input
		await expectActiveTool(page, 'Terrain brush');
	});

	// ── 3 · generation round-trip (headline) ────────────────────────────────────────────────────────

	test('generate → preview → accept adds layers + a History entry; undo removes; redo restores', async ({
		page,
	}, testInfo) => {
		await openAtlas(page);
		const name = `Generated Depths ${Date.now()}`;
		const mapId = await createMap(page, { name });
		await openEditor(page, name);

		const before = await readMap(page, mapId);
		expect(before).not.toBeNull();
		const baseLayers = before!.layerCount;

		// Enter the Generate tool and open the dock (sheet on mobile).
		await focusEditor(page);
		await page.keyboard.press('q');
		await revealDock(page, testInfo);

		// Pick a dungeon generator (the flagship organic dungeon) and a preset.
		await page.getByRole('button', { name: 'Dungeon — Organic' }).click();
		await page.getByRole('button', { name: 'Cramped crypt' }).click();

		// The ghost preview reports a positive feature count on the canvas.
		const previewLine = page.getByText(/Ghost preview on the canvas · \d+ features/);
		await expect(previewLine).toBeVisible();
		const previewText = (await previewLine.textContent()) ?? '';
		const previewCount = Number(previewText.match(/· (\d+) features/)?.[1] ?? '0');
		expect(previewCount).toBeGreaterThan(0);

		// Accept → the generation commits editable layers.
		await page.getByRole('button', { name: 'Accept' }).click();
		await expect(page.getByText(/^Added/)).toBeVisible();
		await expect
			.poll(async () => (await readMap(page, mapId))!.layerCount)
			.toBeGreaterThan(baseLayers);
		const afterAccept = (await readMap(page, mapId))!.layerCount;

		// Leave the Generate tool so the four-tab dock returns, and open the History panel.
		await page.getByRole('button', { name: 'Done' }).click();
		await revealDock(page, testInfo);
		await page.getByRole('tab', { name: 'History' }).click();
		await expect(page.getByText(/Generated/i).first()).toBeVisible();

		// Undo removes the generated layers…
		await undoRedo(page, 'Control+z');
		await expect.poll(async () => (await readMap(page, mapId))!.layerCount).toBe(baseLayers);

		// …and Redo restores them.
		await undoRedo(page, 'Control+Shift+z');
		await expect.poll(async () => (await readMap(page, mapId))!.layerCount).toBe(afterAccept);
	});

	// ── 4 · incremental editing (draw room, place + nudge POI) ───────────────────────────────────────

	test('drawing a room adds a feature (undoable); a placed POI nudges by arrow keys (WCAG 2.5.7)', async ({
		page,
	}) => {
		await openAtlas(page);
		const name = `Sketch Map ${Date.now()}`;
		const mapId = await createMap(page, { name });
		await openEditor(page, name);
		await focusEditor(page);

		const canvas = page.getByRole('application');
		const box = await canvas.boundingBox();
		expect(box).not.toBeNull();
		const b = box!;

		// Draw a Room by dragging a rectangle across the canvas.
		await page.keyboard.press('r');
		await expectActiveTool(page, 'Room');
		const feats0 = (await readMap(page, mapId))!.featureCount;
		await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * 0.3);
		await page.mouse.down();
		await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.5, { steps: 6 });
		await page.mouse.move(b.x + b.width * 0.7, b.y + b.height * 0.68, { steps: 6 });
		await page.mouse.up();
		await expect.poll(async () => (await readMap(page, mapId))!.featureCount).toBe(feats0 + 1);

		// Undo removes the room.
		await undoRedo(page, 'Control+z');
		await expect.poll(async () => (await readMap(page, mapId))!.featureCount).toBe(feats0);

		// Place a POI with a single click of the POI tool.
		await focusEditor(page);
		await page.keyboard.press('n');
		await expectActiveTool(page, 'Point of interest');
		const pois0 = (await readMap(page, mapId))!.poiCount;
		await page.mouse.click(b.x + b.width * 0.5, b.y + b.height * 0.45);
		await expect.poll(async () => (await readMap(page, mapId))!.poiCount).toBe(pois0 + 1);
		const placed = (await readMap(page, mapId))!.pois.at(-1)!;
		expect(placed.label).toBe('New POI');

		// Move it with the arrow keys — the keyboard alternative to dragging the marker.
		await focusEditor(page);
		await page.keyboard.press('ArrowRight');
		await expect
			.poll(async () => (await readMap(page, mapId))!.pois.find((p) => p.id === placed.id)?.x)
			.not.toBe(placed.x);

		// Undo the nudge.
		await undoRedo(page, 'Control+z');
		await expect
			.poll(async () => (await readMap(page, mapId))!.pois.find((p) => p.id === placed.id)?.x)
			.toBe(placed.x);
	});

	// The Route tool was declared in the rail, showed its "Click to add points · Enter finishes"
	// hint, and had a fully-implemented `map.create-route` finish path — but 'route' was missing from
	// the canvas's DRAWING_TOOLS set, so the interaction overlay that owns the click-to-add-vertex
	// gesture never mounted and every click fell through to panning. The whole tool was inert.
	test('the Route tool draws a multi-waypoint route (O, click, click, Enter)', async ({ page }) => {
		await openAtlas(page);
		const name = `Route Map ${Date.now()}`;
		const mapId = await createMap(page, { name });
		await openEditor(page, name);
		await focusEditor(page);

		const canvas = page.getByRole('application');
		const box = await canvas.boundingBox();
		expect(box).not.toBeNull();
		const b = box!;

		await page.keyboard.press('o');
		await expectActiveTool(page, 'Route');
		expect((await readMap(page, mapId))!.routeCount).toBe(0);

		// Click a few waypoints, then finish the path with Enter.
		await page.mouse.click(b.x + b.width * 0.25, b.y + b.height * 0.3);
		await page.mouse.click(b.x + b.width * 0.5, b.y + b.height * 0.45);
		await page.mouse.click(b.x + b.width * 0.7, b.y + b.height * 0.6);
		await focusEditor(page);
		await page.keyboard.press('Enter');

		await expect.poll(async () => (await readMap(page, mapId))!.routeCount).toBe(1);
		const route = (await readMap(page, mapId))!.routes[0];
		expect(route.waypointCount).toBeGreaterThanOrEqual(2);

		// It is a normal undoable map command like every other drawing tool.
		await undoRedo(page, 'Control+z');
		await expect.poll(async () => (await readMap(page, mapId))!.routeCount).toBe(0);
	});

	// ── 5 · layers panel ─────────────────────────────────────────────────────────────────────────────

	test('layers panel renames, toggles visibility + lock, reorders (Alt+Arrow), and deletes', async ({
		page,
	}, testInfo) => {
		await openAtlas(page);
		const name = `Layered Map ${Date.now()}`;
		const mapId = await createMap(page, {
			name,
			layers: [
				{ name: 'Base', category: 'base', visibility: 'player-visible' },
				{ name: 'Detail', category: 'dm-annotations', visibility: 'dm-only' },
			],
		});
		await openEditor(page, name);
		await revealDock(page, testInfo);
		await page.getByRole('tab', { name: 'Layers' }).click();

		// Rename "Base" inline (double-click the name → edit → Enter).
		const baseRow = page.getByRole('listitem', { name: /^Base, type/ });
		await baseRow.getByRole('button', { name: 'Base', exact: true }).dblclick();
		await page.keyboard.press('Control+a');
		await page.keyboard.type('Ground Floor');
		await page.keyboard.press('Enter');
		await expect
			.poll(async () => (await readMap(page, mapId))!.layerNames)
			.toContain('Ground Floor');

		// Toggle "Detail" player-visibility.
		const detailRow = page.getByRole('listitem', { name: /^Detail, type/ });
		const visBefore = (await readMap(page, mapId))!.layers.find(
			(l) => l.name === 'Detail',
		)!.visibility;
		await detailRow.getByRole('button', { name: /^Visibility:/ }).click();
		await expect
			.poll(
				async () =>
					(await readMap(page, mapId))!.layers.find((l) => l.name === 'Detail')!.visibility,
			)
			.not.toBe(visBefore);

		// Toggle lock on, then off (both directions of the durable lock op).
		await detailRow.getByRole('button', { name: /^Lock Detail/ }).click();
		await expect
			.poll(
				async () => (await readMap(page, mapId))!.layers.find((l) => l.name === 'Detail')!.locked,
			)
			.toBe(true);
		await detailRow.getByRole('button', { name: /^Unlock Detail/ }).click();
		await expect
			.poll(
				async () => (await readMap(page, mapId))!.layers.find((l) => l.name === 'Detail')!.locked,
			)
			.toBe(false);

		// Reorder with the WCAG-2.5.7 keyboard fallback: focus the row, Alt+ArrowUp moves it up.
		const orderBefore = (await readMap(page, mapId))!.layers.find(
			(l) => l.name === 'Detail',
		)!.order;
		await detailRow.focus();
		await page.keyboard.press('Alt+ArrowUp');
		await expect
			.poll(
				async () => (await readMap(page, mapId))!.layers.find((l) => l.name === 'Detail')!.order,
			)
			.not.toBe(orderBefore);

		// Delete via the row action menu → confirm dialog.
		await detailRow.getByRole('button', { name: 'Detail actions' }).click();
		await page.getByRole('button', { name: 'Delete' }).click();
		const confirm = page.getByRole('dialog', { name: /Delete layer/ });
		await expect(confirm).toBeVisible();
		await confirm.getByRole('button', { name: 'Delete' }).click();
		await expect.poll(async () => (await readMap(page, mapId))!.layerNames).not.toContain('Detail');
	});

	// ── 6 · UVTT export ──────────────────────────────────────────────────────────────────────────────

	test('the Export menu triggers a .dd2vtt download with a valid UVTT payload', async ({
		page,
	}) => {
		await openAtlas(page);
		const name = `Export Map ${Date.now()}`;
		await createMap(page, { name });
		await openEditor(page, name);

		await page.getByRole('button', { name: 'Export', exact: true }).click();
		const [download] = await Promise.all([
			page.waitForEvent('download'),
			page.getByRole('button', { name: 'Export for other VTTs (.dd2vtt)' }).click(),
		]);
		expect(download.suggestedFilename()).toMatch(/\.dd2vtt$/);

		const path = await download.path();
		expect(path).toBeTruthy();
		const json = JSON.parse(await readFile(path as string, 'utf8'));
		// The dd2vtt (Universal VTT) format 0.3 contract.
		expect(json).toHaveProperty('format');
		expect(Array.isArray(json.line_of_sight)).toBe(true);
		expect(typeof json.resolution.pixels_per_grid).toBe('number');
	});

	// ── 7 · command palette ──────────────────────────────────────────────────────────────────────────

	test('⌘/Ctrl+K opens the palette; a generator entry opens Generate primed; tool rows show shortcuts', async ({
		page,
	}, testInfo) => {
		await openAtlas(page);
		const name = `Palette Map ${Date.now()}`;
		await createMap(page, { name });
		await openEditor(page, name);
		await focusEditor(page);

		await page.keyboard.press('Control+k');
		const palette = page.getByRole('dialog', { name: 'Command palette' });
		await expect(palette).toBeVisible();

		// A tool row surfaces its single-key shortcut (learn-the-keymap-passively).
		await palette.getByRole('combobox').fill('Terrain brush');
		const toolRow = palette.getByRole('option', { name: /Tool: Terrain brush/ });
		await expect(toolRow).toBeVisible();
		await expect(toolRow.locator('kbd', { hasText: 'B' })).toBeVisible();

		// Typing a generator name and selecting it opens Generate primed on that generator.
		await palette.getByRole('combobox').fill('Organic');
		await palette.getByRole('option', { name: /Generate: Dungeon — Organic/ }).click();
		await expect(palette).toBeHidden();
		await expectActiveTool(page, 'Generate');
		// The Generate panel lives in the dock (behind the bottom sheet on the compact profile).
		await revealDock(page, testInfo);
		await expect(page.getByRole('button', { name: 'Dungeon — Organic' })).toHaveAttribute(
			'aria-pressed',
			'true',
		);
	});

	// ── 8 · no-leak safety (release blocker) ─────────────────────────────────────────────────────────

	test('a previewed player never sees a dm-only POI or a dm-only layer in the editor', async ({
		page,
	}, testInfo) => {
		const stamp = Date.now();
		const secretLayer = `ZZ-SECRET-DM-LAYER-${stamp}`;
		const secretPoi = `ZZ-SECRET-DM-POI-${stamp}`;

		await openAtlas(page);
		// A player-visible map with a player-visible base layer…
		const name = `Shared Vale ${stamp}`;
		const mapId = await createMap(page, {
			name,
			visibility: 'player-visible',
			layers: [{ name: 'Base', category: 'base', visibility: 'player-visible' }],
		});
		const baseLayerId = (await readMap(page, mapId))!.layers[0]!.id;
		// …plus a dm-only layer and a dm-only POI that must never reach a player.
		expect(
			(
				await dispatch(page, {
					type: 'map.create-layer',
					actorId: DM,
					payload: {
						mapId,
						id: `secret-layer-${stamp}`,
						name: secretLayer,
						category: 'dm-annotations',
						visibility: 'dm-only',
					},
				})
			).status,
		).toBe('accepted');
		expect(
			(
				await dispatch(page, {
					type: 'map.create-poi',
					actorId: DM,
					payload: {
						mapId,
						id: `secret-poi-${stamp}`,
						layerId: baseLayerId,
						label: secretPoi,
						category: 'other',
						position: { x: 0.5, y: 0.5 },
						visibility: 'dm-only',
					},
				})
			).status,
		).toBe('accepted');

		await openEditor(page, name);
		await revealDock(page, testInfo);
		await page.getByRole('tab', { name: 'Layers' }).click();

		// DM-side positive control: the dm-only layer IS listed for the DM.
		await expect(page.getByText(secretLayer, { exact: true }).first()).toBeVisible();
		// The compact dock is a real modal sheet. Close it before checking the editor canvas so the
		// assertion follows the same topmost-modal accessibility ordering Android and TalkBack use.
		if (isPhone(testInfo)) {
			const sheet = page.getByRole('dialog', { name: 'Map panels' });
			await sheet.getByRole('button', { name: 'Close' }).click();
			await expect(sheet).toBeHidden();
		}

		// Switch to a previewed PLAYER actor (the "view as" seam the DM uses to check player safety).
		await page.evaluate(() => window.__rt!.enterPreview({ role: 'player' }));
		await page.waitForFunction(() => window.__rt?.preview?.role === 'player', null, {
			timeout: 5000,
		});

		// The map is still available to the player (canvas present, not the unavailable state).
		await expect(page.getByRole('application')).toBeVisible();

		// The dm-only names appear NOWHERE in the DOM or the accessibility tree of the editor.
		await expect(page.getByText(secretLayer)).toHaveCount(0);
		await expect(page.getByText(secretPoi)).toHaveCount(0);
		expect(await page.locator(`text=${secretLayer}`).count()).toBe(0);
		expect(await page.locator(`text=${secretPoi}`).count()).toBe(0);

		await page.evaluate(() => window.__rt!.exitPreview());
	});

	// ── 9 · keyboard (overlay, brush size, escape) ──────────────────────────────────────────────────

	test('? opens the shortcut overlay; [ and ] resize the brush; Esc deselects then exits the tool', async ({
		page,
	}) => {
		await openAtlas(page);
		const name = `Keys Map ${Date.now()}`;
		const mapId = await createMap(page, { name });
		await openEditor(page, name);
		await focusEditor(page);

		// ? opens the shortcut overlay; Esc closes it.
		await page.keyboard.press('Shift+Slash');
		const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
		await expect(help).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(help).toBeHidden();

		// [ / ] change the brush size and the options bar reflects the new value.
		await focusEditor(page);
		await page.keyboard.press('b');
		await expectActiveTool(page, 'Terrain brush');
		const size = page.getByLabel('Size value');
		const start = Number(await size.inputValue());
		await page.keyboard.press(']');
		await expect(size).toHaveValue(String(start + 4));
		await page.keyboard.press('[');
		await page.keyboard.press('[');
		await expect(size).toHaveValue(String(start - 4));

		// Esc with a selection deselects (rather than exiting); a second Esc drops back to the select tool.
		await focusEditor(page);
		await page.keyboard.press('n');
		const canvas = page.getByRole('application');
		const b = (await canvas.boundingBox())!;
		await page.mouse.click(b.x + b.width * 0.5, b.y + b.height * 0.5);
		await expect(page.getByText(/\d+ selected/)).toBeVisible();
		await expect.poll(async () => (await readMap(page, mapId))!.poiCount).toBeGreaterThan(0);
		await focusEditor(page);
		await page.keyboard.press('Escape');
		await expect(page.getByText(/\d+ selected/)).toHaveCount(0);
		await page.keyboard.press('Escape');
		await expectActiveTool(page, 'Select & move');
	});

	// ── a11y · the open editor overlay has no critical/serious axe violations ────────────────────────

	test('the open editor overlay passes the axe critical/serious gate', async ({ page }) => {
		await openAtlas(page);
		const name = `A11y Map ${Date.now()}`;
		await createMap(page, {
			name,
			layers: [
				{ name: 'Base', category: 'base', visibility: 'player-visible' },
				{ name: 'Notes', category: 'dm-annotations', visibility: 'dm-only' },
			],
		});
		await openEditor(page, name);

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
		expect(blocking, `Editor axe violations:\n${blocking.join('\n')}`).toEqual([]);
	});
});
