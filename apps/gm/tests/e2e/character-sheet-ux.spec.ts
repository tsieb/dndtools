import { expect, test, type Page } from '@playwright/test';
import { openSection } from './_nav-helper';

// UX-CHAR-004/005/006 — the character SHEET polish layer: inline name edit, the HP Damage/Heal delta
// stepper with an optimistic preview, tappable death-save circles, and a condition type-ahead. Renders
// the same on desktop and compact profiles, so this runs on BOTH Playwright projects.

test.describe('UX-CHAR character sheet polish', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/characters/');
		await page.getByTestId('characters-view').waitFor({ state: 'visible' });
		await page.evaluate(async () => {
			await indexedDB.deleteDatabase('dndtools-v2');
		});
		await page.reload();
		await page.getByTestId('characters-view').waitFor({ state: 'visible' });
	});

	async function quickCreate(page: Page, name: string, hp = '10'): Promise<string> {
		await page.getByTestId('qc-kind').selectOption('sidekick');
		await page.getByTestId('qc-name').fill(name);
		await page.getByTestId('qc-hp').fill(hp);
		await page.getByTestId('qc-visibility').selectOption('player-visible');
		await page.getByTestId('qc-submit').click();
		await expect(page.getByTestId('qc-created')).toContainText(name);
		const card = page.getByTestId('collab-list').locator('[data-testid^="collab-character-"]').first();
		return (await card.getAttribute('data-testid'))!.replace('collab-character-', '');
	}

	async function grantOwner(page: Page, id: string): Promise<void> {
		await page.getByTestId(`collab-grant-set-${id}`).selectOption('owner');
		await page.getByTestId(`collab-grant-target-${id}`).selectOption('actor-player');
		await page.getByTestId(`collab-grant-${id}`).click();
		await expect(page.getByTestId(`collab-owner-${id}`)).toContainText('Demo Player');
	}

	// In-app (SPA) navigation, not page.goto — a hard reload races the optimistic-then-durable
	// IndexedDB writes (the owner grant + character) and intermittently drops them under load.
	async function startSession(page: Page): Promise<void> {
		await page.goto('/board/');
		await page.getByTestId('command-center').waitFor({ state: 'visible' });
		await page.getByTestId('view-as-select').selectOption('local-dm');
		await page.getByTestId('session-workflow-active').click();
		await expect(page.getByTestId('session-workflow-status')).toContainText('active');
		await openSection(page, 'characters');
		await page.getByTestId('characters-view').waitFor({ state: 'visible' });
	}

	test('UX-CHAR-004: the DM edits a character name inline on the sheet', async ({ page }) => {
		const id = await quickCreate(page, 'Gribble');
		await page.getByTestId(`resources-name-${id}`).scrollIntoViewIfNeeded();
		await page.getByTestId(`resources-name-${id}`).click();
		await page.getByTestId(`resources-name-edit-${id}`).fill('Gribblenox');
		await page.getByTestId(`resources-name-edit-${id}`).press('Enter');
		await expect(page.getByTestId(`resources-name-${id}`)).toHaveText('Gribblenox');
	});

	test('UX-CHAR-005: the HP stepper shows an optimistic preview and deals damage', async ({ page }) => {
		const id = await quickCreate(page, 'Tussle', '10');
		await grantOwner(page, id);
		await startSession(page);
		await page.getByTestId('view-as-select').selectOption('actor-player');

		// Optimistic preview reflects the typed amount before any command is dispatched.
		await page.getByTestId(`resources-amount-${id}`).fill('7');
		await expect(page.getByTestId(`resources-character-${id}`).locator('.stepper__preview')).toContainText('3/10');

		// Deal damage commits it.
		await page.getByTestId(`resources-deal-${id}`).click();
		await expect(page.getByTestId(`resources-hp-${id}`)).toContainText('HP 3/10');
	});

	test('UX-CHAR-006: death-save circles toggle and a condition is added via the type-ahead', async ({ page }) => {
		const id = await quickCreate(page, 'Wobble');
		await grantOwner(page, id);
		await startSession(page);
		await page.getByTestId('view-as-select').selectOption('actor-player');

		// A death-save success circle fills (aria-checked) on tap.
		const successCircle = page.getByTestId(`resources-death-success-${id}-0`);
		await successCircle.scrollIntoViewIfNeeded();
		await expect(successCircle).toHaveAttribute('aria-checked', 'false');
		await successCircle.click();
		await expect(successCircle).toHaveAttribute('aria-checked', 'true');

		// The condition type-ahead adds "Poisoned", which then shows as a pill and can be removed.
		await page.getByTestId(`resources-condition-add-${id}`).click();
		await page.getByTestId(`resources-condition-search-${id}`).fill('Pois');
		await page.getByTestId(`resources-condition-option-${id}-Poisoned`).click();
		await expect(page.getByTestId(`resources-condition-remove-${id}-Poisoned`)).toBeVisible();
		await page.getByTestId(`resources-condition-remove-${id}-Poisoned`).click();
		await expect(page.getByTestId(`resources-condition-remove-${id}-Poisoned`)).toHaveCount(0);
	});
});
