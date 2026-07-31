import { expect, test } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// ATLAS — /atlas. This file covers the screen's single notice banner, which is a genuinely mixed
// channel: "Link copied" and "Projected to N players" share it with every command rejection.
//
// Two defects lived there. Atlas's `run()` never cleared the notice on a successful dispatch (the
// map editor's otherwise-identical `run` does), so a refusal outlived every later action — project
// with no live session, then start the session, toggle a layer, create a map, and the banner still
// said "there is no live session". And every message, refusal included, rendered as a polite
// `role="status"` with a blue info glyph, so a hard NO looked exactly like a confirmation.

const MAIN = '#main-content';

test.describe('atlas: the notice banner tells the truth about what just happened', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/atlas');
		await seedFresh(page);
		await page.goto('/#/atlas', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.locator(MAIN).waitFor({ state: 'attached' });
	});

	test('a rejection announces assertively, and the next success clears it', async ({ page }) => {
		const project = page.getByRole('button', { name: 'Project to players' });
		await expect(project).toBeVisible();

		// No live session on a fresh vault, so the Core refuses. That refusal must reach the user as
		// an alert, not as a polite status update in the same skin a success would use.
		await project.click();
		const notice = page.locator(`${MAIN} [role="alert"]`);
		await expect(notice).toHaveCount(1);
		const refusal = (await notice.innerText()).trim();
		expect(refusal.length).toBeGreaterThan(0);

		// A later action that succeeds must not leave the refusal standing. Toggling a layer's
		// visibility is a plain accepted dispatch that writes no message of its own.
		const layerSwitch = page.getByRole('switch', { name: /^Show .+ on the map$/ }).first();
		await expect(layerSwitch).toBeVisible();
		await layerSwitch.click();

		await expect(
			page.locator(`${MAIN} [role="alert"], ${MAIN} [role="status"]`).filter({ hasText: refusal }),
		).toHaveCount(0);
	});

	test('the refusal is dismissible and does not come back on its own', async ({ page }) => {
		await page.getByRole('button', { name: 'Project to players' }).click();
		await expect(page.locator(`${MAIN} [role="alert"]`)).toHaveCount(1);

		await page.getByRole('button', { name: 'Dismiss notice' }).click();
		await expect(page.locator(`${MAIN} [role="alert"]`)).toHaveCount(0);
	});

	// `run()` clears the notice only on an ACCEPTED dispatch, but the loudest notices on this screen
	// are set outside any dispatch (an unavailable deep link, a clipboard failure). Switching maps
	// therefore left an assertive alert standing above a map it had nothing to do with.
	test('switching maps clears a notice left over from the previous one', async ({ page }) => {
		await page.getByRole('button', { name: 'Project to players' }).click();
		const notice = page.locator(`${MAIN} [role="alert"]`);
		await expect(notice).toHaveCount(1);

		// The seeded vault carries three maps; open one other than the current chip.
		const otherChip = page.getByRole('button', { name: /Ruined Keep/ }).first();
		await expect(otherChip).toBeVisible();
		await otherChip.click();

		await expect(otherChip).toHaveAttribute('aria-current', 'true');
		await expect(notice).toHaveCount(0);
	});
});

test.describe('atlas: layer and POI rows state their own state', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/atlas');
		await seedFresh(page);
		await page.goto('/#/atlas', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.locator(MAIN).waitFor({ state: 'attached' });
	});

	// The POI row's only selection cue was the label turning accent-coloured — colour alone
	// (WCAG 1.4.1 / 4.1.2). The map chips and Graph's nodes already expose theirs.
	test('a POI row exposes its highlight state, not just a colour', async ({ page }) => {
		// The screen opens on Hidden Outpost, which has no POIs; the seeded ones live on the region map.
		await page
			.getByRole('button', { name: /Western Reaches/ })
			.first()
			.click();

		const harbor = page.getByRole('button', { name: 'Highlight Harbor Town on the map' });
		const cache = page.getByRole('button', { name: "Highlight Smugglers' Cache on the map" });
		await expect(harbor).toBeVisible();
		await expect(harbor).toHaveAttribute('aria-pressed', 'false');
		await expect(cache).toHaveAttribute('aria-pressed', 'false');

		await harbor.click();
		await expect(harbor).toHaveAttribute('aria-pressed', 'true');
		await expect(cache).toHaveAttribute('aria-pressed', 'false');

		// Selection is single-valued, so picking another POI releases the first.
		await cache.click();
		await expect(cache).toHaveAttribute('aria-pressed', 'true');
		await expect(harbor).toHaveAttribute('aria-pressed', 'false');
	});

	// `locked` was never rendered, so the only way to discover a locked layer was to act on it and
	// be refused ("Layer … is locked and rejects this edit").
	test('a locked layer says so before you are refused', async ({ page }) => {
		// Seed onto whichever map the screen has open, so the new layer is in the rendered list.
		const mapId = await page.evaluate(() => {
			const maps = window.__rt!.state.maps.maps as Record<string, { id: string; name: string }>;
			return Object.values(maps).find((m) => m.name === 'Hidden Outpost')!.id;
		});
		const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
		const result = await dispatch(page, {
			type: 'map.create-layer',
			actorId,
			payload: { mapId, name: 'Sealed Vault', locked: true },
		});
		expect(result.status).toBe('accepted');

		await expect(page.getByText(/Sealed Vault/)).not.toHaveCount(0);
		await expect(page.getByText(/· locked/)).not.toHaveCount(0);
	});
	// Atlas mounts `MapCanvas` READ-ONLY (no `editable`, no `onPan`) at a fixed 560px, but the well
	// declared `touchAction:'none'` unconditionally while `onWellPointerDown` returns immediately for
	// a non-editable canvas. So on a handset a block taller than half the page claimed every touch
	// gesture and then dropped it: the page could not be scrolled from anywhere on the map, leaving
	// the Layers / POI / Fog rails beneath it unreachable. `SceneBoardCanvas` already makes exactly
	// this distinction for its bounded policy.
	test('the read-only map preview lets the page scroll through it', async ({ page }) => {
		const well = page.locator('[data-testid="map-canvas-well"]').first();
		await expect(well).toBeVisible({ timeout: 10_000 });
		await expect(well).toHaveCSS('touch-action', 'pan-y');
	});
});

// `deliveredMapIdsForActor` answers "what is on THIS actor's screen", and `activeMapProjections` is
// keyed by player id only — `session.project-active-map` rejects any DM-authority target outright.
// So for the DM, the one actor who ever sees this chip row with its authoring controls, the set was
// permanently EMPTY: the live dot and its sr-only word were dead code. After "Project to players"
// the only feedback was the dismissible notice bar, and once that was dismissed — or the map was
// switched, or the page reloaded — nothing on screen said which map was on the table.
test.describe('atlas: the DM can see which map is on the players’ screens', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/atlas');
		await seedFresh(page);
		await page.goto('/#/atlas', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.locator(MAIN).waitFor({ state: 'attached' });
		// Projecting is gated on a live session (`session-workflow.ts` puts it behind `live-session`).
		const live = await dispatch(page, {
			type: 'session.set-workflow',
			actorId: await page.evaluate(() => window.__rt!.defaultActorId),
			payload: {
				workflow: 'active',
				activeSceneId: await page.evaluate(() => {
					const state = window.__rt!.state as unknown as {
						session: { activeSceneId: string | null };
						commandCenter: { homeSceneId: string | null };
						scenes: { scenes: Record<string, { id: string; isTemplate?: boolean }> };
					};
					return (
						state.session.activeSceneId ??
						state.commandCenter.homeSceneId ??
						Object.values(state.scenes.scenes).find((s) => !s.isTemplate)?.id ??
						null
					);
				}),
			},
		});
		expect(live.status, live.rejection?.message ?? '').toBe('accepted');
		// `session.set-active-map` writes through the Command Center's active-map WIDGET, so without a
		// home Scene the whole Project flow is refused before it reaches the projection.
		const home = await dispatch(page, {
			type: 'command-center.ensure-home',
			actorId: await page.evaluate(() => window.__rt!.defaultActorId),
			payload: {},
		});
		expect(home.status, home.rejection?.message ?? '').toBe('accepted');
	});

	test('marks the projected map, and only that map, after Project to players', async ({ page }) => {
		const project = page.getByRole('button', { name: 'Project to players' });
		await expect(project).toBeVisible();

		// Nothing is projected yet, so no chip claims to be live.
		await expect(page.getByRole('button', { name: /Live to players/ })).toHaveCount(0);

		// The screen opens on Hidden Outpost (the seeded POIs live on Western Reaches).
		const open = page.locator(`${MAIN} button[aria-current="true"]`).first();
		await expect(open).toBeVisible();
		const openName = (await open.innerText()).trim();
		expect(openName.length).toBeGreaterThan(0);

		await project.click();
		await expect(page.getByText(/Projected .+ to \d+ player/)).not.toHaveCount(0);

		// Exactly one chip — the one that was open — now says it is on the players' screens, and the
		// word rides in the accessible name so the pulsing dot is not the only cue (WCAG 1.4.1, and
		// forced-colors flattens the dot's status colour away entirely).
		const liveChips = page.getByRole('button', { name: /Live to players/ });
		await expect(liveChips).toHaveCount(1);
		await expect(liveChips.first()).toContainText(openName);

		// And it survives the notice being dismissed, which is the whole point — the banner was the
		// only feedback there had ever been.
		const dismiss = page.getByRole('button', { name: 'Dismiss notice' });
		if ((await dismiss.count()) > 0) await dismiss.click();
		await expect(page.getByRole('button', { name: /Live to players/ })).toHaveCount(1);
	});
});
