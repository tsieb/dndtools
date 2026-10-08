import { expect, test, type Page } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh } from './_helpers';

// RC-CAN-7.8 — the session quick panel (RC-SES-1.2) is shell chrome, not part of the Session
// console, so turning `/session` into a screen of widgets must leave it working everywhere: on every
// primary route of a live session, the quick panel's d20 rolls through the core and shows the roll.

const ROUTES = [
	'/',
	'/board',
	'/session',
	'/screens',
	'/characters',
	'/atlas',
	'/campaign',
	'/knowledge',
	'/audio',
	'/settings',
];

/** The session's roll count, read from the core. */
function rollCount(page: Page): Promise<number> {
	return page.evaluate(() => {
		const state = window.__rt!.state as unknown as { session: { diceHistory: unknown[] } };
		return state.session.diceHistory.length;
	});
}

/** Open the quick panel for this viewport: desktop has the rail already, narrower tiers a sheet. */
async function openQuickPanel(page: Page): Promise<void> {
	const trigger = page.getByTestId('session-quick-trigger');
	if (await trigger.isVisible()) await trigger.click();
	await expect(page.getByTestId('quick-die-d20')).toBeVisible();
}

async function closeQuickPanel(page: Page): Promise<void> {
	if (await page.getByTestId('session-quick-sheet').isVisible()) {
		await page.keyboard.press('Escape');
		await expect(page.getByTestId('session-quick-sheet')).toBeHidden();
	}
}

test('the quick panel rolls on every route while the session is live', async ({ page }) => {
	await markOnboarded(page);
	await gotoRoute(page, '/');
	await seedFresh(page);
	await gotoRoute(page, '/');
	const live = await page.evaluate(async () => {
		const rt = window.__rt!;
		const state = rt.state as unknown as {
			scenes: { scenes: Record<string, { id: string; isTemplate?: boolean }> };
			commandCenter: { homeSceneId: string | null };
		};
		const sceneId =
			state.commandCenter.homeSceneId ??
			Object.values(state.scenes.scenes).find((scene) => !scene.isTemplate)?.id;
		return rt.dispatch({
			type: 'session.set-workflow',
			actorId: rt.defaultActorId,
			payload: { workflow: 'active', activeSceneId: sceneId },
		});
	});
	expect(live.status).toBe('accepted');

	for (const route of ROUTES) {
		await gotoRoute(page, route);
		await openQuickPanel(page);
		const before = await rollCount(page);
		await page.getByTestId('quick-die-d20').click();
		await expect.poll(() => rollCount(page), { message: route }).toBe(before + 1);
		await expect(page.getByTestId('quick-last-roll'), route).toBeVisible();
		await closeQuickPanel(page);
	}
});
