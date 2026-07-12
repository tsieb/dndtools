import { expect, test } from '@playwright/test';
import { gotoRoute, markOnboarded, ops, seedFresh, waitReady } from './_helpers';

// GRAPH — the /graph relationship-intelligence surface. Every node/edge comes from the
// actor-filtered GRAPH-004 read (`getGraphVisualizationForActor`): the seeded vault renders as a
// real graph, search narrows it, opening a node deep-links to the entity's own surface, the
// DM/Player viewpoint toggle re-runs the read AS a player (dm-only nodes vanish at the data layer),
// and the whole surface is read-only intelligence — no mutation affordance, no op-log growth.

/** Seeded titles (demo-seed.ts). The dm-only note is the leak canary for the player viewpoint. */
const VISIBLE_NOTE = 'Campaign Primer';
const DM_ONLY_NOTE = 'The Sunken Crypt — DM notes';

test.describe('graph: relationship graph & search', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/graph');
		await seedFresh(page);
		await page.goto('/#/graph', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.locator('#main-content').waitFor({ state: 'attached' });
	});

	test('seeded entities render as a graph with real wikilink edges', async ({ page }) => {
		// Node buttons for the seeded notes exist (canvas node and/or search row — both are real reads).
		await expect(page.getByRole('button', { name: VISIBLE_NOTE })).not.toHaveCount(0);
		await expect(page.getByRole('button', { name: DM_ONLY_NOTE })).not.toHaveCount(0);

		// The count line reflects the live visualization, and the seeded [[wikilinks]] draw edges.
		await expect(page.getByText(/Showing \d+ of \d+ visible nodes?/)).not.toHaveCount(0);
		expect(await page.locator('svg line').count()).toBeGreaterThan(0);

		// DM viewpoint gets the full GRAPH-007 health report (exact counts + coverage).
		await expect(page.getByText(/% coverage/)).not.toHaveCount(0);
		await expect(page.getByText('Stale notes')).not.toHaveCount(0);
	});

	test('search finds an entity and opening it routes to its own surface', async ({ page }) => {
		await page.getByLabel('Search the graph').fill('Campaign Primer');

		// The text facet narrows the live read; select the surviving result.
		await page.getByRole('button', { name: VISIBLE_NOTE }).first().click();
		await expect(page.getByText('Selected')).not.toHaveCount(0);

		// A note node's Open action deep-links to /knowledge/:id — the entity itself, not a list.
		await page.getByRole('button', { name: 'Open note' }).click();
		await page.waitForURL(/#\/knowledge\//, { timeout: 10_000 });

		const noteId = await page.evaluate(
			(t) =>
				Object.values((window.__rt!.state.content as { items: Record<string, { id: string; title: string }> }).items).find(
					(i) => i.title === t,
				)?.id ?? null,
			VISIBLE_NOTE,
		);
		expect(noteId).toBeTruthy();
		expect(page.url()).toContain(`/knowledge/${noteId}`);
		// The Knowledge viewer mounted on the right note.
		await expect(page.locator('#main-content').getByText(VISIBLE_NOTE)).not.toHaveCount(0);
	});

	test('the player viewpoint drops dm-only nodes and generalizes health', async ({ page }) => {
		// DM viewpoint: the dm-only note is a node.
		await expect(page.getByRole('button', { name: DM_ONLY_NOTE })).not.toHaveCount(0);

		// Re-run the read AS the registered player actor.
		await page.getByRole('radio', { name: 'Player view' }).click();

		// The dm-only node is gone at the data layer; player-visible content remains.
		await expect(page.getByRole('button', { name: DM_ONLY_NOTE })).toHaveCount(0);
		await expect(page.getByRole('button', { name: VISIBLE_NOTE })).not.toHaveCount(0);

		// GRAPH-007 AC3: players get coarse bands, never the DM's exact-count report.
		await expect(page.getByText(/Players see only coarse bands/)).not.toHaveCount(0);
		await expect(page.getByText(/% coverage/)).toHaveCount(0);

		// Back to the DM viewpoint restores the full graph (the toggle has no global side-effect).
		await page.getByRole('radio', { name: 'DM view' }).click();
		await expect(page.getByRole('button', { name: DM_ONLY_NOTE })).not.toHaveCount(0);
	});

	test('the graph is read-only: no mutation affordances, no op-log growth', async ({ page }) => {
		const before = await ops(page);
		expect(before).toBeGreaterThanOrEqual(0);

		// Exercise every interaction the surface offers: select, facet, search, viewpoint.
		await page.getByRole('button', { name: VISIBLE_NOTE }).first().click();
		await expect(page.getByText('Selected')).not.toHaveCount(0);
		await page.getByRole('button', { name: 'Note', exact: true }).click(); // kind facet chip
		await page.getByLabel('Search the graph').fill('crypt');
		await page.getByLabel('Search the graph').fill('');
		await page.getByRole('radio', { name: 'Player view' }).click();
		await page.getByRole('radio', { name: 'DM view' }).click();

		// Nothing here can author or mutate content.
		await expect(page.getByRole('button', { name: /new note|new quest|new faction/i })).toHaveCount(0);
		await expect(page.getByRole('button', { name: /^delete/i })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Push to players' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: /^edit/i })).toHaveCount(0);

		// The op-log did not grow: every interaction was a pure read.
		expect(await ops(page)).toBe(before);

		// And a reload renders the same graph from the untouched durable state.
		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitReady(page);
		expect(await ops(page)).toBe(before);
		await expect(page.getByRole('button', { name: VISIBLE_NOTE })).not.toHaveCount(0);
	});
});
