import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

/**
 * STARTER LIBRARY — RC-WID-1.6. The seven bundled packages, installed the way a DM installs them
 * (one button each in Extensions), then reviewed, enabled and placed on one scene together.
 *
 * The acceptance is "placeable and functional", so the assertions are about what appears in the
 * frame, not about state: six templates drawn by the host's own renderers and one sandboxed card
 * running its own code. The Table Roller is then pressed, because a starter whose one button cannot
 * complete a roll would be a shell with a nicer name.
 */

interface Starter {
	packageId: string;
	name: string;
	widgetType: string;
	/** The rendered thing that proves this starter drew: a template body, or the sandbox frame. */
	selector: string;
}

const STARTERS: Starter[] = [
	{
		packageId: 'starter.table-roller',
		name: 'Table Roller',
		widgetType: 'table-roller',
		selector: '[data-testid="widget-template-action-panel"]',
	},
	{
		packageId: 'starter.countdown-clock',
		name: 'Countdown Clock',
		widgetType: 'countdown-clock',
		selector: '[data-testid="widget-template-tracker"]',
	},
	{
		packageId: 'starter.weather-tracker',
		name: 'Weather Tracker',
		widgetType: 'weather-tracker',
		selector: '[data-testid="widget-template-tracker"]',
	},
	{
		packageId: 'starter.rumor-board',
		name: 'Rumor Board',
		widgetType: 'rumor-board',
		selector: '[data-testid="widget-template-scene-message"]',
	},
	{
		packageId: 'starter.npc-quick-card',
		name: 'NPC Quick Card',
		widgetType: 'npc-quick-card',
		selector: '[data-testid="widget-template-stat-block"]',
	},
	{
		packageId: 'starter.loot-ledger',
		name: 'Party Loot Ledger',
		widgetType: 'loot-ledger',
		selector: '[data-testid="widget-template-data-table"]',
	},
	{
		packageId: 'starter.torchlight',
		name: 'Torchlight',
		widgetType: 'torchlight',
		selector: 'iframe[data-widget-sandbox="torchlight"]',
	},
];

async function actorId(page: Page): Promise<string> {
	return page.evaluate(() => window.__rt!.defaultActorId);
}

async function accept(page: Page, command: Record<string, unknown>) {
	const result = await dispatch(page, command);
	expect(result.status, `${command.type}: ${JSON.stringify(result.rejection)}`).toBe('accepted');
}

test.describe('starter widget library', () => {
	test('every starter installs, enables, places and draws', async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/extensions');
		await seedFresh(page);
		await gotoRoute(page, '/extensions');
		await waitReady(page);

		// Install all seven from the library, one button each.
		for (const starter of STARTERS) {
			await page.getByRole('button', { name: `Install ${starter.name}` }).click();
			await expect(page.getByTestId(`package-card-${starter.packageId}`)).toBeVisible();
		}

		const actor = await actorId(page);
		for (const starter of STARTERS) {
			await accept(page, {
				type: 'widget.package.review',
				actorId: actor,
				payload: { packageId: starter.packageId, trustState: 'trusted' },
			});
			await accept(page, {
				type: 'widget.package.enable',
				actorId: actor,
				payload: { packageId: starter.packageId },
			});
		}

		await accept(page, {
			type: 'scene.create',
			actorId: actor,
			payload: { name: 'Starter shelf', description: '', visibility: 'dm-only', tags: [] },
		});
		const sceneId = await page.evaluate(
			() =>
				Object.values(window.__rt!.state.scenes.scenes).find(
					(scene) => scene.name === 'Starter shelf',
				)?.id ?? null,
		);
		expect(sceneId).toBeTruthy();

		// The Table Roller's roll writes to the session, which the core only allows while a session is
		// running — the same rule the built-in dice widget lives under.
		await accept(page, {
			type: 'session.set-workflow',
			actorId: actor,
			payload: { workflow: 'active', activeSceneId: sceneId },
		});

		for (const [index, starter] of STARTERS.entries()) {
			await accept(page, {
				type: 'scene.add-widget',
				actorId: actor,
				payload: {
					sceneId,
					widget: {
						type: starter.widgetType,
						version: '1.0.0',
						layout: { x: 40, y: 40 + index * 240, w: 340, h: 220 },
						configuration: {},
						localState: {},
						binding: null,
					},
				},
			});
		}

		// Seven installs left seven toasts stacked over the bottom edge — which on a phone is exactly
		// where the board is. Reload so the scene is judged on what it draws, not on leftover chrome.
		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await gotoRoute(page, `/scene/${sceneId}`);
		await waitReady(page);
		for (const starter of STARTERS) {
			await expect(
				page.locator(starter.selector).first(),
				`${starter.widgetType} did not draw`,
			).toBeVisible();
		}
		// Two trackers were placed, so the tracker body must appear twice — the second one is not
		// hiding behind the first.
		await expect(page.locator('[data-testid="widget-template-tracker"]')).toHaveCount(2);
		// Nothing fell back to the "disabled, preserved" card.
		await expect(page.getByText('Disabled, preserved')).toHaveCount(0);

		// The sandboxed card ran its own code and drew its reading.
		await expect(
			page.frameLocator('iframe[data-widget-sandbox="torchlight"]').locator('[data-reading]'),
		).toContainText('of 10');

		// And the Table Roller actually rolls: its declared `dice.roll` reaches the session engine.
		const before = await page.evaluate(() => window.__rt!.state.session.diceHistory.length);
		await page.getByRole('button', { name: 'Roll the table' }).click();
		await expect
			.poll(() => page.evaluate(() => window.__rt!.state.session.diceHistory.length))
			.toBe(before + 1);
	});
});
