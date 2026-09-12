import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh } from './_helpers';

// RC-CHR-5.3 — ROSTER LIBRARY INFORMATION SCENT. A roster card used to show a name, a kind badge and
// "24/24 · 15 · 1 cond.": nothing about who plays the character, how hurt they are against their
// maximum, or whether they have been in a session at all, and the only filter was the kind tabs.
// These cover the card (class · level, HP bar, conditions, owner, last played), the Owner and Tag
// filters, tags authored on the sheet, and the grid's single-tab-stop arrow-key navigation. The
// 320px fit lives in authoring-layout.spec.ts.

async function openRoster(page: Page): Promise<void> {
	await markOnboarded(page);
	await gotoRoute(page, '/characters');
	await seedFresh(page);
	await expect(
		page.locator('#main-content').getByRole('list', { name: 'Characters', exact: true }),
	).toBeVisible();
}

/** A roster card: its accessible name is the character's name alone. */
const card = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

async function characterIdByName(page: Page, name: string): Promise<string> {
	const id = await page.evaluate((wanted) => {
		const chars = (
			window.__rt as unknown as {
				state: { characters: { characters: Record<string, { id: string; name: string }> } };
			}
		).state.characters.characters;
		return Object.values(chars).find((c) => c.name === wanted)?.id ?? null;
	}, name);
	expect(id, `the seeded vault must contain ${name}`).not.toBeNull();
	return id!;
}

function dmActorId(page: Page): Promise<string> {
	return page.evaluate(() => window.__rt!.defaultActorId);
}

test.describe('characters roster: information scent', () => {
	test('each card shows class and level, HP, conditions, the owning player and play history', async ({
		page,
	}) => {
		await openRoster(page);

		const sera = card(page, 'Sera Duskwhisper');
		await expect(sera).toContainText(/rogue/i);
		await expect(sera).toContainText('Lv 1');
		await expect(sera).toContainText('24/24');
		await expect(sera).toContainText('Played by Demo Player');
		await expect(sera).toContainText('Not played yet');
		// The name is the accessible name; everything else is the description, not a run-on name.
		await expect(sera).toHaveAccessibleDescription(/Played by Demo Player/);

		// A DM-run NPC carries no player chip.
		const mira = card(page, 'Mira the Ferryman');
		await expect(mira).toContainText('9/9');
		await expect(mira).not.toContainText('Played by');

		// Conditions render as badges, collapsing past three.
		const result = await dispatch(page, {
			type: 'character.edit-field',
			actorId: await dmActorId(page),
			payload: {
				characterId: await characterIdByName(page, 'Sera Duskwhisper'),
				path: 'combat.conditions',
				value: ['poisoned', 'prone', 'frightened', 'restrained'],
			},
		});
		expect(result.status, result.rejection?.message).toBe('accepted');
		await expect(sera).toContainText(/poisoned/i);
		await expect(sera).toContainText('+1 more');
	});

	test('owner and tag filters narrow the roster and clear together', async ({ page }) => {
		await openRoster(page);
		const filters = page.getByRole('group', { name: 'Filter characters' });
		const owner = filters.getByRole('combobox', { name: 'Owner', exact: true });

		// No character carries a tag yet, so there is no Tag filter to offer.
		await expect(filters.getByRole('combobox', { name: 'Tag', exact: true })).toHaveCount(0);

		await owner.selectOption({ label: 'Demo Player 2' });
		await expect(card(page, 'Brother Calloway')).toBeVisible();
		await expect(card(page, 'Sera Duskwhisper')).toHaveCount(0);
		await expect(filters.getByRole('status')).toHaveText(/^Showing 1 of \d+$/);

		await owner.selectOption({ label: 'No player owner' });
		await expect(card(page, 'Mira the Ferryman')).toBeVisible();
		await expect(card(page, 'Tormund Ironfist')).toHaveCount(0);

		// The kind tabs combine with the owner filter: every seeded PC has a player.
		await page.getByRole('tab', { name: 'Party' }).click();
		const panel = page.getByRole('tabpanel');
		await expect(panel.getByText('No one matches this filter')).toBeVisible();
		await panel.getByRole('button', { name: 'Clear filters' }).click();
		await expect(card(page, 'Tormund Ironfist')).toBeVisible();
		await expect(page.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true');
		await expect(owner).toHaveValue('any');

		// A tag on any record becomes a filter option.
		const result = await dispatch(page, {
			type: 'character.edit-field',
			actorId: await dmActorId(page),
			payload: {
				characterId: await characterIdByName(page, 'The Hollow King'),
				path: 'data.tags',
				value: 'boss, undead',
			},
		});
		expect(result.status, result.rejection?.message).toBe('accepted');
		await filters.getByRole('combobox', { name: 'Tag', exact: true }).selectOption('undead');
		await expect(card(page, 'The Hollow King')).toContainText('boss · undead');
		await expect(card(page, 'Mira the Ferryman')).toHaveCount(0);
	});

	test('tags authored on the sheet reach the roster filter', async ({ page }) => {
		await openRoster(page);
		await card(page, 'Mira the Ferryman').click();
		await expect(page).toHaveURL(/#\/characters\/[^/]+$/);

		await page.getByRole('button', { name: 'Edit', exact: true }).click();
		const input = page.getByRole('textbox', { name: 'Tags', exact: true });
		await input.fill('ferry');
		await input.press('Enter');
		await input.fill('ally');
		await input.press('Enter');
		await page.getByRole('button', { name: 'Save tags' }).click();

		const miraId = await characterIdByName(page, 'Mira the Ferryman');
		await expect
			.poll(() =>
				page.evaluate(
					(id) =>
						(
							window.__rt as unknown as {
								state: { characters: { characters: Record<string, { data: { tags?: unknown } }> } };
							}
						).state.characters.characters[id]?.data.tags ?? null,
					miraId,
				),
			)
			.toBe('ferry, ally');

		// Read mode lists the saved tags.
		await page.getByRole('button', { name: 'Done', exact: true }).click();
		await expect(page.getByText('ally', { exact: true })).toBeVisible();

		await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('button').click();
		const filters = page.getByRole('group', { name: 'Filter characters' });
		await filters.getByRole('combobox', { name: 'Tag', exact: true }).selectOption('ferry');
		await expect(card(page, 'Mira the Ferryman')).toBeVisible();
		await expect(card(page, 'The Hollow King')).toHaveCount(0);
	});

	test('a card reports when its character last took part in a session', async ({ page }) => {
		await openRoster(page);
		const sera = card(page, 'Sera Duskwhisper');
		await expect(sera).toContainText('Not played yet');

		const actorId = await dmActorId(page);
		const characterId = await characterIdByName(page, 'Sera Duskwhisper');
		const sceneId = await page.evaluate(() => {
			const state = window.__rt!.state as unknown as {
				session: { activeSceneId: string | null };
				commandCenter: { homeSceneId: string | null };
				scenes: { scenes: Record<string, { id: string; isTemplate?: boolean }> };
			};
			return (
				state.session.activeSceneId ??
				state.commandCenter.homeSceneId ??
				Object.values(state.scenes.scenes).find((s) => !s.isTemplate)?.id ??
				null
			);
		});
		expect(sceneId, 'the seeded vault must have a scene to go live on').not.toBeNull();

		const live = await dispatch(page, {
			type: 'session.set-workflow',
			actorId,
			payload: { workflow: 'active', activeSceneId: sceneId },
		});
		expect(live.status, live.rejection?.message).toBe('accepted');
		const fight = await dispatch(page, {
			type: 'combat.start',
			actorId,
			payload: {
				combatants: [
					{
						kind: 'character',
						name: 'Sera Duskwhisper',
						characterId,
						ac: 15,
						maxHp: 24,
						initiative: 12,
					},
				],
			},
		});
		expect(fight.status, fight.rejection?.message).toBe('accepted');
		await expect(sera).toContainText('In play now');

		// Ending the session archives it; the card now dates her last session.
		const ended = await dispatch(page, {
			type: 'session.set-workflow',
			actorId,
			payload: { workflow: 'recap' },
		});
		expect(ended.status, ended.rejection?.message).toBe('accepted');
		await expect(sera).toContainText(/Last played /);
		await expect(card(page, 'Brother Calloway')).toContainText('Not played yet');
	});

	test('the card grid is one tab stop that the arrow keys move through', async ({ page }) => {
		await openRoster(page);
		const cards = page.locator('[data-roster-card]');
		const count = await cards.count();
		expect(count, 'the seeded roster needs several cards').toBeGreaterThan(2);
		await expect(page.locator('[data-roster-card][tabindex="0"]')).toHaveCount(1);

		await cards.first().focus();
		await page.keyboard.press('ArrowRight');
		await expect(cards.nth(1)).toBeFocused();
		// The tab stop follows focus.
		await expect(cards.nth(1)).toHaveAttribute('tabindex', '0');
		await expect(cards.first()).toHaveAttribute('tabindex', '-1');

		await page.keyboard.press('End');
		await expect(cards.nth(count - 1)).toBeFocused();
		await page.keyboard.press('ArrowRight'); // the edge stops, it does not wrap
		await expect(cards.nth(count - 1)).toBeFocused();
		await page.keyboard.press('Home');
		await expect(cards.first()).toBeFocused();

		// Down moves one visual row: as many cards as the first row holds at this viewport.
		const columns = await cards.evaluateAll((els) => {
			const top = els[0]!.getBoundingClientRect().top;
			return els.filter((el) => Math.abs(el.getBoundingClientRect().top - top) < 1).length;
		});
		const below = columns < count ? columns : 0;
		await page.keyboard.press('ArrowDown');
		await expect(cards.nth(below)).toBeFocused();

		// Tab leaves the grid in one press instead of walking every card.
		await page.keyboard.press('Tab');
		const inGrid = await page.evaluate(
			() => !!document.activeElement?.closest('[data-roster-card]'),
		);
		expect(inGrid, 'Tab must move past the grid, not to the next card').toBe(false);
		await expect(cards.nth(below)).toHaveAttribute('tabindex', '0');

		await cards.nth(below).focus();
		await page.keyboard.press('Enter');
		await expect(page).toHaveURL(/#\/characters\/[^/]+$/);
	});
});
