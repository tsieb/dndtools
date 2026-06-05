import { expect, test } from '@playwright/test';

// CHAR-006 — Widget data exposure.
//
// A widget binds to a character's STRUCTURED, STABLE data-exposure API (HP, resources, conditions,
// spell slots, abilities, skills, equipment, visible notes). The "Character data exposure" panel
// renders the published binding-path contract grouped by field group and resolves a chosen path for
// the ACTIVE participant through the Processing Core's `resolveCharacterExposure`, which fails closed
// (hidden/conflicted/missing; unknown selector ⇒ missing). The flow is a stacked list/form that renders
// identically on desktop and compact profiles, so this runs on BOTH Playwright projects. The "view as"
// header control switches the rendered actor over the shared local runtime.

test.describe('CHAR widget data exposure', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/characters/');
		await page.getByTestId('characters-view').waitFor({ state: 'visible' });
		await page.evaluate(async () => {
			await indexedDB.deleteDatabase('dndtools-v2');
		});
		await page.reload();
		await page.getByTestId('characters-view').waitFor({ state: 'visible' });
	});

	async function createCharacter(
		page: import('@playwright/test').Page,
		name: string,
		visibility: 'dm-only' | 'player-visible' | 'shared',
		hp = '10',
		ac = '12',
	): Promise<void> {
		await page.getByTestId('qc-kind').selectOption('sidekick');
		await page.getByTestId('qc-name').fill(name);
		await page.getByTestId('qc-hp').fill(hp);
		await page.getByTestId('qc-ac').fill(ac);
		await page.getByTestId('qc-visibility').selectOption(visibility);
		await page.getByTestId('qc-submit').click();
		await expect(page.getByTestId('qc-created')).toContainText(name);
	}

	test('publishes the full field-group contract (HP, resources, conditions, spell slots, abilities, skills, equipment, notes)', async ({
		page,
	}) => {
		await createCharacter(page, 'Aria', 'player-visible', '8', '14');
		const contract = page.getByTestId('exposure-contract');
		await expect(contract).toBeVisible();
		for (const group of [
			'hp',
			'resources',
			'conditions',
			'spell-slots',
			'abilities',
			'skills',
			'equipment',
			'notes',
		]) {
			await expect(page.getByTestId(`exposure-group-${group}`)).toBeVisible();
		}
	});

	test('resolves a bound HP value for the DM through the exposure API', async ({ page }) => {
		await createCharacter(page, 'Aria', 'player-visible', '8', '14');
		await page.getByTestId('exposure-character').selectOption({ label: 'Aria' });
		await page.getByTestId('exposure-selector').selectOption('combat.hp');
		await expect(page.getByTestId('exposure-state')).toHaveText('available');
		await expect(page.getByTestId('exposure-value')).toContainText('8');
	});

	test('an unsupported selector fails closed to missing (not a leak)', async ({ page }) => {
		await createCharacter(page, 'Aria', 'player-visible', '8', '14');
		await page.getByTestId('exposure-character').selectOption({ label: 'Aria' });
		await page.getByTestId('exposure-selector').selectOption('combat.secretPlan');
		await expect(page.getByTestId('exposure-state')).toHaveText('missing');
		await expect(page.getByTestId('exposure-missing')).toBeVisible();
	});

	test('a dm-only character is not bindable by a player (omitted from the picker)', async ({
		page,
	}) => {
		await createCharacter(page, 'Visible Ally', 'player-visible', '8', '14');
		await createCharacter(page, 'Hidden Horror', 'dm-only', '99', '18');

		// DM can bind to the hidden character and read its secret HP.
		await page.getByTestId('exposure-character').selectOption({ label: 'Hidden Horror' });
		await page.getByTestId('exposure-selector').selectOption('combat.hp');
		await expect(page.getByTestId('exposure-state')).toHaveText('available');
		await expect(page.getByTestId('exposure-value')).toContainText('99');

		// As a player, the dm-only character is not even a bind target — the picker omits it, and the
		// secret HP never appears anywhere on the page.
		await page.getByTestId('view-as-select').selectOption('actor-player');
		const options = page.getByTestId('exposure-character').locator('option');
		await expect(options).toHaveCount(1);
		await expect(options.first()).toHaveText('Visible Ally');
		await expect(page.getByTestId('character-data-exposure').getByText('99')).toHaveCount(0);
	});

	test('an observer has no bindable characters (empty exposure surface)', async ({ page }) => {
		await createCharacter(page, 'Visible Ally', 'player-visible', '8', '14');
		await page.getByTestId('view-as-select').selectOption('actor-observer');
		await expect(page.getByTestId('exposure-empty')).toBeVisible();
	});
});
