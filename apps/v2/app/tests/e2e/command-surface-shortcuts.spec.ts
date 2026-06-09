import { expect, test, type Page } from '@playwright/test';
import { openSection } from './_nav-helper';

/**
 * UX-NAV-014 (command palette: global keyboard surface) + UX-NAV-019 (global shortcuts registry).
 *
 * The palette is the actor-filtered command surface: it opens on `Ctrl/Cmd+K` (or the header button),
 * shows recent destinations before the user types, navigates with the arrow keys + Enter, refuses to run
 * a disabled result (announcing the reason), and clears its text on the first Escape / closes on the
 * second while restoring focus to the opener. The shortcut registry surfaces key hints on palette rows
 * and a searchable help panel, and is actor-filtered so a player never sees a DM-only shortcut.
 */

async function freshAt(page: Page, route: string, readyTestId: string) {
	await page.goto(route);
	await page.getByTestId(readyTestId).waitFor({ state: 'visible' });
	await page.evaluate(async () => {
		await indexedDB.deleteDatabase('dndtools-v2');
	});
	await page.reload();
	await page.getByTestId(readyTestId).waitFor({ state: 'visible' });
}

async function viewAs(page: Page, actorId: string) {
	await page.getByTestId('view-as-select').selectOption(actorId);
}

test.describe('UX-NAV-014 command palette — global keyboard surface', () => {
	test('Ctrl+K opens the palette, focuses the field, and shows recent destinations (AC1)', async ({
		page,
	}, testInfo) => {
		test.skip(testInfo.project.name === 'mobile-chromium', 'Ctrl+K is the pointer-free open path');
		await freshAt(page, '/', 'command-center');

		// Build up some recent destinations by visiting sections.
		await openSection(page, 'atlas');
		await page.getByTestId('route-landmark').waitFor({ state: 'visible' });
		await openSection(page, 'session');
		await page.getByTestId('route-landmark').waitFor({ state: 'visible' });

		await page.keyboard.press('Control+k');
		await expect(page.getByTestId('command-palette')).toBeVisible();
		// The field is focused on open (keyboard-usable immediately).
		await expect(page.getByTestId('palette-search')).toBeFocused();
		// Recent destinations are surfaced before the user types.
		await expect(page.getByTestId('palette-group-Recent')).toBeVisible();
		await expect(page.getByTestId('palette-recent-/atlas/')).toBeVisible();
	});

	test('two-stage Escape clears the text first, then closes and restores focus (AC3)', async ({
		page,
	}, testInfo) => {
		test.skip(testInfo.project.name === 'mobile-chromium', 'two-stage Escape is a keyboard path');
		await freshAt(page, '/', 'command-center');

		const trigger = page.getByTestId('open-command-palette');
		await trigger.click();
		await expect(page.getByTestId('command-palette')).toBeVisible();

		const search = page.getByTestId('palette-search');
		await search.fill('settings');
		await expect(search).toHaveValue('settings');

		// First Escape clears the text but keeps the palette open.
		await search.press('Escape');
		await expect(page.getByTestId('command-palette')).toBeVisible();
		await expect(search).toHaveValue('');

		// Second Escape closes the palette and returns focus to the opener.
		await search.press('Escape');
		await expect(page.getByTestId('command-palette')).toHaveCount(0);
		await expect(trigger).toBeFocused();
	});

	test('a disabled result shows a non-leaking reason and its run control is disabled (AC5)', async ({
		page,
	}) => {
		// On /scenes/ the Command Center home is never configured, so save-preset is present but disabled.
		await freshAt(page, '/scenes/', 'scene-name');

		await page.getByTestId('open-command-palette').click();
		await page.getByTestId('palette-search').fill('preset');
		await expect(page.getByTestId('palette-reason-cc.preset.save')).toHaveText(
			'Set up the Command Center first.',
		);
		await expect(page.getByTestId('palette-run-cc.preset.save')).toBeDisabled();
	});

	test('pressing Enter on a disabled result does not execute it and announces the reason (AC5)', async ({
		page,
	}, testInfo) => {
		test.skip(testInfo.project.name === 'mobile-chromium', 'Enter activation is a keyboard path');
		await freshAt(page, '/scenes/', 'scene-name');

		await page.getByTestId('open-command-palette').click();
		const search = page.getByTestId('palette-search');
		await search.fill('preset');
		await expect(page.getByTestId('palette-action-cc.preset.save')).toBeVisible();

		// Enter acts on the highlighted (only) result, which is disabled: it does not run, the palette stays
		// open, and the reason is surfaced (also announced via the live region).
		await search.press('Enter');
		await expect(page.getByTestId('command-palette')).toBeVisible();
		await expect(page.getByTestId('palette-status')).toHaveText('Set up the Command Center first.');
	});

	test('Enter on a highlighted navigation result routes to it (AC1 keyboard parity)', async ({
		page,
	}, testInfo) => {
		test.skip(testInfo.project.name === 'mobile-chromium', 'Enter activation is a keyboard path');
		await freshAt(page, '/', 'command-center');

		await page.keyboard.press('Control+k');
		await page.getByTestId('palette-search').fill('settings');
		await page.getByTestId('palette-search').press('Enter');
		await expect(page).toHaveURL(/\/settings\/?$/);
		await expect(page.getByTestId('settings-view')).toBeVisible();
	});
});

test.describe('UX-NAV-019 global shortcuts registry', () => {
	test('a navigation result row shows its keyboard shortcut hint (AC2)', async ({ page }) => {
		await freshAt(page, '/', 'command-center');
		await page.getByTestId('open-command-palette').click();
		// The Session navigation row carries the Alt+2 shortcut hint.
		await expect(page.getByTestId('palette-hint-nav.session')).toHaveText('Alt + 2');
	});

	test('? opens the searchable keyboard shortcuts panel (AC3)', async ({ page }, testInfo) => {
		test.skip(testInfo.project.name === 'mobile-chromium', '? help key is a keyboard path');
		await freshAt(page, '/', 'command-center');

		await page.keyboard.press('Shift+Slash'); // `?`
		await expect(page.getByTestId('help-dialog')).toBeVisible();
		await expect(page.getByTestId('help-shortcuts')).toBeVisible();

		// Searching narrows the list to matching shortcuts.
		await page.getByTestId('help-search').fill('atlas');
		await expect(page.getByTestId('help-shortcut-nav.alt4')).toBeVisible();
		await expect(page.getByTestId('help-shortcut-nav.alt4')).toContainText('Go to Atlas');
		await expect(page.getByTestId('help-shortcut-palette')).toHaveCount(0);
	});

	test('Alt+4 navigates to Atlas when no text input is focused (AC1)', async ({ page }, testInfo) => {
		test.skip(testInfo.project.name === 'mobile-chromium', 'Alt+<n> is an external-keyboard path');
		await freshAt(page, '/', 'command-center');
		await page.keyboard.press('Alt+4');
		await expect(page).toHaveURL(/\/atlas\/?$/);
		await expect(page.getByTestId('atlas-view')).toBeVisible();
	});

	test("a player's shortcuts panel omits the DM-only Scenes shortcut (AC4)", async ({ page }) => {
		await freshAt(page, '/', 'command-center');

		// The DM panel lists the DM-only Scenes shortcut.
		await page.getByTestId('open-help').click();
		await expect(page.getByTestId('help-shortcut-nav.scenes')).toBeVisible();
		await expect(page.getByTestId('help-dialog')).toContainText('Go to Scenes');
		await page.getByTestId('help-dialog-close').click();

		// As a player, that DM-only shortcut is absent entirely — not disabled, and its label never leaks.
		await viewAs(page, 'actor-player');
		await page.getByTestId('open-help').click();
		await expect(page.getByTestId('help-shortcut-nav.scenes')).toHaveCount(0);
		await expect(page.getByTestId('help-dialog')).not.toContainText('Go to Scenes');
	});
});
