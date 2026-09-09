import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh } from './_helpers';

// RC-CLD-3.3 — the standalone player companion's between-session inbox: the wiki recap feed
// (`getSessionRecapFeedForActor`), rendered by `screens/play/Inbox.tsx`. Drives the SAME path a
// real table takes to produce a recap — archive the live session, then author its recap — and
// asserts the recap the DM wrote actually reaches the player device's Inbox section.

const SEEDED_PLAYER_SCENE = 'Harbor of Saltreach'; // player-visible (co-dm.spec.ts fixture)
const RECAP_MARKDOWN = 'The party found the harbor and lit the lamps against the coming storm.';

/** Live the session through `active` → `recap` (which archives it), then author a recap on it. */
async function archiveAndAuthorRecap(page: Page): Promise<void> {
	const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
	const sceneId = await page.evaluate(
		(name) =>
			Object.values(window.__rt!.state.scenes.scenes).find((s) => s.name === name)?.id ?? null,
		SEEDED_PLAYER_SCENE,
	);
	expect(sceneId).not.toBeNull();

	const started = await dispatch(page, {
		type: 'session.set-workflow',
		actorId,
		payload: { workflow: 'active', activeSceneId: sceneId },
	});
	expect(started.status).toBe('accepted');

	const archived = await dispatch(page, {
		type: 'session.set-workflow',
		actorId,
		payload: { workflow: 'recap' },
	});
	expect(archived.status).toBe('accepted');
	const archiveId = archived.events?.find((e) => e.kind === 'session.archived')?.archiveId as
		| string
		| undefined;
	expect(archiveId).toBeTruthy();

	const authored = await dispatch(page, {
		type: 'session.author-recap',
		actorId,
		payload: { archiveId, markdown: RECAP_MARKDOWN },
	});
	expect(authored.status).toBe('accepted');
}

test.describe('player companion: the between-session inbox', () => {
	test("shows the DM's authored recap in the wiki recap feed", async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/session');
		await seedFresh(page);
		await archiveAndAuthorRecap(page);

		await page.goto('/#/play', { waitUntil: 'domcontentloaded' });
		await page.waitForFunction(() => !!window.__rt && window.__rt.loaded === true, null, {
			timeout: 20_000,
		});
		await page.getByRole('main').first().waitFor({ timeout: 20_000 });
		await page.getByRole('button', { name: 'Inbox', exact: true }).click();

		const recap = page.getByTestId('inbox-recap').first();
		await expect(recap).toBeVisible();
		// The session was never named, so the card falls back to the honest "Session recap" label.
		await expect(recap).toContainText('Session recap');
		// It opens by default (the most recent entry), showing the DM-authored markdown.
		await expect(recap).toContainText(RECAP_MARKDOWN);
	});

	test('shows the honest empty state before any recap has been authored', async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/session');
		await seedFresh(page);

		await page.goto('/#/play', { waitUntil: 'domcontentloaded' });
		await page.waitForFunction(() => !!window.__rt && window.__rt.loaded === true, null, {
			timeout: 20_000,
		});
		await page.getByRole('main').first().waitFor({ timeout: 20_000 });
		await page.getByRole('button', { name: 'Inbox', exact: true }).click();

		await expect(page.getByTestId('inbox-recap')).toHaveCount(0);
		await expect(page.getByRole('main')).toContainText('No recaps yet');
	});
});
