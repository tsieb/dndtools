import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
	dispatch,
	enterPreview,
	exitPreview,
	gotoRoute,
	markOnboarded,
	seedFresh,
	waitReady,
} from './_helpers';

// RC-KNW-6.6 — every quest, NPC and faction card on Story carries a relationships tray: its typed
// edges and the notes that mention it, read through the actor-filtered core queries, with an inline
// "Add relationship" that writes the same `relations:` body line as /campaign/relationships. The NPC
// card's story home (faction, place, last-mentioned note) replaced AC and HP; the Timeline's
// missing-date state sets the campaign date in place with the Session command.

// Not seeded names: the seed already carries a dm-only "Mira the Ferryman" and "The Ashen Hand".
const NPC = 'Odda Vell';
const SECRET_NPC = 'The Quiet Broker';
const FACTION = 'The Lantern Guild';
const NOTE = 'Crossing at dawn';
const SECRET_NOTE = 'Broker ledger';

async function axe(page: Page) {
	await page.evaluate(async () => {
		await Promise.all(
			document
				.getAnimations()
				.filter((a) => a.effect?.getTiming().iterations !== Infinity)
				.map((a) => a.finished.catch(() => undefined)),
		);
	});
	const result = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'])
		.analyze();
	expect(result.violations).toEqual([]);
}

const tray = (page: Page, title: string) =>
	page.getByRole('region', { name: `Relationships and mentions: ${title}`, exact: true });
/** The tray's typed edges (its other list is the notes that mention the entity). */
const edgeRows = (page: Page, title: string) =>
	tray(page, title).getByRole('list', { name: 'Relationships', exact: true }).getByRole('listitem');

/** Adds `<other> — verb → <title>` from the card titled `title`, through its inline form. */
async function addIncoming(page: Page, title: string, other: string, verb: string) {
	const links = tray(page, title);
	await links.getByRole('button', { name: `Add relationship: ${title}`, exact: true }).click();
	await expect(links.getByLabel('Direction', { exact: true })).toHaveValue('in');
	await links.getByLabel('With', { exact: true }).selectOption({ label: other });
	await links.getByLabel('Relationship', { exact: true }).fill(verb);
	await links.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(
		edgeRows(page, title).filter({ hasText: `${other} — ${verb} → ${title}` }),
	).toBeVisible();
	// The form closes and focus returns to its launcher.
	await expect(
		links.getByRole('button', { name: `Add relationship: ${title}`, exact: true }),
	).toBeFocused();
}

test.describe('campaign: relationships on the Story cards', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/campaign');
		await seedFresh(page);
		await page.goto('/#/campaign', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.locator('#main-content').waitFor({ state: 'attached' });

		const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
		for (const command of [
			{
				type: 'character.quick-create',
				actorId,
				payload: { kind: 'npc', name: NPC, visibility: 'player-visible' },
			},
			{
				type: 'character.quick-create',
				actorId,
				payload: { kind: 'npc', name: SECRET_NPC, visibility: 'dm-only' },
			},
			{
				type: 'content.create-object',
				actorId,
				payload: {
					subtype: 'faction',
					title: FACTION,
					fields: { name: FACTION, stance: 'allied' },
					body: 'Keepers of the river lights.',
					visibility: 'player-visible',
				},
			},
			{
				type: 'content.create-item',
				actorId,
				payload: {
					kind: 'note',
					title: NOTE,
					body: `We crossed with [[${NPC}]] for the [[${FACTION}]].`,
					visibility: 'player-visible',
				},
			},
			{
				type: 'content.create-item',
				actorId,
				payload: {
					kind: 'note',
					title: SECRET_NOTE,
					body: `The [[${FACTION}]] pays in silver.`,
					visibility: 'dm-only',
				},
			},
		]) {
			const result = await dispatch(page, command);
			expect(result.status, `${command.type}: ${result.rejection?.message ?? ''}`).toBe('accepted');
		}
	});

	test('adds NPC → faction "leads" from the faction card and sees it on the NPC card and in the graph', async ({
		page,
	}) => {
		await page.getByRole('tab', { name: 'Factions', exact: true }).click();
		const factionLinks = tray(page, FACTION);
		await expect(factionLinks).toContainText('No relationships yet.');
		// Both notes that link the faction are listed, newest edit first.
		await expect(factionLinks.getByRole('button', { name: NOTE, exact: true })).toBeVisible();
		await expect(
			factionLinks.getByRole('button', { name: SECRET_NOTE, exact: true }),
		).toBeVisible();

		await factionLinks
			.getByRole('button', { name: `Add relationship: ${FACTION}`, exact: true })
			.click();
		await axe(page);
		await factionLinks.getByRole('button', { name: 'Cancel', exact: true }).click();
		await addIncoming(page, FACTION, NPC, 'leads');

		// The declaration landed in the NPC's own body — the same write the overview makes.
		const body = await page.evaluate(
			(name) =>
				Object.values(
					(
						window.__rt!.state.characters as {
							characters: Record<string, { name: string; data: Record<string, unknown> }>;
						}
					).characters,
				).find((c) => c.name === name)?.data.body,
			NPC,
		);
		expect(body).toContain(`leads :: ${FACTION}`);
		await axe(page);

		// The NPC card: the edge in its tray, and the story home where AC and HP used to be.
		await page.getByRole('tab', { name: 'NPCs', exact: true }).click();
		const npcLinks = tray(page, NPC);
		await expect(edgeRows(page, NPC)).toHaveText(`${NPC} — leads → ${FACTION}`);
		const card = page.getByRole('article').filter({ hasText: NPC });
		await expect(card).toContainText(`Faction: ${FACTION}`);
		await expect(card).toContainText(`Last mentioned in ${NOTE}`);
		await expect(card).not.toContainText('AC ');
		await expect(npcLinks.getByRole('button', { name: NOTE, exact: true })).toBeVisible();
		await axe(page);

		// "Open sheet" still opens the character sheet.
		await npcLinks.getByRole('button', { name: `Open sheet: ${NPC}`, exact: true }).click();
		await expect.poll(() => new URL(page.url()).hash).toMatch(/^#\/characters\//);

		// The overview graph and table show the same edge, and it survives a reload.
		await gotoRoute(page, '/campaign/relationships');
		const edge = page.getByRole('button', { name: `Remove: ${NPC} → ${FACTION}`, exact: true });
		await expect(edge).toBeVisible();
		await expect(page.locator('svg text').filter({ hasText: 'leads' })).not.toHaveCount(0);
		await page.reload();
		await waitReady(page);
		await expect(edge).toBeVisible();
	});

	test('a player preview shows no DM-only edge or mention', async ({ page }) => {
		await page.getByRole('tab', { name: 'Factions', exact: true }).click();
		await addIncoming(page, FACTION, NPC, 'leads');
		await addIncoming(page, FACTION, SECRET_NPC, 'serves');
		await expect(edgeRows(page, FACTION)).toHaveCount(2);

		await enterPreview(page, 'player');
		const factionLinks = tray(page, FACTION);
		await expect(edgeRows(page, FACTION)).toHaveText([`${NPC} — leads → ${FACTION}`]);
		await expect(factionLinks).not.toContainText(SECRET_NPC);
		await expect(factionLinks.getByRole('button', { name: NOTE, exact: true })).toBeVisible();
		await expect(factionLinks).not.toContainText(SECRET_NOTE);
		// A player cannot author, so there is no add control to dead-end on.
		await expect(factionLinks.getByRole('button', { name: /^Add relationship/ })).toHaveCount(0);

		await page.getByRole('tab', { name: 'NPCs', exact: true }).click();
		await expect(tray(page, NPC)).toBeVisible();
		await expect(tray(page, SECRET_NPC)).toHaveCount(0);
		await axe(page);
		await exitPreview(page);
		await expect(tray(page, SECRET_NPC)).toBeVisible();
	});

	test('the timeline date is set without leaving Story', async ({ page }) => {
		await page.getByRole('tab', { name: 'Timeline', exact: true }).click();
		await expect(page.getByText('No campaign date set yet.', { exact: true })).toBeVisible();
		await page.getByRole('button', { name: 'Set the campaign date', exact: true }).click();
		await axe(page);
		await page.getByLabel('Day', { exact: true }).fill('10');
		await page.getByLabel('Year', { exact: true }).fill('1372');
		await page.getByRole('button', { name: 'Set date', exact: true }).click();

		await expect(page.getByText('Current campaign date:')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Set the campaign date' })).toHaveCount(0);
		expect(new URL(page.url()).hash).toBe('#/campaign');
		const date = await page.evaluate(
			() =>
				(
					window.__rt!.state.session as unknown as {
						calendarContinuity: { currentDate: { year: number; day: number } | null };
					}
				).calendarContinuity.currentDate,
		);
		expect(date).toMatchObject({ year: 1372, day: 10 });
		await axe(page);
	});
});
