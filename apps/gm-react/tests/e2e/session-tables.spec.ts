import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh } from './_helpers';

// RC-SES-2.3 — the /session rollable-tables tab: list the `dice-table` Vault Objects, draw one into
// the session roll log with `source: 'table'`, pin it to quick reference, and say so plainly when a
// vault holds no tables at all.

/** Take the session live on the first available scene, as the DM would. */
async function goLive(page: Page): Promise<void> {
	const result = await page.evaluate(async () => {
		const rt = window.__rt!;
		const state = rt.state as unknown as {
			session: { activeSceneId: string | null };
			commandCenter: { homeSceneId: string | null };
			scenes: { scenes: Record<string, { id: string; isTemplate?: boolean }> };
		};
		const sceneId =
			state.session.activeSceneId ??
			state.commandCenter.homeSceneId ??
			Object.values(state.scenes.scenes).find((s) => !s.isTemplate)?.id;
		return rt.dispatch({
			type: 'session.set-workflow',
			actorId: rt.defaultActorId,
			payload: { workflow: 'active', activeSceneId: sceneId },
		});
	});
	expect(result.status, result.rejection?.message ?? '').toBe('accepted');
}

/** Create a rollable `dice-table` Vault Object and return its content-item id. */
async function createTable(page: Page, title: string, entries: string[]): Promise<string> {
	const result = await dispatch(page, {
		type: 'content.create-item',
		actorId: 'dm-1',
		payload: {
			kind: 'object',
			title,
			body: '',
			fields: {
				'dndtools.objectSubtype': 'dice-table',
				dice: `1d${entries.length}`,
				entries,
			},
		},
	});
	expect(result.status, result.rejection?.message ?? '').toBe('accepted');
	const event = (result.events ?? []).find((e) => e.kind === 'content.item-changed');
	expect(event, 'no content.item-changed event').toBeTruthy();
	return event!.itemId as string;
}

test.beforeEach(async ({ page }) => {
	await markOnboarded(page);
	await gotoRoute(page, '/session');
	await seedFresh(page);
	await gotoRoute(page, '/session');
	await goLive(page);
});

test('a vault with no tables says so instead of showing an empty list', async ({ page }) => {
	await expect(page.getByText('No rollable tables yet.', { exact: true })).toBeVisible();
});

test('rolling a table draws a row and records it in the session roll log', async ({ page }) => {
	const tableId = await createTable(page, 'Wilderness omens', [
		'A raven follows the party.',
		'The road is washed out.',
	]);

	const row = page.getByTestId(`table-row-${tableId}`);
	await expect(row).toBeVisible();
	await expect(row.getByText('Wilderness omens', { exact: true })).toBeVisible();

	await row.getByRole('button', { name: 'Roll', exact: true }).click();

	// The drawn row shows on the table, and the SAME draw is in the durable roll history as a
	// `table`-sourced roll carrying the row it selected.
	await expect(page.getByTestId(`table-draw-${tableId}`)).toBeVisible();
	const recorded = await page.evaluate((id) => {
		const history = (
			window.__rt!.state as unknown as {
				session: {
					diceHistory: Array<{
						sourceKind?: string;
						tableItemId?: string;
						tableRowNumber?: number;
						tableRowText?: string;
					}>;
				};
			}
		).session.diceHistory;
		return history.filter((r) => r.sourceKind === 'table' && r.tableItemId === id);
	}, tableId);
	expect(recorded).toHaveLength(1);
	expect(recorded[0]!.tableRowNumber).toBeGreaterThanOrEqual(1);
	expect(['A raven follows the party.', 'The road is washed out.']).toContain(
		recorded[0]!.tableRowText,
	);
});

test('a table pins to quick reference and unpins again, from the keyboard', async ({ page }) => {
	const tableId = await createTable(page, 'Tavern patrons', [
		'A retired sellsword.',
		'A tax collector.',
	]);
	const row = page.getByTestId(`table-row-${tableId}`);

	const pin = row.getByRole('button', { name: 'Pin Tavern patrons to quick reference' });
	await pin.focus();
	await page.keyboard.press('Enter');

	// The pin is durable session state, resolved through the quick-reference read.
	await expect(
		row.getByRole('button', { name: 'Unpin Tavern patrons from quick reference' }),
	).toBeVisible();
	const pinned = await page.evaluate(() =>
		Object.values(
			(
				window.__rt!.state as unknown as {
					session: { quickReferencePanels: Record<string, { kind: string; label: string }> };
				}
			).session.quickReferencePanels,
		),
	);
	expect(pinned).toHaveLength(1);
	expect(pinned[0]).toMatchObject({ kind: 'dice-table', label: 'Tavern patrons' });

	await row.getByRole('button', { name: 'Unpin Tavern patrons from quick reference' }).click();
	await expect(pin).toBeVisible();
});
