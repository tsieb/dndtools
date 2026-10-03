import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh } from './_helpers';

// WIDGET BUILDER — RC-WID-5.2. The Data step lists every query source with a live preview: what
// the source holds right now for the author, and how many rows a player with no extra grants would
// get. Each query card the author adds shows the same live reading for its own declaration.
//
// The previews run the same resolver a placed widget uses, so the DM-only screen created below
// must be counted for the DM and not for the player, in the catalogue and on a query card alike.

/** `ALL_WIDGET_DATA_QUERY_SOURCES`, in order. Repeated here because e2e specs import core types only. */
const SOURCES = [
	'current-combatants',
	'visible-characters',
	'selected-scene',
	'session-state',
	'notes',
	'maps',
	'content-objects',
	'binding',
	'screens',
	'vault-counts',
	'party',
	'campaign',
	'dice-history',
	'handouts',
	'rollable-tables',
	'quick-reference',
	'session-archives',
	'continuity-digest',
	'rest-log',
	'presence',
	'player-projections',
	'initiative-call',
	'combatant-status',
	'capture-candidates',
	'widget-library',
];

const SECRET_SCREEN = 'Smugglers’ hold — RC-WID-5.2';

async function openDataStep(page: Page): Promise<Locator> {
	await markOnboarded(page);
	await gotoRoute(page, '/extensions');
	await seedFresh(page);
	const created = await dispatch(page, {
		type: 'scene.create',
		actorId: await page.evaluate(() => window.__rt!.defaultActorId),
		payload: { name: SECRET_SCREEN, description: '', visibility: 'dm-only', tags: [] },
	});
	expect(created.status).toBe('accepted');
	await page.getByRole('button', { name: 'Build a widget' }).click();
	const dialog = page.getByRole('dialog', { name: /Widget builder/ });
	await expect(dialog).toBeVisible();
	await dialog.getByLabel('Name', { exact: true }).fill('Hub sources');
	await dialog.getByRole('button', { name: 'Data', exact: true }).click();
	return dialog;
}

/** The number in a "For you: N rows" / "For a player: N rows" line. */
async function countOf(line: Locator): Promise<number> {
	const text = (await line.textContent()) ?? '';
	const match = text.match(/(\d+) rows?/);
	if (!match) throw new Error(`no row count in "${text}"`);
	return Number(match[1]);
}

test.describe('widget builder: query sources (RC-WID-5.2)', () => {
	test('the Data step lists every source with a live preview', async ({ page }) => {
		const dialog = await openDataStep(page);

		// ── The source picker offers every source.
		await dialog.getByRole('button', { name: 'Add data query' }).click();
		const picker = dialog.getByLabel('Source');
		const offered = await picker
			.locator('option')
			.evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
		expect(offered).toEqual(SOURCES);

		// ── The catalogue lists every source, each with a reading for the author and for a player.
		const catalogue = dialog.getByTestId('widget-builder-source-catalogue');
		await catalogue.getByText(`Show all ${SOURCES.length} sources`).click();
		await expect(catalogue.locator('[data-source]')).toHaveCount(SOURCES.length);
		for (const source of SOURCES) {
			const preview = catalogue.getByTestId(`widget-builder-source-preview-${source}`);
			await expect(preview, source).toBeVisible();
			await expect(preview, source).toContainText(/For you: \d+ rows?/);
			await expect(
				preview.getByTestId(`widget-builder-source-preview-${source}-player`),
				source,
			).toHaveText(/^For a player: (\d+ rows?|not shown)$/);
		}

		// ── The readings are live and per audience: the DM-only screen counts for the DM only.
		const screens = catalogue.getByTestId('widget-builder-source-preview-screens');
		const dmScreens = await countOf(screens.getByText(/^For you:/));
		const playerScreens = await countOf(
			screens.getByTestId('widget-builder-source-preview-screens-player'),
		);
		expect(dmScreens).toBeGreaterThan(playerScreens);
		// A DM-only core read (the quick-reference pins) gives a player nothing.
		await expect(
			catalogue.getByTestId('widget-builder-source-preview-quick-reference-player'),
		).toHaveText('For a player: 0 rows');

		// ── A query card previews its own declaration, and follows a change of source.
		await picker.selectOption('screens');
		const card = dialog.getByTestId('widget-builder-query-preview-0');
		await expect(card).toContainText(`For you: ${dmScreens} rows`);
		await expect(dialog.getByTestId('widget-builder-query-preview-0-player')).toHaveText(
			`For a player: ${playerScreens} ${playerScreens === 1 ? 'row' : 'rows'}`,
		);
		await expect(card.getByRole('listitem').first()).toBeVisible();

		// ── Declared DM-only, the same query is not shown to a player at all.
		await dialog.getByRole('combobox', { name: 'Audience' }).selectOption('dm');
		await expect(dialog.getByTestId('widget-builder-query-preview-0-player')).toHaveText(
			'For a player: not shown',
		);
	});

	test('the open catalogue has no critical or serious axe violation', async ({ page }) => {
		const dialog = await openDataStep(page);
		await dialog.getByRole('button', { name: 'Add data query' }).click();
		const catalogue = dialog.getByTestId('widget-builder-source-catalogue');
		await catalogue.getByText(`Show all ${SOURCES.length} sources`).click();
		await expect(catalogue.locator('[data-source]')).toHaveCount(SOURCES.length);
		const results = await new AxeBuilder({ page })
			.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
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
