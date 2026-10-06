import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh } from './_helpers';

// HONEST PREVIEWS AND HONEST TILES — RC-WID-6.5. The builder preview draws the template the author
// picked (sample rows, labelled "Sample data", until a query exists) under the template's own name,
// a query's id follows its source until it is typed by hand, and a query can be narrowed with
// declarative options. The acceptance path: a party list filtered to player characters shows no NPC
// in the preview and on the board, and previewed as a player it shows only player-visible rows.

const PACKAGE_ID = 'workspace.party-hp';
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

interface CharacterLite {
	id: string;
	name: string;
	kind: string;
	visibility: string;
}

function characters(page: Page): Promise<CharacterLite[]> {
	return page.evaluate(() =>
		Object.values(
			(window.__rt!.state.characters as { characters: Record<string, CharacterLite> }).characters,
		).map(({ id, name, kind, visibility }) => ({ id, name, kind, visibility })),
	);
}

async function openBuilder(page: Page) {
	await markOnboarded(page);
	await gotoRoute(page, '/extensions');
	await seedFresh(page);
	await page.getByRole('button', { name: 'Build a widget' }).click();
	const dialog = page.getByRole('dialog', { name: /Widget builder/ });
	await expect(dialog).toBeVisible();
	return dialog;
}

/** The narrow layout folds the three panes behind a switch; pick one when it is present. */
async function showPane(page: Page, label: 'Edit' | 'Preview' | 'Definition') {
	const seg = page.getByRole('radiogroup', { name: 'Builder pane' });
	if (await seg.isVisible().catch(() => false)) {
		await seg.getByRole('radio', { name: label }).click();
	}
}

/** Every listed name is drawn, and nothing else: the row count matches and each name is present. */
async function expectRows(list: Locator, names: string[]) {
	await expect(list.locator('li')).toHaveCount(names.length);
	for (const name of names) await expect(list).toContainText(name);
}

test.describe('widget builder: honest previews (RC-WID-6.5)', () => {
	test('a template with no query previews under its own kind, with sample data only where rows are drawn', async ({
		page,
	}) => {
		const dialog = await openBuilder(page);
		await dialog.getByRole('button', { name: 'Data', exact: true }).click();
		await expect(dialog.getByLabel('Template kind')).toHaveValue('status-list');

		await showPane(page, 'Preview');
		const preview = dialog.getByTestId('widget-builder-preview');
		await expect(dialog.getByTestId('widget-builder-preview-eyebrow')).toHaveText('Status list');
		await expect(dialog.getByTestId('widget-builder-preview-sample')).toHaveText('Sample data');
		await expect(preview).not.toContainText('no data source');
		await expect(preview.locator('li')).toHaveCount(3);
		// The sample rows' tags use the app's words, never the stored enum.
		await expect(preview).toContainText('Player visible');
		await expect(preview).not.toContainText('player-visible');

		// An action panel needs no query: no sample rows, and no line saying a data source is missing.
		await showPane(page, 'Edit');
		await dialog.getByLabel('Template kind').selectOption('action-panel');
		await showPane(page, 'Preview');
		await expect(dialog.getByTestId('widget-builder-preview-eyebrow')).toHaveText('Action panel');
		await expect(dialog.getByTestId('widget-builder-preview-sample')).toHaveCount(0);
		await expect(preview).not.toContainText('no data source');
	});

	test('a party list filtered to PCs shows no NPC, and previewed as a player shows only player-visible rows', async ({
		page,
	}) => {
		const dialog = await openBuilder(page);
		// The seed shares each PC with its own player and keeps the NPCs DM-only. Show one of each to
		// every player, so both player previews below have rows to keep and rows to leave out.
		const seeded = await characters(page);
		const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
		for (const kind of ['pc', 'npc']) {
			const shown = seeded.find((c) => c.kind === kind);
			expect(shown, kind).toBeTruthy();
			const result = await dispatch(page, {
				type: 'character.set-sharing',
				actorId,
				payload: { characterId: shown!.id, visibility: 'player-visible' },
			});
			expect(result.status).toBe('accepted');
		}
		const cast = await characters(page);
		const pcs = cast.filter((c) => c.kind === 'pc').map((c) => c.name);
		const npcs = cast.filter((c) => c.kind === 'npc').map((c) => c.name);
		const playerVisible = cast.filter((c) => c.visibility === 'player-visible').map((c) => c.name);
		// The seed has both, or this test proves nothing.
		expect(pcs.length).toBeGreaterThan(0);
		expect(npcs.length).toBeGreaterThan(0);
		expect(playerVisible.length).toBeGreaterThan(0);
		expect(cast.some((c) => c.visibility !== 'player-visible')).toBe(true);

		await dialog.getByLabel('Name', { exact: true }).fill('Party HP');
		await dialog.getByRole('button', { name: 'Data', exact: true }).click();
		await dialog.getByRole('button', { name: 'Add data query' }).click();
		const id = dialog.getByLabel('Id', { exact: true });
		await expect(id).toHaveValue('current-combatants');

		// ── WID-7: the id follows the source while it is still the derived one.
		await dialog.getByLabel('Source').selectOption('visible-characters');
		await expect(id).toHaveValue('visible-characters');

		// ── Previewed unfiltered as a player: exactly the player-visible characters, each tagged so.
		await showPane(page, 'Preview');
		const preview = dialog.getByTestId('widget-builder-preview');
		await expect(dialog.getByTestId('widget-builder-preview-sample')).toHaveCount(0);
		const audience = dialog.getByRole('radiogroup', { name: 'Preview audience' });
		await audience.getByRole('radio', { name: 'Preview as player' }).click();
		await expectRows(preview, playerVisible);
		await expect(preview.locator('li', { hasText: 'DM only' })).toHaveCount(0);
		await expect(preview.locator('li', { hasText: 'Shared' })).toHaveCount(0);
		await expect(preview.locator('li', { hasText: 'Player visible' })).toHaveCount(
			playerVisible.length,
		);

		// ── Filter to player characters: as the DM, every PC and no NPC.
		await showPane(page, 'Edit');
		const options = dialog.getByTestId('widget-builder-query-options-0');
		await options.getByRole('checkbox', { name: 'Player characters' }).click();
		await showPane(page, 'Preview');
		await audience.getByRole('radio', { name: /^Preview as (DM|GM)$/ }).click();
		await expectRows(preview, pcs);
		for (const npc of npcs) await expect(preview).not.toContainText(npc);

		// ── The same widget previewed as a player: only rows that are player-visible PCs.
		await audience.getByRole('radio', { name: 'Preview as player' }).click();
		const visiblePcs = cast
			.filter((c) => c.kind === 'pc' && c.visibility === 'player-visible')
			.map((c) => c.name);
		await expectRows(preview, visiblePcs);
		for (const name of cast.filter((c) => c.visibility !== 'player-visible').map((c) => c.name)) {
			await expect(preview).not.toContainText(name);
		}

		// ── Install, enable and place it: the tile on the board lists the party, no NPC.
		await showPane(page, 'Edit');
		await dialog.getByRole('button', { name: 'Review', exact: true }).click();
		await dialog.getByRole('button', { name: 'Install widget' }).click();
		await expect(dialog).toHaveCount(0);
		const query = await page.evaluate(
			(packageId) =>
				(
					window.__rt!.state.widgets as {
						packages: Record<
							string,
							{ package: { widgets: Array<{ dataQueries?: Array<Record<string, unknown>> }> } }
						>;
					}
				).packages[packageId]?.package.widgets[0]?.dataQueries?.[0] ?? null,
			PACKAGE_ID,
		);
		expect(query).toMatchObject({
			id: 'visible-characters',
			source: 'visible-characters',
			options: { characterKinds: ['pc'] },
		});

		await page.getByRole('switch', { name: 'Enable Party HP' }).click();
		const sceneName = `Party Scene ${Date.now()}`;
		const created = await dispatch(page, {
			type: 'scene.create',
			actorId,
			payload: { name: sceneName, description: '', visibility: 'dm-only', tags: [] },
		});
		expect(created.status).toBe('accepted');
		const sceneId = await page.evaluate(
			(name) =>
				Object.values(window.__rt!.state.scenes.scenes).find((s) => s.name === name)?.id ?? null,
			sceneName,
		);
		await gotoRoute(page, `/scene/${sceneId}`);
		await page.getByRole('button', { name: 'Edit layout' }).click();
		await page.getByRole('button', { name: 'Add', exact: true }).click();
		await page
			.getByTestId('scene-add-widget-panel')
			.getByRole('button', { name: /Party HP/ })
			.click();
		const tile = page.getByTestId('widget-template-status-list');
		await expectRows(tile, pcs);
		for (const npc of npcs) await expect(tile).not.toContainText(npc);
	});

	test('the Show what pickers have no critical or serious axe violation', async ({ page }) => {
		const dialog = await openBuilder(page);
		await dialog.getByRole('button', { name: 'Data', exact: true }).click();
		await dialog.getByRole('button', { name: 'Add data query' }).click();
		// The character source offers every picker but the tag; add a notes query for the tag box.
		await dialog.getByLabel('Source').selectOption('visible-characters');
		await dialog.getByRole('button', { name: 'Add data query' }).click();
		await dialog.getByLabel('Source').nth(1).selectOption('notes');
		await expect(dialog.getByTestId('widget-builder-query-options-0')).toContainText('Health');
		await expect(dialog.getByTestId('widget-builder-query-options-1')).toContainText('Tag');

		const results = await new AxeBuilder({ page })
			.withTags(AXE_TAGS)
			.include('[data-fullscreen-overlay="widget-builder"]')
			.analyze();
		const blocking = results.violations.filter(
			(violation) => violation.impact === 'critical' || violation.impact === 'serious',
		);
		expect(
			blocking.map((violation) => `${violation.id}: ${violation.nodes[0]?.target.join(' ')}`),
		).toEqual([]);
	});
});
