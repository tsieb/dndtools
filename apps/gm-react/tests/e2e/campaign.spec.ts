import { expect, test, type Page } from '@playwright/test';
import {
	dispatch,
	enterPreview,
	exitPreview,
	gotoRoute,
	markOnboarded,
	ops,
	seedFresh,
	waitReady,
} from './_helpers';

// CAMPAIGN — the /campaign story surface. Quests and factions are real note-backed Vault Objects
// (`content.create-object` / `content.update-object`, subtypes `quest` / `faction`) authored through
// the REAL editors; the tab bar is the surface's filter UI; visibility is proven with `enterPreview`
// (including the CONTENT-013 field projection: a faction's dm-only `secret` is OMITTED from a player
// preview even when the faction itself is player-visible). Mutations must survive a full reload.

/** Loose object-item shape read off `__rt.state.content.items` (raw, NOT actor-filtered). */
interface ObjectLite {
	id: string;
	kind: string;
	title: string;
	visibility: string;
	fields: Record<string, unknown>;
}

function findObject(page: Page, title: string): Promise<ObjectLite | null> {
	return page.evaluate((t) => {
		const items = (window.__rt!.state.content as { items: Record<string, ObjectLite> }).items;
		return Object.values(items).find((i) => i.title === t) ?? null;
	}, title);
}

async function createQuestViaCore(page: Page, title: string, visibility: string): Promise<void> {
	const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
	const result = await dispatch(page, {
		type: 'content.create-object',
		actorId,
		payload: {
			subtype: 'quest',
			title,
			fields: {
				title,
				status: 'active',
				objectives: [{ id: `obj-${Date.now()}`, text: 'Do the thing', done: false }],
			},
			body: 'A thread for the table.',
			visibility,
		},
	});
	expect(result.status).toBe('accepted');
}

test.describe('campaign: story objects', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/campaign');
		await seedFresh(page);
		await page.goto('/#/campaign', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.locator('#main-content').waitFor({ state: 'attached' });
	});

	test('a quest authored in the editor persists and its tracker mutates durably', async ({
		page,
	}) => {
		const title = `Wake of the Drowned God ${Date.now()}`;
		const before = await ops(page);

		// The seeded vault has no quests: the Quests tab offers the honest empty-state entry point.
		await page.getByRole('button', { name: 'Create the first quest' }).click();
		await page.getByLabel('Title', { exact: true }).fill(title);
		await page
			.getByLabel('Objectives')
			.fill('Find who is buying the shipments\nMap the flooded vault level');
		await page.getByLabel('Hook & journal').fill('Trace the tithe barrels back upriver.');
		await page.getByRole('button', { name: 'Create quest' }).click();

		// The quest is a real `quest`-subtype Vault Object with declared tracker fields.
		await page.waitForFunction(
			(t) =>
				Object.values(
					(window.__rt!.state.content as { items: Record<string, { title: string }> }).items,
				).some((i) => i.title === t),
			title,
			{ timeout: 10_000 },
		);
		let quest = await findObject(page, title);
		expect(quest?.kind).toBe('object');
		expect(quest?.visibility).toBe('dm-only'); // the editor's default fails closed
		expect((quest?.fields.objectives as unknown[]).length).toBe(2);
		expect(await ops(page)).toBeGreaterThan(before);
		await expect(page.getByText(title)).not.toHaveCount(0);
		await expect(page.getByText('0/2')).not.toHaveCount(0);

		// Toggling an objective is a durable content.update-object write, not display state.
		await page.getByRole('button', { name: 'Find who is buying the shipments' }).click();
		await page.waitForFunction(
			(t) => {
				const items = (
					window.__rt!.state.content as {
						items: Record<string, { title: string; fields: Record<string, unknown> }>;
					}
				).items;
				const q = Object.values(items).find((i) => i.title === t);
				const objectives = (q?.fields.objectives ?? []) as Array<{ done: boolean }>;
				return objectives[0]?.done === true;
			},
			title,
			{ timeout: 10_000 },
		);
		await expect(page.getByText('1/2')).not.toHaveCount(0);

		// The lifecycle status select writes the declared `status` field.
		await page.getByLabel(`Status of ${title}`).selectOption('completed');
		await page.waitForFunction(
			(t) => {
				const items = (
					window.__rt!.state.content as {
						items: Record<string, { title: string; fields: Record<string, unknown> }>;
					}
				).items;
				return Object.values(items).find((i) => i.title === t)?.fields.status === 'completed';
			},
			title,
			{ timeout: 10_000 },
		);

		// Reload-persistence: tracker state and status round-trip through the op-log.
		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitReady(page);
		quest = await findObject(page, title);
		expect(quest?.fields.status).toBe('completed');
		expect((quest?.fields.objectives as Array<{ done: boolean }>)[0]?.done).toBe(true);
		await expect(page.getByText(title)).not.toHaveCount(0);
		await expect(page.getByText('1/2')).not.toHaveCount(0);
	});

	test('a faction dossier is created and edited through the real editor', async ({ page }) => {
		const name = `The Brine Hand Revival ${Date.now()}`;

		await page.getByRole('tab', { name: 'Factions' }).click();
		// The seeded faction dossiers render as live core entities.
		await expect(page.getByText('Saltmarsh Watch')).not.toHaveCount(0);

		await page.getByRole('button', { name: 'New faction' }).click();
		await page.getByLabel('Name', { exact: true }).fill(name);
		await page.getByLabel('Leader').fill('Mother Sild');
		await page.getByLabel('Goals').fill('Wake what sleeps below the vaults');
		await page.getByLabel('DM secret').fill('Sild only translates for it.');
		await page.getByRole('button', { name: 'Create faction' }).click();

		await page.waitForFunction(
			(t) =>
				Object.values(
					(window.__rt!.state.content as { items: Record<string, { title: string }> }).items,
				).some((i) => i.title === t),
			name,
			{ timeout: 10_000 },
		);
		let faction = await findObject(page, name);
		expect(faction?.visibility).toBe('dm-only');
		expect(faction?.fields.leader).toBe('Mother Sild');
		await expect(page.getByText(`led by Mother Sild`)).not.toHaveCount(0);

		// Edit: flip stance to Hostile and reveal the dossier to players (a SEPARATE visibility command).
		await page.getByRole('button', { name: `Edit ${name}` }).click();
		await page.getByLabel('Stance').selectOption('hostile');
		await page.getByLabel('Visibility').selectOption('player-visible');
		await page.getByRole('button', { name: 'Save faction' }).click();

		await page.waitForFunction(
			(t) => {
				const items = (
					window.__rt!.state.content as {
						items: Record<
							string,
							{ title: string; visibility: string; fields: Record<string, unknown> }
						>;
					}
				).items;
				const f = Object.values(items).find((i) => i.title === t);
				return f?.visibility === 'player-visible' && f?.fields.stance === 'hostile';
			},
			name,
			{ timeout: 10_000 },
		);
		// The editor closes only AFTER both the update-object and set-item-visibility dispatches have
		// resolved — and each resolves only after persistFullState() writes to IndexedDB. Waiting for
		// it to close is the durability barrier; reloading on the in-memory state alone races the write.
		await expect(page.getByRole('button', { name: 'Save faction' })).toHaveCount(0);

		// Reload-persistence for the dossier edit.
		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitReady(page);
		faction = await findObject(page, name);
		expect(faction?.visibility).toBe('player-visible');
		expect(faction?.fields.stance).toBe('hostile');
	});

	test('player preview filters story objects and omits dm-only dossier fields', async ({
		page,
	}) => {
		const stamp = Date.now();
		const sharedQuest = `Recover the Shipment ${stamp}`;
		const secretQuest = `The Bell Rings Twice ${stamp}`;
		await createQuestViaCore(page, sharedQuest, 'player-visible');
		await createQuestViaCore(page, secretQuest, 'dm-only');

		// DM sees both threads.
		await expect(page.getByText(sharedQuest)).not.toHaveCount(0);
		await expect(page.getByText(secretQuest)).not.toHaveCount(0);

		// A player preview keeps only the shared thread.
		await enterPreview(page, 'player');
		await expect(page.getByText(sharedQuest)).not.toHaveCount(0);
		await expect(page.getByText(secretQuest)).toHaveCount(0);
		await exitPreview(page);

		// Factions: the DM sees the dm-only 'Brine Hand' AND every dossier's DM-secret field.
		await page.getByRole('tab', { name: 'Factions' }).click();
		await expect(page.getByText('Brine Hand', { exact: true })).not.toHaveCount(0);
		await expect(page.getByText('DM secret')).not.toHaveCount(0);
		await expect(page.getByText(/Pell’s the leak/)).not.toHaveCount(0);

		// A player preview drops the dm-only faction entirely — and on the player-visible factions the
		// dm-only `secret` field is omitted by the core's role projection (CONTENT-013 AC3).
		await enterPreview(page, 'player');
		await expect(page.getByText('Saltmarsh Watch')).not.toHaveCount(0);
		await expect(page.getByText('Brine Hand', { exact: true })).toHaveCount(0);
		await expect(page.getByText('DM secret')).toHaveCount(0);
		await expect(page.getByText(/Pell’s the leak/)).toHaveCount(0);
		await exitPreview(page);
	});

	test('the tab bar filters the story surfaces: NPCs and the timeline', async ({ page }) => {
		// NPCs tab: seeded NPCs from the Characters roster (kind !== 'pc'), never the party's PCs.
		await page.getByRole('tab', { name: 'NPCs' }).click();
		await expect(page.getByText('Mira the Ferryman')).not.toHaveCount(0);
		await expect(page.getByText('The Hollow King', { exact: true })).not.toHaveCount(0);
		await expect(page.locator('#main-content').getByText('Sera Duskwhisper')).toHaveCount(0);

		// Timeline tab: dated notes build the campaign timeline; the campaign date is honestly unset
		// (authoring lives on the Session surface, so this screen never invents a write control).
		await page.getByRole('tab', { name: 'Timeline' }).click();
		await expect(
			page.getByText('No campaign date set — set it from the Session screen.'),
		).not.toHaveCount(0);
		await expect(page.getByText('The Drowning of Saltreach')).not.toHaveCount(0);
		await expect(page.getByText('The party makes landfall')).not.toHaveCount(0);
		await expect(page.getByText('The Hollow King stirs')).not.toHaveCount(0);

		// Switching back re-renders the Threads lens (the filter is stateful UI, not a reload).
		await page.getByRole('tab', { name: 'Quests' }).click();
		await expect(page.getByText('No quests yet')).not.toHaveCount(0);
	});
});
