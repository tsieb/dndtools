import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
	dispatch,
	enterPreview,
	exitPreview,
	gotoRoute,
	markOnboarded,
	seedFresh,
} from './_helpers';

// COLLAB — DM vs player/observer view. The DM's shell re-renders through the SAME actor-filtered
// Core queries a real participant session uses (via `enterPreview`), so a `dm-only` scene is absent
// from a player/observer preview while a `player-visible` scene is present. Also proves preview is
// read-only: a mutation dispatched while previewing is rejected before it reaches the Core.

test.describe('collab: actor-filtered player/observer views', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/scenes');
		await seedFresh(page);
		await page.goto('/#/scenes', { waitUntil: 'domcontentloaded' });
		await page.locator('#main-content').waitFor({ state: 'attached' });
	});

	test('a dm-only scene is hidden from a player preview; a player-visible scene is shown', async ({
		page,
	}) => {
		const stamp = Date.now();
		const dmSecret = `DM Secret ${stamp}`;
		const partyCamp = `Party Camp ${stamp}`;

		// Author both scenes as the DM through the real write path.
		const secret = await dispatch(page, {
			type: 'scene.create',
			actorId: await page.evaluate(() => window.__rt!.defaultActorId),
			payload: { name: dmSecret, description: '', visibility: 'dm-only', tags: [] },
		});
		const camp = await dispatch(page, {
			type: 'scene.create',
			actorId: await page.evaluate(() => window.__rt!.defaultActorId),
			payload: { name: partyCamp, description: '', visibility: 'player-visible', tags: [] },
		});
		expect(secret.status).toBe('accepted');
		expect(camp.status).toBe('accepted');

		// As the DM, the actor-filtered scene list renders BOTH scenes. Assert on DOM presence
		// (count) rather than layout-dependent visibility, so the check holds on the compact profile.
		await expect(page.getByText(dmSecret)).not.toHaveCount(0);
		await expect(page.getByText(partyCamp)).not.toHaveCount(0);

		// Preview as a generic (zero-grant) player: dm-only content is gone, player-visible remains.
		await enterPreview(page, 'player');
		await expect(page.getByText(partyCamp)).not.toHaveCount(0);
		await expect(page.getByText(dmSecret)).toHaveCount(0);
	});

	test('preview mode is read-only: a mutation dispatched while previewing is rejected', async ({
		page,
	}) => {
		await enterPreview(page, 'observer');
		const rejected = await dispatch(page, {
			type: 'scene.create',
			actorId: await page.evaluate(() => window.__rt!.defaultActorId),
			payload: { name: 'Should Not Persist', description: '', visibility: 'dm-only', tags: [] },
		});
		expect(rejected.status).toBe('rejected');
		await exitPreview(page);

		// The rejected mutation never reached Core state.
		const leaked = await page.evaluate(() =>
			Object.values(window.__rt!.state.scenes.scenes).some((s) => s.name === 'Should Not Persist'),
		);
		expect(leaked).toBe(false);
	});
});

// RC-CHR-3.1 — the LIVE PARTY PANEL. The panel paints `PlayerData.partyVitals`, which the DM device
// computes through the actor-filtered query layer and replicates verbatim to a joined player. This
// asserts the delivery half of the contract on the real `/play` surface: a DM-side HP change must
// reach the player's party panel within the declared `live-session-delivery` p95 budget.
//
// The budget number is READ FROM THE PERF REGISTRY SOURCE rather than repeated here — `budget-registry.ts`
// owns it (see its migration note), and a registry that no longer declares the id throws instead of
// letting this test pass against a number nobody maintains. It is read from the file rather than
// imported because a Playwright spec runs as plain ESM, where `@dndtools/core`'s JSON system packages
// need import attributes the transpiled app build supplies and Node does not.
const DELIVERY_BUDGET_MS = (() => {
	const registry = readFileSync(
		fileURLToPath(
			new URL('../../../../packages/core/src/perf/budget-registry.ts', import.meta.url),
		),
		'utf8',
	);
	const entry = registry.slice(registry.indexOf("id: 'live-session-delivery'"));
	const target = /kind: 'latency-ms-p95'[^}]*?target: (\d+)/.exec(entry.slice(0, 600));
	if (!target) throw new Error('the live-session-delivery latency budget is not declared');
	return Number(target[1]);
})();

test.describe('collab: live party panel', () => {
	test('a DM HP change reaches the player party panel within the delivery budget', async ({
		page,
	}) => {
		await markOnboarded(page);
		await gotoRoute(page, '/session');
		await seedFresh(page);

		// Take the table live — the Core gates combat-resource updates on an active Session workflow,
		// which is exactly the state this panel is for.
		const live = await page.evaluate(async () => {
			const rt = window.__rt!;
			const state = rt.state as unknown as {
				session: { activeSceneId: string | null };
				commandCenter: { homeSceneId: string | null };
				scenes: { scenes: Record<string, { id: string; isTemplate?: boolean }> };
			};
			const activeSceneId =
				state.session.activeSceneId ??
				state.commandCenter.homeSceneId ??
				Object.values(state.scenes.scenes).find((s) => !s.isTemplate)?.id;
			return rt.dispatch({
				type: 'session.set-workflow',
				actorId: rt.defaultActorId,
				payload: { workflow: 'active', activeSceneId },
			});
		});
		expect(live.status, JSON.stringify(live.rejection ?? {})).toBe('accepted');

		// The PC the DM will damage, straight from the seeded vault.
		const pc = await page.evaluate(() => {
			const characters = (
				window.__rt!.state as unknown as {
					characters: {
						characters: Record<string, { id: string; kind: string; combat: { hp: number } }>;
					};
				}
			).characters.characters;
			const found = Object.values(characters).find((c) => c.kind === 'pc' && c.combat.hp > 1);
			return found ? { id: found.id, hp: found.combat.hp } : null;
		});
		expect(pc, 'the seeded vault must carry a PC with hit points').toBeTruthy();

		// `/play` renders as the PLAYER actor (`actor-player`) without preview mode, so the panel is a
		// real actor-filtered read AND the DM can still dispatch (preview mode rejects every mutation).
		await page.goto('/#/play', { waitUntil: 'domcontentloaded' });
		await page.waitForFunction(() => !!window.__rt && window.__rt.loaded === true, null, {
			timeout: 20_000,
		});
		await page.getByRole('button', { name: 'Party', exact: true }).click();

		const row = page.getByTestId(`party-row-${pc!.id}`);
		await expect(row).toBeVisible({ timeout: 20_000 });
		await expect(row).toContainText(`${pc!.hp}/`);

		// The DM applies damage through the real command path. `partyVitals` is recomputed from the
		// actor-filtered overview on the next runtime state push, so the panel must follow.
		const started = Date.now();
		const damaged = await dispatch(page, {
			type: 'character.update-combat-resource',
			actorId: await page.evaluate(() => window.__rt!.defaultActorId),
			payload: { characterId: pc!.id, kind: 'hp', delta: -1 },
		});
		expect(damaged.status, JSON.stringify(damaged.rejection ?? {})).toBe('accepted');
		await expect(row).toContainText(`${pc!.hp - 1}/`, { timeout: DELIVERY_BUDGET_MS });
		expect(Date.now() - started).toBeLessThanOrEqual(DELIVERY_BUDGET_MS);
	});
});

// RC-CLD-3.1 — the DM's HOST panel. Hosting on the local network needs no account, so this runs for
// real in e2e: the panel must report the table's state plainly (nobody has joined) rather than
// implying players are present, and the way to stop must be a live control.
test.describe('collab: the DM host panel', () => {
	test('hosting a local table reports an empty roster honestly and can be stopped', async ({
		page,
	}) => {
		await markOnboarded(page);
		await gotoRoute(page, '/');

		// On a phone the top-bar control cluster collapses into the "Table controls" sheet (`TopBar.tsx`),
		// so the host control only exists once that is open.
		const opener = page.getByRole('button', { name: 'Table controls' });
		if ((await opener.count()) > 0) await opener.click();
		await page.getByRole('button', { name: /Host a live table/ }).click();
		const dialog = page.getByRole('dialog', { name: 'Host a live table' });
		await expect(dialog).toBeVisible();

		await dialog.getByRole('button', { name: 'Host on local network' }).click();

		await expect(dialog.getByText('No players yet')).toBeVisible();
		await expect(dialog.getByTestId('session-peer')).toHaveCount(0);
		await expect(dialog.getByRole('button', { name: 'Stop hosting' })).toBeEnabled();
	});
});

// RC-MAP-2.4 — LIVE FOG REVEAL. The acceptance case: the DM uncovers ground mid-session and the
// change has to land on the player's own device — the fog list they render, and the 0.8s fade that
// tells them it just happened rather than leaving them to notice the map is different.
//
// `/play` renders as the real player actor (`actor-player`) with no preview mode, so the stage map is
// an actor-filtered read AND the DM can still dispatch. The flash is transient by design, so it is
// caught with a MutationObserver armed BEFORE the reveal — polling for an 800ms element would be a
// race, and a test that can miss its own subject proves nothing.
test.describe('collab: live fog reveal', () => {
	test('a fog reveal reaches the player stage and fades in', async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/session');
		await seedFresh(page);

		const setup = await page.evaluate(async () => {
			const rt = window.__rt!;
			const dm = rt.defaultActorId;
			const state = rt.state as unknown as {
				permissions: { actors: Record<string, { id: string; role: string }> };
				session: { activeSceneId: string | null };
				scenes: { scenes: Record<string, { id: string; isTemplate?: boolean }> };
			};
			const playerActorIds = Object.values(state.permissions.actors)
				.filter((a) => a.role === 'player')
				.map((a) => a.id);
			if (playerActorIds.length === 0) return { ok: false, step: 'no player actor' };

			const mapName = `Fog Reveal Map ${Date.now()}`;
			const created = await rt.dispatch({
				type: 'map.create',
				actorId: dm,
				payload: { name: mapName, description: '', visibility: 'player-visible' },
			});
			if (created.status !== 'accepted') return { ok: false, step: 'create map', ...created };
			const maps = rt.state.maps.maps as Record<string, { id: string; name: string }>;
			const map = Object.values(maps).find((m) => m.name === mapName);
			if (!map) return { ok: false, step: 'find map' };

			const layer = await rt.dispatch({
				type: 'map.create-layer',
				actorId: dm,
				payload: { mapId: map.id, name: 'Fog', category: 'terrain', visibility: 'player-visible' },
			});
			if (layer.status !== 'accepted') return { ok: false, step: 'create layer', ...layer };
			const layerId = (
				rt.state.maps.maps[map.id] as unknown as { layers: { id: string; name: string }[] }
			).layers.find((l) => l.name === 'Fog')?.id;
			if (!layerId) return { ok: false, step: 'find layer' };

			// The whole map starts concealed — the state a player joins into.
			const conceal = await rt.dispatch({
				type: 'map.append-fog',
				actorId: dm,
				payload: {
					mapId: map.id,
					layerId,
					kind: 'conceal',
					region: { shape: 'rect', x: 0, y: 0, w: 1, h: 1 },
					visibility: 'player-visible',
				},
			});
			if (conceal.status !== 'accepted') return { ok: false, step: 'conceal', ...conceal };

			const sceneId =
				state.session.activeSceneId ??
				Object.values(state.scenes.scenes).find((sc) => !sc.isTemplate)?.id;
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
			const projected = await rt.dispatch({
				type: 'session.project-active-map',
				actorId: dm,
				payload: { playerActorIds },
			});
			if (projected.status !== 'accepted') return { ok: false, step: 'project', ...projected };
			return { ok: true, mapId: map.id, layerId };
		});
		expect(setup.ok, JSON.stringify(setup)).toBe(true);

		await page.goto('/#/play', { waitUntil: 'domcontentloaded' });
		await page.waitForFunction(() => !!window.__rt && window.__rt.loaded === true, null, {
			timeout: 20_000,
		});

		const stageMap = page.getByTestId('player-stage-map');
		await expect(stageMap).toBeVisible({ timeout: 20_000 });
		// The map the player joined into: concealed, and NOT flashing — arriving mid-session must not
		// replay the reveals that happened before this device was looking.
		await expect(stageMap).toHaveAttribute('data-fog-ops', '1');
		await expect(page.getByTestId('fog-reveal-flash')).toHaveCount(0);

		// Arm the observer before the DM touches anything: the fade lasts 800ms and then removes
		// itself, so "did it ever appear" has to be recorded, not sampled.
		await page.evaluate(() => {
			const w = window as unknown as { __fogFlash?: { seen: boolean; animation: string | null } };
			w.__fogFlash = { seen: false, animation: null };
			new MutationObserver(() => {
				const node = document.querySelector('[data-testid="fog-reveal-flash"] .dnd-fog-reveal');
				if (!node || w.__fogFlash!.seen) return;
				w.__fogFlash!.seen = true;
				w.__fogFlash!.animation = getComputedStyle(node).animation || null;
			}).observe(document.body, { childList: true, subtree: true });
		});

		const revealed = await dispatch(page, {
			type: 'map.append-fog',
			actorId: await page.evaluate(() => window.__rt!.defaultActorId),
			payload: {
				mapId: (setup as { mapId: string }).mapId,
				layerId: (setup as { layerId: string }).layerId,
				kind: 'reveal',
				region: { shape: 'rect', x: 0.2, y: 0.2, w: 0.3, h: 0.3 },
				visibility: 'player-visible',
			},
		});
		expect(revealed.status, JSON.stringify(revealed.rejection ?? {})).toBe('accepted');

		// The reveal reached the player device's own fog list…
		await expect(stageMap).toHaveAttribute('data-fog-ops', '2', { timeout: DELIVERY_BUDGET_MS });
		// …and it arrived as a fade, not as a map that had silently changed.
		await page.waitForFunction(
			() => (window as unknown as { __fogFlash?: { seen: boolean } }).__fogFlash?.seen === true,
			null,
			{ timeout: DELIVERY_BUDGET_MS },
		);
		const animation = await page.evaluate(
			() =>
				(window as unknown as { __fogFlash?: { animation: string | null } }).__fogFlash
					?.animation ?? '',
		);
		// The named fade is what ran. Its 0.8s ease-out timing and its reduced-motion collapse are
		// pinned by the unit motion test (src/app/fogRegions.test.tsx) rather than by a computed
		// duration here, which the browser's own motion preference is allowed to rewrite.
		expect(animation, 'the revealed region must be running the reveal fade').toContain(
			'dnd-fog-reveal',
		);
	});
});

// RC-SES-5.1 — PLAYER-ROLLED INITIATIVE. The DM calls for initiative from the tracker, the player rolls
// from `/play`, and the roll lands on the DM's tracker row in initiative order. `/play` renders as the
// real player actor (`actor-player`, who owns a PC in the demo seed) with no preview mode, so the roll
// is dispatched AS that player through `combat.apply-resource` — the same command the P2P host relays
// for a joined device (`SessionHost` unit-tests that relay) — and the DM's runtime is the authority
// that accepts it, or refuses it for a character the player does not hold.
test.describe('collab: player-rolled initiative', () => {
	test('the DM calls, the player rolls, the tracker orders; no one rolls for another player', async ({
		page,
	}) => {
		await markOnboarded(page);
		await gotoRoute(page, '/session');
		await seedFresh(page);

		const party = await page.evaluate(async () => {
			const rt = window.__rt!;
			const state = rt.state as unknown as {
				session: { activeSceneId: string | null };
				commandCenter: { homeSceneId: string | null };
				scenes: { scenes: Record<string, { id: string; isTemplate?: boolean }> };
				characters: { characters: Record<string, { id: string; kind: string; name: string }> };
				permissions: {
					grants: { playerActorId: string; entityType: string; entityId: string }[];
				};
			};
			const sceneId =
				state.session.activeSceneId ??
				state.commandCenter.homeSceneId ??
				Object.values(state.scenes.scenes).find((s) => !s.isTemplate)?.id;
			const live = await rt.dispatch({
				type: 'session.set-workflow',
				actorId: rt.defaultActorId,
				payload: { workflow: 'active', activeSceneId: sceneId },
			});
			const pcs = Object.values(state.characters.characters).filter((c) => c.kind === 'pc');
			const ownedIds = new Set(
				state.permissions.grants
					.filter((g) => g.playerActorId === 'actor-player' && g.entityType === 'character')
					.map((g) => g.entityId),
			);
			return {
				live: live.status,
				mine: pcs.find((c) => ownedIds.has(c.id))?.name ?? null,
				others: pcs.filter((c) => !ownedIds.has(c.id)).map((c) => c.name),
			};
		});
		expect(party.live).toBe('accepted');
		expect(party.mine, 'the demo player must own a PC').toBeTruthy();
		expect(party.others.length, 'the seed must carry a second PC').toBeGreaterThan(0);
		const mine = party.mine!;
		const other = party.others[0]!;
		const pcCount = party.others.length + 1;

		// 1 · The DM calls for initiative from the tracker: every PC enters the fight owing a roll.
		const main = page.locator('#main-content');
		await main.getByRole('button', { name: 'Roll for initiative' }).click();
		const banner = page.getByTestId('initiative-call-banner');
		await expect(banner).toBeVisible();
		await expect(banner).toContainText(`0 of ${pcCount} characters rolled`);

		// The DM brings in two monsters with fixed numbers around the d20 range, so the order the
		// player's roll lands in is checkable whatever the die shows.
		const added = await page.evaluate(() =>
			window.__rt!.dispatch({
				type: 'combat.add-combatants',
				actorId: window.__rt!.defaultActorId,
				payload: {
					combatants: [
						{ kind: 'monster', name: 'Bog Lurker', initiative: 40, maxHp: 22 },
						{ kind: 'monster', name: 'Reed Stalker', initiative: -10, maxHp: 14 },
					],
				},
			}),
		);
		expect(added.status, JSON.stringify(added.rejection ?? {})).toBe('accepted');

		// 2 · The player rolls from their own companion.
		await page.goto('/#/play', { waitUntil: 'domcontentloaded' });
		await page.waitForFunction(() => !!window.__rt && window.__rt.loaded === true, null, {
			timeout: 20_000,
		});
		const call = page.getByTestId('initiative-call');
		await expect(call).toBeVisible({ timeout: 20_000 });
		await expect(call).toContainText(`Roll for ${mine}`);
		await call.getByRole('button', { name: /Roll initiative/ }).click();
		await expect(call).toContainText(/You rolled -?\d+/, { timeout: DELIVERY_BUDGET_MS });
		await expect(call.getByRole('button', { name: /Roll initiative/ })).toHaveCount(0);

		const rolled = await page.evaluate((name) => {
			const combat = (
				window.__rt!.state.session as unknown as {
					combat: {
						order: string[];
						combatants: Record<string, { name: string; statBlock: { initiative: number } }>;
						log: { kind: string; combatantId: string | null; actorActorId: string }[];
					};
				}
			).combat;
			const id = combat.order.find((cid) => combat.combatants[cid]!.name === name)!;
			const entry = combat.log.find((e) => e.kind === 'roll' && e.combatantId === id);
			return { total: combat.combatants[id]!.statBlock.initiative, by: entry?.actorActorId };
		}, mine);
		// The roll is the player's own, recorded by the DM's runtime.
		expect(rolled.by).toBe('actor-player');

		// 3 · A player cannot set another player's initiative — neither by rolling for their character
		// nor by naming a number. The DM's runtime refuses both.
		const refused = await page.evaluate(async (name) => {
			const rt = window.__rt!;
			const combat = (
				rt.state.session as unknown as {
					combat: { order: string[]; combatants: Record<string, { name: string }> };
				}
			).combat;
			const id = combat.order.find((cid) => combat.combatants[cid]!.name === name)!;
			const byRoll = await rt.dispatch({
				type: 'combat.apply-resource',
				actorId: 'actor-player',
				payload: { combatantId: id, kind: 'initiative', roll: { modifier: 5 } },
			});
			const byValue = await rt.dispatch({
				type: 'combat.apply-resource',
				actorId: 'actor-player',
				payload: { combatantId: id, kind: 'initiative', value: 99 },
			});
			return [byRoll.status, byValue.status];
		}, other);
		expect(refused).toEqual(['rejected', 'rejected']);

		// 4 · Back on the DM's tracker the roll sits on the player's row, in initiative order.
		await page.goto('/#/session', { waitUntil: 'domcontentloaded' });
		const order = page.getByRole('list').filter({ hasText: 'Bog Lurker' }).first();
		const rows = order.getByRole('listitem');
		await expect(rows).toHaveCount(pcCount + 2, { timeout: 20_000 });
		await expect(rows.filter({ hasText: mine })).toContainText(`Rolled ${rolled.total}`);
		await expect(rows.filter({ hasText: other })).toContainText('Awaiting roll');
		await expect(banner).toContainText(`1 of ${pcCount} characters rolled`);
		await expect(rows.first()).toContainText('Bog Lurker');
		await expect(rows.last()).toContainText('Reed Stalker');
		const names = async () =>
			(await rows.allInnerTexts()).map((text) =>
				[mine, other, 'Bog Lurker', 'Reed Stalker', ...party.others].find((n) => text.includes(n)),
			);
		const before = await names();
		expect(before.indexOf(mine)).toBeGreaterThan(before.indexOf('Bog Lurker'));
		expect(before.indexOf(mine)).toBeLessThan(before.indexOf('Reed Stalker'));

		// 5 · The DM adjusts the other player's number, and the row moves to the top.
		await rows.filter({ hasText: other }).getByRole('button', { name: other, exact: true }).click();
		const field = page.getByLabel(`Initiative for ${other}`);
		await field.fill('50');
		await field.press('Enter');
		await expect(rows.first()).toContainText(other);
		await expect(rows.first()).toContainText('Adjusted');

		// 6 · The DM starts: round 1 opens on the highest initiative, and the call is gone.
		await banner.getByRole('button', { name: 'Start round 1' }).click();
		await expect(banner).toHaveCount(0);
		await expect(rows.first()).toContainText('Active');
		const round = await page.evaluate(
			() => (window.__rt!.state.session as unknown as { combat: { round: number } }).combat.round,
		);
		expect(round).toBe(1);
	});
});
