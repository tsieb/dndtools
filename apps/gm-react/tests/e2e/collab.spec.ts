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
