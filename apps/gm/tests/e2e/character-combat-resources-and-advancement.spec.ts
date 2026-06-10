import { expect, test } from '@playwright/test';

// CHAR-007 / CHAR-008 / CHAR-009: combat resources, spell/resource state, and advancement.
//
// - CHAR-007: a character owner (which inherits combat-participant) updates combat resources DURING a
//   session; the update is gated on the session workflow being `active` (the CMD-active-session-control
//   guard, re-enforced by the Processing Core) and on owner/combat-participant authority.
// - CHAR-008: the owner manages spell slots and triggers deterministic rest recovery; the expenditure
//   history records each command.
// - CHAR-009: the owner completes a staged level-up; an incomplete advancement cannot be finalized
//   until validation passes.
//
// The flow renders the same stacked list/form UI on desktop and compact profiles, so this runs on
// BOTH Playwright projects. The "view as" header control switches the rendered actor; the shared local
// runtime persists state, so DM and player actions interleave in one session.

test.describe('CHAR combat resources and advancement', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/characters/');
		await page.getByTestId('characters-view').waitFor({ state: 'visible' });
		await page.evaluate(async () => {
			await indexedDB.deleteDatabase('dndtools-v2');
		});
		await page.reload();
		await page.getByTestId('characters-view').waitFor({ state: 'visible' });
	});

	// DM quick-creates a player-visible sidekick and grants ownership to Demo Player. Returns its id.
	async function setupOwnedCharacter(page: import('@playwright/test').Page): Promise<string> {
		await page.getByTestId('qc-kind').selectOption('sidekick');
		await page.getByTestId('qc-name').fill('Pip');
		await page.getByTestId('qc-hp').fill('10');
		await page.getByTestId('qc-ac').fill('12');
		await page.getByTestId('qc-visibility').selectOption('player-visible');
		await page.getByTestId('qc-submit').click();
		await expect(page.getByTestId('qc-created')).toContainText('Pip');

		const card = page.getByTestId('collab-list').locator('[data-testid^="collab-character-"]').first();
		const id = (await card.getAttribute('data-testid'))!.replace('collab-character-', '');
		await page.getByTestId(`collab-grant-target-${id}`).selectOption('actor-player');
		await page.getByTestId(`collab-grant-${id}`).click();
		await expect(page.getByTestId(`collab-owner-${id}`)).toContainText('Demo Player');
		return id;
	}

	// Bring a control into view before interacting. The Characters page stacks several tall sections,
	// so on the compact (mobile) profile a target can sit far down the page; scrolling it into view
	// first keeps clicks reliable without forcing past actionability checks.
	async function clickInView(
		page: import('@playwright/test').Page,
		testId: string,
	): Promise<void> {
		const locator = page.getByTestId(testId);
		await locator.scrollIntoViewIfNeeded();
		await locator.click();
	}

	// Start an active session from the home Command Center (DM-only). The home Scene auto-provisions.
	async function startActiveSession(page: import('@playwright/test').Page): Promise<void> {
		await page.goto('/');
		await page.getByTestId('command-center').waitFor({ state: 'visible' });
		await page.getByTestId('session-workflow-active').click();
		await expect(page.getByTestId('session-workflow-status')).toContainText('active');
		await page.goto('/characters/');
		await page.getByTestId('characters-view').waitFor({ state: 'visible' });
	}

	test('CHAR-007: combat-resource updates are blocked until the session is active, then accepted', async ({
		page,
	}) => {
		const id = await setupOwnedCharacter(page);

		// Before a session is active, the combat controls are disabled and an inactive note is shown.
		await expect(page.getByTestId('resources-session-inactive')).toBeVisible();
		await expect(page.getByTestId(`resources-hp-apply-${id}`)).toBeDisabled();

		// Start an active session, then the owner applies damage during the session.
		await startActiveSession(page);
		await expect(page.getByTestId('resources-session-inactive')).toHaveCount(0);
		await page.getByTestId(`resources-hp-delta-${id}`).scrollIntoViewIfNeeded();
		await page.getByTestId(`resources-hp-delta-${id}`).fill('-4');
		await clickInView(page, `resources-hp-apply-${id}`);
		await expect(page.getByTestId(`resources-hp-${id}`)).toContainText('HP 6/10');

		// The expenditure history records the command (CHAR-008 history surface).
		await expect(page.getByTestId(`resources-history-${id}`)).toContainText('Damage 4');
	});

	test('CHAR-007: a player without a grant cannot update combat resources during a session', async ({
		page,
	}) => {
		const id = await setupOwnedCharacter(page);
		await startActiveSession(page);

		// View as Demo Player 2, who has NO grant on this character. The combat controls are not offered
		// (the core also re-enforces this), so no resource controls render for that actor.
		await page.getByTestId('view-as-select').selectOption('actor-player-2');
		// Player 2 cannot even see the player-visible character's combat controls beyond read; the
		// owner-only/combat-participant control fieldset is absent.
		await expect(page.getByTestId(`resources-combat-controls-${id}`)).toHaveCount(0);
	});

	test('CHAR-008: the owner declares spell slots, casts during a session, and a long rest restores them', async ({
		page,
	}) => {
		const id = await setupOwnedCharacter(page);

		// View as the owner and declare 2 level-1 spell slots.
		await page.getByTestId('view-as-select').selectOption('actor-player');
		const manageSummary = page.getByTestId(`resources-manage-${id}`).locator('summary');
		await manageSummary.scrollIntoViewIfNeeded();
		await manageSummary.click();
		await page.getByTestId(`resources-slot-level-${id}`).fill('1');
		await page.getByTestId(`resources-slot-max-${id}`).fill('2');
		await clickInView(page, `resources-slot-declare-${id}`);
		await expect(page.getByTestId(`resources-slot-${id}-1`)).toContainText('2/2');

		// Cast one slot during an active session.
		await startActiveSession(page);
		await expect(page.getByTestId('resources-session-inactive')).toHaveCount(0);
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId(`resources-cast-${id}-1`)).toBeEnabled();
		await clickInView(page, `resources-cast-${id}-1`);
		await expect(page.getByTestId(`resources-slot-${id}-1`)).toContainText('1/2');

		// A long rest deterministically restores the slots to full.
		await manageSummary.scrollIntoViewIfNeeded();
		await manageSummary.click();
		await clickInView(page, `resources-long-rest-${id}`);
		await expect(page.getByTestId(`resources-slot-${id}-1`)).toContainText('2/2');
	});

	test('CHAR-009: an incomplete advancement cannot be finalized until validation passes', async ({
		page,
	}) => {
		const id = await setupOwnedCharacter(page);

		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId(`advancement-level-${id}`)).toContainText('Level 1');

		// Open a milestone advancement (skips the XP gate).
		await clickInView(page, `advancement-open-milestone-${id}`);
		await expect(page.getByTestId(`advancement-draft-${id}`)).toBeVisible();

		// Set only the class — the finalize button stays disabled because HP gained is missing.
		await page.getByTestId(`advancement-class-${id}`).fill('Fighter');
		await clickInView(page, `advancement-save-${id}`);
		await expect(page.getByTestId(`advancement-issue-${id}-hitPointsGained`)).toBeVisible();
		await expect(page.getByTestId(`advancement-commit-${id}`)).toBeDisabled();

		// Provide the hit points: validation passes, the finalize button enables, and committing
		// advances the character to level 2 and removes the staged draft.
		await page.getByTestId(`advancement-hp-${id}`).fill('6');
		await clickInView(page, `advancement-save-${id}`);
		await expect(page.getByTestId(`advancement-ready-${id}`)).toBeVisible();
		await expect(page.getByTestId(`advancement-commit-${id}`)).toBeEnabled();
		await clickInView(page, `advancement-commit-${id}`);
		await expect(page.getByTestId(`advancement-level-${id}`)).toContainText('Level 2');
		await expect(page.getByTestId(`advancement-draft-${id}`)).toHaveCount(0);
	});
});
