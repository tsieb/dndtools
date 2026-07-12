import { expect, test, type Page } from '@playwright/test';
import { dispatch, exitPreview, gotoRoute, markOnboarded, ops, seedFresh, waitReady } from './_helpers';

// CO-DM — the elevated `co-dm` base role (ADR-022). A co-DM sees and authors DM-grade content
// (dm-only scenes/notes, the creature roster, the full combat tracker) but never inherits the
// campaign-owner's administrative powers (role assignment, invites, grants) — authority vs ownership.
// This spec drives the three surfaces that make the role real against the live Processing Core:
//   1. "View as → Co-DM" preview on a DM shell route re-renders through the SAME actor-filtered
//      queries a co-DM session uses: a dm-only scene is visible under a co-DM preview but hidden under
//      a plain player preview (elevated visibility, safe by construction).
//   2. The standalone /play companion unlocks its ELEVATED tier (Atlas/Maps, Bestiary, Combat assist)
//      ONLY for a real `co-dm` seat — driven by the actor's role through `buildPlayerData`. A plain
//      player never gets those panels; a promoted co-DM sees the dm-only atlas + hidden bestiary.
//   3. `permission.assign-role` is the one role-mutation command: owner-only and co-DM-seat-gated,
//      failing closed on a no-seat plan, on a non-owner caller, and on the owner's own row.
//   4. The Settings Players roster promotes/demotes actors through that command, seat-gated by the
//      plan (honest "(no seats)" state on the free plan; the real success path once the plan grants
//      seats). Cloud INVITES are fail-closed in e2e, so the invite button shows its honest not-configured
//      state rather than opening a dead dialog.

/** Seeded fixtures from demo-seed.ts. */
const SEEDED_PLAYER_SCENE = 'Harbor of Saltreach'; // player-visible
const SEEDED_DM_SCENE = 'The Sunken Crypt'; // dm-only
const SEEDED_DM_NPC = 'Mira the Ferryman'; // dm-only creature/NPC (kind !== 'pc')

/** The demo participants seeded by SceneRuntime (never a co-DM at rest). */
const PLAYER_ACTOR = 'actor-player'; // "Demo Player"
const PLAYER2_ACTOR = 'actor-player-2';
const PLAYER3_ACTOR = 'actor-player-3';

/** Enter a DM "view as" preview for any previewable role (the shared helper covers only player/observer;
 *  the co-DM preview drives the reserved zero-grant generic co-DM actor). */
async function enterPreviewRole(page: Page, role: 'player' | 'observer' | 'co-dm'): Promise<void> {
	await page.evaluate((r) => window.__rt!.enterPreview({ role: r }), role);
	await page.waitForFunction((r) => window.__rt?.preview?.role === r, role, { timeout: 5_000 });
}

/** Read an actor's live base role off the raw Core state. */
function roleOf(page: Page, actorId: string): Promise<string | undefined> {
	return page.evaluate(
		(id) => (window.__rt!.state.permissions as { actors: Record<string, { role?: string }> }).actors[id]?.role,
		actorId,
	);
}

/** Dispatch `permission.assign-role` as a chosen caller (defaults to the campaign owner). */
function assignRole(
	page: Page,
	targetActorId: string,
	role: 'co-dm' | 'player' | 'observer',
	coDmSeatLimit: number,
	callerActorId?: string,
) {
	return page.evaluate(
		(arg) =>
			window.__rt!.dispatch({
				type: 'permission.assign-role',
				actorId: arg.caller ?? window.__rt!.defaultActorId,
				payload: { targetActorId: arg.target, role: arg.role, coDmSeatLimit: arg.limit },
			}),
		{ target: targetActorId, role, limit: coDmSeatLimit, caller: callerActorId },
	);
}

/** Create a scene of a given visibility through the dispatch choke point (as the owner DM). */
async function createScene(page: Page, name: string, visibility: 'dm-only' | 'player-visible'): Promise<void> {
	const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
	const result = await dispatch(page, { type: 'scene.create', actorId, payload: { name, visibility } });
	expect(result.status).toBe('accepted');
	await page.waitForFunction(
		(n) =>
			Object.values((window.__rt!.state.scenes as { scenes: Record<string, { name: string }> }).scenes).some(
				(s) => s.name === n,
			),
		name,
		{ timeout: 10_000 },
	);
}

/** Boot a fresh, demo-seeded vault on a DM shell route, optionally pinning the device-local plan first. */
async function bootShell(page: Page, route: string, plan?: string): Promise<void> {
	await markOnboarded(page);
	if (plan) {
		await page.addInitScript((p) => {
			try {
				window.localStorage.setItem('dndtools:react:plan', p);
			} catch {
				/* storage best-effort */
			}
		}, plan);
	}
	await gotoRoute(page, route);
	await seedFresh(page);
	await page.goto(`/#${route}`, { waitUntil: 'domcontentloaded' });
	await waitReady(page);
	await page.locator('#main-content').waitFor({ state: 'attached' });
}

/** Boot a fresh vault and land on the standalone /play companion (which renders OUTSIDE the AppShell,
 *  so it has no #main-content landmark — wait on the runtime + the sidebar header instead). */
async function bootPlay(page: Page): Promise<void> {
	await page.goto('/#/play', { waitUntil: 'domcontentloaded' });
	await page.waitForFunction(() => !!window.__rt && window.__rt.loaded === true, null, { timeout: 20_000 });
	await page.getByText('Player view').first().waitFor({ state: 'attached', timeout: 20_000 });
}

test.describe('co-dm: elevated role', () => {
	test('a Co-DM preview reveals DM-only scenes a player preview hides', async ({ page }) => {
		await bootShell(page, '/scenes');
		const stamp = Date.now();
		const dmScene = `Hidden Vault ${stamp}`;
		await createScene(page, dmScene, 'dm-only');

		const main = page.locator('#main-content');
		// The owner DM sees every scene — the fresh dm-only one, the seeded dm-only crypt, and the shared harbor.
		await expect(main.getByText(dmScene)).not.toHaveCount(0);
		await expect(main.getByText(SEEDED_DM_SCENE)).not.toHaveCount(0);
		await expect(main.getByText(SEEDED_PLAYER_SCENE)).not.toHaveCount(0);

		// Co-DM preview: the shell re-renders through the co-DM's actor-filtered queries (dm-authority),
		// so the DM-only scenes remain visible.
		await enterPreviewRole(page, 'co-dm');
		await expect(main.getByText(dmScene)).not.toHaveCount(0);
		await expect(main.getByText(SEEDED_DM_SCENE)).not.toHaveCount(0);
		await expect(main.getByText(SEEDED_PLAYER_SCENE)).not.toHaveCount(0);
		await exitPreview(page);

		// Plain player preview: the SAME scenes drop to player visibility — the dm-only scenes vanish,
		// only the player-visible harbor survives. Same seed, opposite result: the projection is real.
		await enterPreviewRole(page, 'player');
		await expect(main.getByText(dmScene)).toHaveCount(0);
		await expect(main.getByText(SEEDED_DM_SCENE)).toHaveCount(0);
		await expect(main.getByText(SEEDED_PLAYER_SCENE)).not.toHaveCount(0);
		await exitPreview(page);
	});

	test('a Co-DM seat unlocks the /play elevated tier that a player never gets', async ({ page }) => {
		await bootShell(page, '/knowledge');
		const stamp = Date.now();
		const dmScene = `Sealed Sanctum ${stamp}`;
		await createScene(page, dmScene, 'dm-only');

		await bootPlay(page);
		const maps = page.getByRole('button', { name: 'Maps' });
		const bestiary = page.getByRole('button', { name: 'Bestiary' });
		const assist = page.getByRole('button', { name: 'Combat assist' });

		// As the default player seat (actor-player), the elevated nav is present but LOCKED.
		await expect(maps).toBeDisabled();
		await expect(bestiary).toBeDisabled();
		await expect(assist).toBeDisabled();

		// Promote the player to a real co-DM seat (owner-only, one seat). The /play view is role-driven
		// through buildPlayerData, so the elevated tier unlocks on the next frame.
		const promote = await assignRole(page, PLAYER_ACTOR, 'co-dm', 1);
		expect(promote.status).toBe('accepted');
		await page.waitForFunction(
			(id) =>
				(window.__rt!.state.permissions as { actors: Record<string, { role?: string }> }).actors[id]?.role ===
				'co-dm',
			PLAYER_ACTOR,
			{ timeout: 10_000 },
		);
		await expect(maps).toBeEnabled();
		await expect(bestiary).toBeEnabled();
		await expect(assist).toBeEnabled();

		// The elevated Atlas carries the dm-only scenes a player would never receive (safe by construction:
		// the payload is built through the co-DM's actor-filtered `listScenesForActor`).
		await maps.click();
		await expect(page.getByText('Maps & scenes')).not.toHaveCount(0);
		await expect(page.getByText(dmScene)).not.toHaveCount(0);
		await expect(page.getByText(SEEDED_DM_SCENE)).not.toHaveCount(0);

		// The elevated Bestiary carries the DM's hidden creature roster.
		await bestiary.click();
		await expect(page.getByText(SEEDED_DM_NPC)).not.toHaveCount(0);

		// The elevation is durable: the promoted role survives a reload and the tier stays unlocked.
		await page.reload({ waitUntil: 'domcontentloaded' });
		await page.waitForFunction(() => !!window.__rt && window.__rt.loaded === true, null, { timeout: 20_000 });
		await page.getByText('Player view').first().waitFor({ state: 'attached', timeout: 20_000 });
		expect(await roleOf(page, PLAYER_ACTOR)).toBe('co-dm');
		await expect(page.getByRole('button', { name: 'Maps' })).toBeEnabled();
	});

	test('permission.assign-role is owner-only and Co-DM-seat-gated in the core', async ({ page }) => {
		await bootShell(page, '/knowledge');

		// Owner promotes a player to co-DM with one seat available: accepted, role mutated, op-log grew.
		const before = await ops(page);
		const promote = await assignRole(page, PLAYER_ACTOR, 'co-dm', 1);
		expect(promote.status).toBe('accepted');
		expect(await roleOf(page, PLAYER_ACTOR)).toBe('co-dm');
		expect(await ops(page)).toBeGreaterThan(before);

		// Seat gate: a second promotion on a NO-SEAT plan (coDmSeatLimit 0) fails closed — role unchanged.
		const noSeat = await assignRole(page, PLAYER2_ACTOR, 'co-dm', 0);
		expect(noSeat.status).toBe('rejected');
		expect(noSeat.rejection?.message ?? '').toMatch(/no Co-DM seats/i);
		expect(await roleOf(page, PLAYER2_ACTOR)).toBe('player');

		// Seat gate: even WITH a 1-seat plan, the one seat is already in use — fail closed.
		const seatFull = await assignRole(page, PLAYER2_ACTOR, 'co-dm', 1);
		expect(seatFull.status).toBe('rejected');
		expect(seatFull.rejection?.message ?? '').toMatch(/seat/i);
		expect(await roleOf(page, PLAYER2_ACTOR)).toBe('player');

		// Owner-only: the freshly-minted co-DM cannot administer roles (authority ≠ ownership).
		const byCoDm = await assignRole(page, PLAYER3_ACTOR, 'co-dm', 9, PLAYER_ACTOR);
		expect(byCoDm.status).toBe('rejected');
		expect(await roleOf(page, PLAYER3_ACTOR)).toBe('player');

		// The owner's own row is never reassignable here (ownership moves only via transfer-ownership).
		const ownerId = await page.evaluate(() => window.__rt!.defaultActorId);
		const touchOwner = await assignRole(page, ownerId, 'player', 3);
		expect(touchOwner.status).toBe('rejected');
		expect(touchOwner.rejection?.message ?? '').toMatch(/owner/i);
		expect(await roleOf(page, ownerId)).toBe('dm');

		// Demotion travels the same command: the co-DM returns to a plain player seat.
		const demote = await assignRole(page, PLAYER_ACTOR, 'player', 1);
		expect(demote.status).toBe('accepted');
		expect(await roleOf(page, PLAYER_ACTOR)).toBe('player');
	});

	test('the Settings roster fails closed on a plan with no Co-DM seats', async ({ page }) => {
		// Default (free "hearth") plan — zero Co-DM seats.
		await bootShell(page, '/settings?tab=players');

		// The roster states the honest no-seats entitlement.
		await expect(page.getByText(/Your plan has no Co-DM seats/)).not.toHaveCount(0);

		// The per-actor role selector still OFFERS Co-DM, tagged with the honest "(no seats)" state.
		const roleSelect = page.getByLabel('Role for Demo Player', { exact: true });
		await expect(roleSelect.locator('option', { hasText: 'Co-DM (no seats)' })).toHaveCount(1);

		// Choosing it dispatches the real command, which fails closed: a rejection toast, role unchanged.
		await roleSelect.selectOption('co-dm');
		await expect(page.getByRole('status').filter({ hasText: /no Co-DM seats/i })).not.toHaveCount(0);
		expect(await roleOf(page, PLAYER_ACTOR)).toBe('player');

		// Cloud invites are fail-closed in e2e: the invite button shows its honest not-configured state
		// and opens NO dialog (no dead "Seat" picker behind a backend that isn't there).
		await page.getByRole('button', { name: 'Invite player' }).click();
		await expect(page.getByRole('status').filter({ hasText: /cloud backend/i })).not.toHaveCount(0);
		await expect(page.getByText('Invite a player')).toHaveCount(0);
	});

	test('the Settings roster promotes to Co-DM once the plan grants seats', async ({ page }) => {
		// Raise the device-local plan to Beacon (3 Co-DM seats) before boot.
		await bootShell(page, '/settings?tab=players', 'beacon');

		// The roster now reflects the plan entitlement: 0 of 3 seats in use.
		await expect(page.getByText(/Co-DM seats:/)).not.toHaveCount(0);
		await expect(page.getByText('0 of 3')).not.toHaveCount(0);

		const roleSelect = page.getByLabel('Role for Demo Player', { exact: true });
		await expect(roleSelect.locator('option', { hasText: 'Co-DM (0/3)' })).toHaveCount(1);

		// Promote through the real command: accepted, role mutated, success toast, seat count advances.
		await roleSelect.selectOption('co-dm');
		await expect(page.getByRole('status').filter({ hasText: /is now Co-DM/i })).not.toHaveCount(0);
		await page.waitForFunction(
			(id) =>
				(window.__rt!.state.permissions as { actors: Record<string, { role?: string }> }).actors[id]?.role ===
				'co-dm',
			PLAYER_ACTOR,
			{ timeout: 10_000 },
		);
		await expect(page.getByText('1 of 3')).not.toHaveCount(0);

		// Durable: the promotion round-trips through the op-log / IndexedDB.
		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.locator('#main-content').waitFor({ state: 'attached' });
		expect(await roleOf(page, PLAYER_ACTOR)).toBe('co-dm');
		await expect(page.getByText('1 of 3')).not.toHaveCount(0);
	});
});
