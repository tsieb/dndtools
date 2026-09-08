import { expect, test } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, ops, seedFresh, waitReady } from './_helpers';

// RC-KNW-3.3 — the /campaign/relationships typed-edge editor. An edge is `relations:` front matter on
// the source note, read through the actor-filtered `getTypedRelationshipEdgesForActor` (built on the
// SAME visible-note set GRAPH-002 uses) and written through the existing `content.update-item` command
// — no parallel mutation path, no new schema.

const FACTION_TITLE = 'The Ashen Hand';
const NPC_TITLE = 'Marrow Vane';

test.describe('campaign: relationship editor', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/campaign');
		await seedFresh(page);
		await page.goto('/#/campaign', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.locator('#main-content').waitFor({ state: 'attached' });

		const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
		for (const title of [FACTION_TITLE, NPC_TITLE]) {
			const result = await dispatch(page, {
				type: 'content.create-item',
				actorId,
				payload: { kind: 'note', title, body: `About ${title}.` },
			});
			expect(result.status, result.rejection?.message ?? '').toBe('accepted');
		}
	});

	test('adds a typed edge, shows it in the graph, and removes it again', async ({ page }) => {
		await page.getByRole('button', { name: 'Relationships' }).click();
		await page.waitForURL(/#\/campaign\/relationships/, { timeout: 10_000 });
		await expect(page.getByText('No relationships declared yet.')).not.toHaveCount(0);

		await page.getByLabel('From').selectOption({ label: FACTION_TITLE });
		await page.getByLabel('Relationship').fill('leads');
		await page.getByLabel('To').selectOption({ label: NPC_TITLE });
		const before = await ops(page);
		await page.getByRole('button', { name: 'Add', exact: true }).click();

		await expect(page.getByText('Relationship added.')).not.toHaveCount(0);
		expect(await ops(page)).toBeGreaterThan(before);
		await expect(page.getByText('No relationships declared yet.')).toHaveCount(0);
		// The verb shows up in the edge list row AND as the graph canvas's edge label.
		await expect(page.getByText('leads')).not.toHaveCount(0);
		// Both note titles render as graph canvas nodes AND in the edge list row.
		await expect(page.getByText(FACTION_TITLE)).not.toHaveCount(0);
		await expect(page.getByText(NPC_TITLE)).not.toHaveCount(0);

		// The declaration really landed in the source note's front matter.
		const body: string = await page.evaluate(
			(title) =>
				Object.values(
					(window.__rt!.state.content as { items: Record<string, { title: string; body: string }> })
						.items,
				).find((i) => i.title === title)?.body ?? '',
			FACTION_TITLE,
		);
		expect(body).toContain('leads :: Marrow Vane');

		await page.getByRole('button', { name: `Remove: ${FACTION_TITLE} → ${NPC_TITLE}` }).click();
		await expect(page.getByText('Relationship removed.')).not.toHaveCount(0);
		await expect(page.getByText('No relationships declared yet.')).not.toHaveCount(0);
	});

	test('the Add control stays disabled until source, verb and target are all set', async ({
		page,
	}) => {
		await page.goto('/#/campaign/relationships', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		const addButton = page.getByRole('button', { name: 'Add', exact: true });
		await expect(addButton).toBeDisabled();

		await page.getByLabel('From').selectOption({ label: FACTION_TITLE });
		await expect(addButton).toBeDisabled();
		await page.getByLabel('Relationship').fill('leads');
		await expect(addButton).toBeDisabled();
		await page.getByLabel('To').selectOption({ label: NPC_TITLE });
		await expect(addButton).toBeEnabled();

		// Choosing the SAME note on both sides refuses a self-edge.
		await page.getByLabel('To').selectOption({ label: FACTION_TITLE });
		await expect(addButton).toBeDisabled();
	});

	test('back navigates to Story', async ({ page }) => {
		await page.goto('/#/campaign/relationships', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page
			.getByRole('navigation', { name: 'Breadcrumb' })
			.getByRole('button', { name: 'Story' })
			.click();
		await page.waitForURL(/#\/campaign$/, { timeout: 10_000 });
	});
});
