import { expect, test, type Page } from '@playwright/test';
import { enterPreview, gotoRoute, markOnboarded, seedFresh } from './_helpers';

// PLAYER VIEW — `/play`, the chrome-less player device. It renders OUTSIDE the DM AppShell, so there
// is no `#main-content` to wait on; gate on the DEV runtime seam plus a route-local signal instead.

/**
 * Give `/play` a projected stage. The stage only leaves its empty state when the VIEWER is a
 * participant with a player-view assignment, so this takes the session live, projects a scene to
 * every registered player, and returns the player actor to preview as.
 */
async function projectSceneToPlayers(page: Page): Promise<string> {
	const result = await page.evaluate(async () => {
		const rt = window.__rt!;
		const state = rt.state as unknown as {
			session: { activeSceneId: string | null };
			commandCenter: { homeSceneId: string | null };
			scenes: { scenes: Record<string, { id: string; isTemplate?: boolean }> };
			permissions: { actors: Record<string, { id: string; role: string }> };
		};
		const sceneId =
			state.session.activeSceneId ??
			state.commandCenter.homeSceneId ??
			Object.values(state.scenes.scenes).find((s) => !s.isTemplate)?.id;
		const playerActorIds = Object.values(state.permissions.actors)
			.filter((a) => a.role === 'player')
			.map((a) => a.id);
		const live = await rt.dispatch({
			type: 'session.set-workflow',
			actorId: rt.defaultActorId,
			payload: { workflow: 'active', activeSceneId: sceneId },
		});
		if (live.status !== 'accepted') return { step: 'go live', playerId: null, ...live };
		const projected = await rt.dispatch({
			type: 'session.project-player-view',
			actorId: rt.defaultActorId,
			payload: { playerActorIds, target: { kind: 'scene', sceneId } },
		});
		return { step: 'project', playerId: playerActorIds[0] ?? null, ...projected };
	});
	expect(result.status, `${result.step}: ${JSON.stringify(result.rejection ?? {})}`).toBe(
		'accepted',
	);
	expect(result.playerId, 'the seeded vault must register a player actor').toBeTruthy();
	return result.playerId as string;
}

async function waitRuntime(page: Page): Promise<void> {
	await page.waitForFunction(() => !!window.__rt && window.__rt.loaded === true, null, {
		timeout: 20_000,
	});
}

test.describe('player view: the projected stage', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/session');
		await seedFresh(page);
		await projectSceneToPlayers(page);
		await page.goto('/#/play', { waitUntil: 'domcontentloaded' });
		await waitRuntime(page);
		await enterPreview(page, 'player');
		await page.getByRole('main').first().waitFor({ timeout: 20_000 });
	});

	test('keeps its dark theatre backdrop instead of painting a see-through box', async ({
		page,
	}) => {
		// The stage set a `background` SHORTHAND carrying the two theatre gradients and then, on the
		// very next line, a `backgroundImage` carrying the grid. React writes style keys in declaration
		// order, so the second replaced the first's layers outright — and the shorthand had already
		// reset background-color to transparent. Every projected scene therefore rendered as a
		// see-through box with faint grid lines over the page: lightest in `parchment`, the exact
		// opposite of a darkened theatre, and the EMPTY state was the only correctly-dark one.
		const stage = page.getByTestId('player-stage');
		await expect(stage).toBeVisible();

		const painted = await stage.evaluate((el) => {
			const style = getComputedStyle(el);
			return { color: style.backgroundColor, image: style.backgroundImage };
		});

		expect(painted.color, 'the stage must be opaque, not see-through').not.toMatch(
			/rgba\(0,\s*0,\s*0,\s*0\)|^transparent$/,
		);
		// All four layers survive: the two grid rules AND the two theatre gradients beneath them.
		expect(painted.image, 'the theatre gradients must not be overwritten by the grid').toContain(
			'radial-gradient',
		);
		expect(painted.image.match(/linear-gradient/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
	});

	test('paints a grid that is actually visible against the near-black stage', async ({ page }) => {
		// The grid rules were `color-mix(in srgb, var(--color-accent) 14%, transparent)`. The stage
		// backdrop is hard-coded near-black in EVERY theme, but the accent is not: parchment's
		// `#9a5418` at 14% over `#100b07` composites to a difference the eye cannot find, so the grid
		// simply vanished in that theme. A fixed warm tint is theme-independent, like the backdrop.
		await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'parchment'));
		const image = await page
			.getByTestId('player-stage')
			.evaluate((el) => getComputedStyle(el).backgroundImage);
		expect(image, 'the grid must not be derived from the theme accent').not.toContain('color-mix');
		expect(image).toContain('radial-gradient');
	});
});

test.describe('player view: forced colors', () => {
	test('drops the stage gradients so the scene caption is not black on black', async ({ page }) => {
		// `tokens/colors.css`'s forced-colors block remaps every colour TOKEN, but the UA forces
		// `background-color` and `color` only — a decorative gradient is a background-IMAGE and
		// survives untouched. The stage's near-black theatre gradient and the caption scrim above it
		// are both background-images, so in a light high-contrast theme the scene name was forced to
		// CanvasText (black) and painted over a near-black backdrop the OS never neutralised.
		await page.emulateMedia({ forcedColors: 'active' });
		await markOnboarded(page);
		await gotoRoute(page, '/session');
		await seedFresh(page);
		await projectSceneToPlayers(page);
		await page.goto('/#/play', { waitUntil: 'domcontentloaded' });
		await waitRuntime(page);
		await enterPreview(page, 'player');
		await page.getByRole('main').first().waitFor({ timeout: 20_000 });

		expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);

		const stage = page.getByTestId('player-stage');
		await expect(stage).toBeVisible();
		expect(
			await stage.evaluate((el) => getComputedStyle(el).backgroundImage),
			'the stage must not keep a gradient the OS palette cannot see through',
		).toBe('none');

		const scrim = page.locator('.player-stage-scrim').first();
		await expect(scrim).toBeVisible();
		expect(
			await scrim.evaluate((el) => getComputedStyle(el).backgroundImage),
			'the caption scrim must not keep its darkening gradient',
		).toBe('none');
	});
});

test.describe('player view: per-player scene assignments', () => {
	// RC-CAN-6.2. `session.project-player-view` accepts a `playerActorIds` LIST, so it always could
	// target one player at a time — but the only DM-side control (the Stage panel's single "Project"
	// button) always sent the whole roster the same scene. `PlayerViewAssignments` (Stage panel, on
	// `/session`) is the per-player control: one `Select` per participant, each an independent
	// `session.project-player-view`. This drives two of the seeded demo players to two DIFFERENT
	// scenes through that real control and reads the result back out of the core.
	test('assigning two players different scenes through the Stage panel dispatches two independent assignments', async ({
		page,
	}) => {
		await markOnboarded(page);
		await gotoRoute(page, '/session');
		await seedFresh(page);

		const setup = await page.evaluate(async () => {
			const rt = window.__rt!;
			const state = rt.state as unknown as {
				permissions: { actors: Record<string, { id: string; displayName: string; role: string }> };
			};
			const players = Object.values(state.permissions.actors).filter((a) => a.role === 'player');
			if (players.length < 2) return { ok: false, players: players.length };
			const [playerA, playerB] = players;
			const sceneAName = `Player View Scene A ${Date.now()}`;
			const sceneBName = `Player View Scene B ${Date.now()}`;
			const createA = await rt.dispatch({
				type: 'scene.create',
				actorId: rt.defaultActorId,
				payload: { name: sceneAName, description: '', visibility: 'dm-only', tags: [] },
			});
			const createB = await rt.dispatch({
				type: 'scene.create',
				actorId: rt.defaultActorId,
				payload: { name: sceneBName, description: '', visibility: 'dm-only', tags: [] },
			});
			if (createA.status !== 'accepted') return { ok: false, step: 'create A', ...createA };
			if (createB.status !== 'accepted') return { ok: false, step: 'create B', ...createB };
			const scenesById = rt.state.scenes.scenes as Record<string, { id: string; name: string }>;
			const sceneA = Object.values(scenesById).find((s) => s.name === sceneAName)!;
			const live = await rt.dispatch({
				type: 'session.set-workflow',
				actorId: rt.defaultActorId,
				payload: { workflow: 'active', activeSceneId: sceneA.id },
			});
			if (live.status !== 'accepted') return { ok: false, step: 'go live', ...live };
			return {
				ok: true,
				playerAId: playerA.id,
				playerAName: playerA.displayName,
				playerBId: playerB.id,
				playerBName: playerB.displayName,
				sceneAName,
				sceneBName,
			};
		});
		expect(setup.ok, JSON.stringify(setup)).toBe(true);
		const { playerAId, playerAName, playerBId, playerBName, sceneAName, sceneBName } = setup as {
			playerAId: string;
			playerAName: string;
			playerBId: string;
			playerBName: string;
			sceneAName: string;
			sceneBName: string;
		};

		const assignments = page.getByTestId('player-view-assignments');
		await expect(assignments).toBeVisible();
		await assignments
			.getByLabel(`Scene projected to ${playerAName}`, { exact: true })
			.selectOption({ label: sceneAName });
		await assignments
			.getByLabel(`Scene projected to ${playerBName}`, { exact: true })
			.selectOption({ label: sceneBName });

		const assignedSceneId = (playerActorId: string) =>
			page.evaluate(
				(id) => window.__rt!.state.session.playerViewAssignments[id]?.target.sceneId ?? null,
				playerActorId,
			);
		await expect.poll(() => assignedSceneId(playerAId)).not.toBeNull();
		await expect.poll(() => assignedSceneId(playerBId)).not.toBeNull();
		const [sceneIdA, sceneIdB] = await Promise.all([
			assignedSceneId(playerAId),
			assignedSceneId(playerBId),
		]);
		expect(sceneIdA, 'each player must be assigned their OWN scene, not the same one').not.toBe(
			sceneIdB,
		);
	});
});

// RC-CLD-3.2 — PLAYER COMPANION PARITY for the projected MAP. The companion used to paint the
// projected map's raster and nothing else, so a player's own device showed an unfogged picture of a
// map the table saw fogged: the DM's projection choices stopped at the DM screen. The stage now
// draws the actor-filtered fog / markers / tokens through `StageMap`, in the same normalized 0..100
// space the DM canvas uses. This projects a real map with a real conceal fog op and a player-visible
// token, then reads the player stage back.
test.describe("player view: the projected map carries the DM's fog and tokens", () => {
	test('draws the projected map with its fog and tokens, not a bare raster', async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/session');
		await seedFresh(page);

		const setup = await page.evaluate(async () => {
			const rt = window.__rt!;
			const dm = rt.defaultActorId;
			const state = rt.state as unknown as {
				permissions: { actors: Record<string, { id: string; role: string }> };
			};
			const playerActorIds = Object.values(state.permissions.actors)
				.filter((a) => a.role === 'player')
				.map((a) => a.id);
			if (playerActorIds.length === 0) return { ok: false, step: 'no player actor' };

			const mapName = `Companion Parity Map ${Date.now()}`;
			const created = await rt.dispatch({
				type: 'map.create',
				actorId: dm,
				// player-visible throughout: this test is about the fog reaching the player, not about
				// the delivery gate (which `projectedMap.ts` already enforces on its own).
				payload: { name: mapName, description: '', visibility: 'player-visible' },
			});
			if (created.status !== 'accepted') return { ok: false, step: 'create map', ...created };
			const maps = rt.state.maps.maps as Record<string, { id: string; name: string }>;
			const map = Object.values(maps).find((m) => m.name === mapName);
			if (!map) return { ok: false, step: 'find map' };

			const layer = await rt.dispatch({
				type: 'map.create-layer',
				actorId: dm,
				payload: {
					mapId: map.id,
					name: 'Revealed ground',
					category: 'terrain',
					visibility: 'player-visible',
				},
			});
			if (layer.status !== 'accepted') return { ok: false, step: 'create layer', ...layer };
			const layers = (
				rt.state.maps.maps[map.id] as unknown as {
					layers: { id: string; name: string }[];
				}
			).layers;
			const layerId = layers.find((l) => l.name === 'Revealed ground')?.id;
			if (!layerId) return { ok: false, step: 'find layer' };

			const fog = await rt.dispatch({
				type: 'map.append-fog',
				actorId: dm,
				payload: {
					mapId: map.id,
					layerId,
					kind: 'conceal',
					region: { shape: 'rect', x: 0.5, y: 0.5, w: 0.4, h: 0.4 },
					visibility: 'player-visible',
				},
			});
			if (fog.status !== 'accepted') return { ok: false, step: 'append fog', ...fog };

			const token = await rt.dispatch({
				type: 'map.create-token',
				actorId: dm,
				payload: {
					mapId: map.id,
					layerId,
					label: 'Torchbearer',
					position: { x: 0.2, y: 0.2 },
					visibility: 'player-visible',
				},
			});
			if (token.status !== 'accepted') return { ok: false, step: 'create token', ...token };

			const scenes = rt.state.scenes.scenes as Record<string, { id: string; isTemplate?: boolean }>;
			const sceneId =
				rt.state.session.activeSceneId ?? Object.values(scenes).find((sc) => !sc.isTemplate)?.id;
			const live = await rt.dispatch({
				type: 'session.set-workflow',
				actorId: dm,
				payload: { workflow: 'active', activeSceneId: sceneId },
			});
			if (live.status !== 'accepted') return { ok: false, step: 'go live', ...live };
			// `session.set-active-map` binds the map to the Command Center's active-map widget, so the
			// home Scene has to exist first (idempotent when the vault already has one).
			const home = await rt.dispatch({
				type: 'command-center.ensure-home',
				actorId: dm,
				payload: {},
			});
			if (home.status !== 'accepted') return { ok: false, step: 'ensure home', ...home };
			const active = await rt.dispatch({
				type: 'session.set-active-map',
				actorId: dm,
				payload: { mapId: map.id },
			});
			if (active.status !== 'accepted') return { ok: false, step: 'set active map', ...active };
			const projected = await rt.dispatch({
				type: 'session.project-active-map',
				actorId: dm,
				payload: { playerActorIds },
			});
			if (projected.status !== 'accepted')
				return { ok: false, step: 'project active map', ...projected };
			return { ok: true, mapName };
		});
		expect(setup.ok, JSON.stringify(setup)).toBe(true);

		await page.goto('/#/play', { waitUntil: 'domcontentloaded' });
		await waitRuntime(page);
		await enterPreview(page, 'player');
		await page.getByRole('main').first().waitFor({ timeout: 20_000 });

		const stageMap = page.getByTestId('player-stage-map');
		await expect(stageMap).toBeVisible();
		// The fog op the DM appended reached the player device, and so did the token.
		await expect(stageMap).toHaveAttribute('data-fog-ops', '1');
		await expect(stageMap).toHaveAttribute('data-tokens', '1');
		// The wash is actually painted (a mask-composed rect over the whole normalized viewBox), so the
		// player sees concealed ground rather than an accessible-name-only claim that fog exists.
		await expect(stageMap.locator('mask rect')).toHaveCount(2);
		await expect(stageMap).toHaveAccessibleName(
			new RegExp(`${(setup as { mapName: string }).mapName}`),
		);
	});

	// RC-MAP-2.3 — the acceptance case for the shared combat overlay. The DM starts a fight with one
	// ordinary monster and one HIDDEN one; both get auto-placed on the staged map. The DM's own read of
	// that map carries two combat tokens, the player's projected map carries exactly one, and it is the
	// visible monster. The filtering is the core's (`getMapViewForActor` applies the combat tracker's
	// visibility rule); this proves the overlay never widens it on the way to the player device.
	test('draws only the combat tokens the player may see, never the hidden one', async ({
		page,
	}) => {
		await markOnboarded(page);
		await gotoRoute(page, '/session');
		await seedFresh(page);

		const setup = await page.evaluate(async () => {
			const rt = window.__rt!;
			const dm = rt.defaultActorId;
			const state = rt.state as unknown as {
				permissions: { actors: Record<string, { id: string; role: string }> };
			};
			const playerActorIds = Object.values(state.permissions.actors)
				.filter((a) => a.role === 'player')
				.map((a) => a.id);
			if (playerActorIds.length === 0) return { ok: false, step: 'no player actor' };

			const mapName = `Combat Overlay Map ${Date.now()}`;
			const created = await rt.dispatch({
				type: 'map.create',
				actorId: dm,
				payload: { name: mapName, description: '', visibility: 'player-visible' },
			});
			if (created.status !== 'accepted') return { ok: false, step: 'create map', ...created };
			const maps = rt.state.maps.maps as Record<string, { id: string; name: string }>;
			const map = Object.values(maps).find((m) => m.name === mapName);
			if (!map) return { ok: false, step: 'find map' };

			const scenes = rt.state.scenes.scenes as Record<string, { id: string; isTemplate?: boolean }>;
			const sceneId =
				rt.state.session.activeSceneId ?? Object.values(scenes).find((sc) => !sc.isTemplate)?.id;
			const live = await rt.dispatch({
				type: 'session.set-workflow',
				actorId: dm,
				payload: { workflow: 'active', activeSceneId: sceneId },
			});
			if (live.status !== 'accepted') return { ok: false, step: 'go live', ...live };
			const home = await rt.dispatch({
				type: 'command-center.ensure-home',
				actorId: dm,
				payload: {},
			});
			if (home.status !== 'accepted') return { ok: false, step: 'ensure home', ...home };
			const active = await rt.dispatch({
				type: 'session.set-active-map',
				actorId: dm,
				payload: { mapId: map.id },
			});
			if (active.status !== 'accepted') return { ok: false, step: 'set active map', ...active };

			// Combat starts AFTER the map is staged, so `combat.start` auto-places both combatants on it.
			const combat = await rt.dispatch({
				type: 'combat.start',
				actorId: dm,
				payload: {
					combatants: [
						{ kind: 'monster', name: 'Watchful Gargoyle', ac: 15, initiative: 18, maxHp: 30 },
						{
							kind: 'monster',
							name: 'Lurker In Ambush',
							ac: 13,
							initiative: 9,
							maxHp: 20,
							hidden: true,
							placeholder: 'Something waits',
						},
					],
				},
			});
			if (combat.status !== 'accepted') return { ok: false, step: 'start combat', ...combat };

			const projected = await rt.dispatch({
				type: 'session.project-active-map',
				actorId: dm,
				payload: { playerActorIds },
			});
			if (projected.status !== 'accepted')
				return { ok: false, step: 'project active map', ...projected };

			// The DM's own actor-scoped read of the same map — the baseline the player result is
			// compared against, so a "1 token" assertion cannot pass because nothing was placed at all.
			const dmTokens = Object.values(
				(rt.state.session as unknown as { combat: { tokens: Record<string, { mapId: string }> } })
					.combat.tokens,
			).filter((tk) => tk.mapId === map.id).length;
			return { ok: true, mapName, dmTokens };
		});
		expect(setup.ok, JSON.stringify(setup)).toBe(true);
		expect((setup as { dmTokens: number }).dmTokens).toBe(2);

		await page.goto('/#/play', { waitUntil: 'domcontentloaded' });
		await waitRuntime(page);
		await enterPreview(page, 'player');
		await page.getByRole('main').first().waitFor({ timeout: 20_000 });

		const stageMap = page.getByTestId('player-stage-map');
		await expect(stageMap).toBeVisible();
		// Two combatants stand on the staged map; the player device draws exactly one — the hidden one
		// is ABSENT, not redacted, so its position never reaches the player's screen.
		await expect(stageMap).toHaveAttribute('data-tokens', '1');
	});
});
