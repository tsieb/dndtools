import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// UX-CANVAS-002/003/004/005/006/009/012/015: widget placement, selection, move/resize/rotate, grouping,
// z-order, alignment, undo/redo, and the keyboard model — integrated with the Scene Outline. Runs on BOTH
// desktop-chromium and mobile-chromium: every Must-have manipulation must be keyboard- and
// non-gesture-operable on every profile (never desktop-only). Includes the actor no-leak boundary.

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const BLOCKING = new Set(['critical', 'serious']);

async function freshScenes(page: Page) {
	await page.goto('/scenes/');
	await page.getByTestId('scene-name').waitFor({ state: 'visible' });
	await page.evaluate(async () => {
		await indexedDB.deleteDatabase('dndtools-v2');
	});
	await page.reload();
	await page.getByTestId('scene-name').waitFor({ state: 'visible' });
}

async function openScene(page: Page, name: string) {
	await page.getByTestId('scene-name').fill(name);
	await page.getByTestId('scene-visibility').selectOption('player-visible');
	await page.getByTestId('scene-create').click();
	await page.getByTestId('scene-list').getByRole('link', { name }).click();
	await page.getByTestId('scene-editor').waitFor({ state: 'visible' });
	await page.getByTestId('canvas-viewport').waitFor({ state: 'visible' });
}

/** Place a widget through the new widget library (UX-CANVAS-002): open, search, choose. */
async function placeViaLibrary(page: Page, type: string) {
	await page.getByTestId('open-widget-library').click();
	await page.getByTestId('widget-library').waitFor({ state: 'visible' });
	await page.getByTestId(`widget-library-item-${type}`).click();
	await page.getByTestId('widget-library').waitFor({ state: 'hidden' });
}

/** Add a widget through the existing add-widget form (used to create a DM-only widget for no-leak). */
async function addViaForm(
	page: Page,
	isMobile: boolean,
	type: string,
	visibility: 'player-visible' | 'dm-only',
	bind?: { entityType: string; entityId: string },
) {
	if (isMobile) {
		const toggle = page.getByTestId('toggle-add-widget');
		if (await toggle.isVisible().catch(() => false)) await toggle.click();
	}
	await page.getByTestId('widget-type').fill(type);
	await page.getByTestId('widget-version').fill('1.0.0');
	if (bind) {
		await page.getByTestId('bind-entity-type').fill(bind.entityType);
		await page.getByTestId('bind-entity-id').fill(bind.entityId);
	}
	await page.getByTestId('widget-visibility').selectOption(visibility);
	await page.getByTestId('widget-add').click();
}

test.describe('UX-CANVAS widget manipulation and outline', () => {
	test.beforeEach(async ({ page }) => {
		await freshScenes(page);
	});

	test('library placement, selection, keyboard move, and undo/redo (UX-CANVAS-002/003/005/012/015)', async ({
		page,
	}) => {
		await openScene(page, 'Manip Scene');

		// UX-CANVAS-002: place a Dice Roller from the library; it lands selected.
		await placeViaLibrary(page, 'dice');
		await expect(page.locator('[data-testid^="canvas-tile-"][data-visibility]')).toHaveCount(1);
		await expect(page.getByTestId('selection-count')).toHaveText('1 selected');

		// UX-CANVAS-003/015: keyboard MOVE — focus the canvas, ArrowRight nudges the selected widget,
		// which enables the undo button with a descriptive label (the move dispatched a core command).
		await page.getByTestId('canvas-viewport').focus();
		await page.keyboard.press('ArrowRight');
		const undo = page.getByTestId('canvas-undo');
		await expect(undo).toBeEnabled();
		await expect(undo).toHaveAttribute('aria-label', /Undo Move widget/);

		// UX-CANVAS-012: multi-step move then undo → redo.
		await page.keyboard.press('ArrowRight');
		await page.getByTestId('canvas-viewport').focus();
		await undo.click();
		await undo.click();
		await expect(undo).toBeDisabled();
		const redo = page.getByTestId('canvas-redo');
		await expect(redo).toBeEnabled();
		await redo.click();
		await expect(undo).toBeEnabled();
	});

	test('select-all, alignment, and z-order from keyboard + toolbar (UX-CANVAS-005/006/009)', async ({
		page,
	}) => {
		await openScene(page, 'Align Scene');
		await placeViaLibrary(page, 'note');
		await placeViaLibrary(page, 'timer');
		await expect(page.locator('[data-testid^="canvas-tile-"][data-visibility]')).toHaveCount(2);

		// UX-CANVAS-005: Ctrl+A selects all from the keyboard.
		await page.getByTestId('canvas-viewport').focus();
		await page.keyboard.press('Control+a');
		await expect(page.getByTestId('selection-count')).toHaveText('2 selected');

		// UX-CANVAS-009: the align toolbar repositions the selection (non-gesture, keyboard-reachable).
		await page.getByTestId('align-left').click();
		await expect(page.getByTestId('canvas-undo')).toBeEnabled();
		await expect(page.getByTestId('canvas-undo')).toHaveAttribute('aria-label', /Undo Align/);

		// UX-CANVAS-006: z-order via the selection toolbar (the non-gesture pointer path). The last-placed
		// widget stacks on top, so send-to-back is always a real change.
		await page.getByTestId('z-back').click();
		await expect(page.getByTestId('canvas-undo')).toHaveAttribute('aria-label', /Undo Reorder widget/);

		// UX-CANVAS-006: the Scene Outline doubles as the layers panel — selecting a row reflects on the
		// canvas, and Ctrl+Arrow reorders that widget's z-order from the keyboard.
		const firstOption = page.getByTestId('scene-outline-section').getByRole('option').first();
		await firstOption.click();
		await expect(firstOption).toHaveAttribute('aria-selected', 'true');
		// The first row is the lowest-z (back) widget, so bringing it forward is always a real change.
		await firstOption.press('Control+ArrowUp');
		await expect(page.getByTestId('canvas-undo')).toHaveAttribute('aria-label', /Undo Reorder widget/);
	});

	test('transform panel moves/rotates; grouping; keyboard shortcuts help (UX-CANVAS-003/004/006/015)', async ({
		page,
	}) => {
		await openScene(page, 'Transform Scene');
		await placeViaLibrary(page, 'note');

		// UX-CANVAS-003/004: numeric panel (the WCAG 2.5.7 / mobile path) commits move + rotation.
		await page.getByTestId('transform-x').fill('320');
		await page.getByTestId('transform-x').press('Tab');
		await expect(page.getByTestId('canvas-undo')).toHaveAttribute('aria-label', /Undo Move widget/);

		await page.getByTestId('transform-rotation').fill('45');
		await page.getByTestId('transform-rotation').press('Tab');
		await expect(page.getByTestId('canvas-undo')).toHaveAttribute('aria-label', /Undo Rotate widget/);

		// UX-CANVAS-015: the `?`-style keyboard shortcuts reference opens and is a real table.
		await page.getByTestId('canvas-shortcuts-open').click();
		await expect(page.getByTestId('canvas-shortcuts-help')).toBeVisible();
		await expect(page.getByTestId('canvas-shortcuts-table')).toContainText('Group selection');
		await page.getByTestId('canvas-shortcuts-help-close').click();
		await expect(page.getByTestId('canvas-shortcuts-help')).toBeHidden();
	});

	test('library lists widgets (unavailable shown not hidden) and Escape cancels (UX-CANVAS-002 / CMD-005)', async ({
		page,
	}) => {
		await openScene(page, 'Library Scene');
		await page.getByTestId('open-widget-library').click();
		// CMD-005: the map widget is always LISTED (never removed). Whether it is available depends on the
		// active platform profile; the unavailable-marking logic itself is unit-tested in ux-canvas-library.
		const mapItem = page.getByTestId('widget-library-item-map');
		await expect(mapItem).toBeVisible();
		if ((await mapItem.getAttribute('aria-disabled')) === 'true') {
			// When unavailable on this profile it shows the reason and cannot place a widget.
			await expect(page.getByTestId('widget-library-unavailable-map')).toBeVisible();
			await mapItem.click();
			await expect(page.getByTestId('widget-library')).toBeVisible();
			await expect(page.locator('[data-testid^="canvas-tile-"][data-visibility]')).toHaveCount(0);
		}
		// UX-CANVAS-002 AC3: Escape cancels placement without adding a widget.
		await page.keyboard.press('Escape');
		await expect(page.getByTestId('widget-library')).toBeHidden();
		await expect(page.locator('[data-testid^="canvas-tile-"][data-visibility]')).toHaveCount(0);
	});

	test('actor no-leak: a player cannot see or select a DM-only widget via canvas, outline, or toolbar (UX-CANVAS-005/006)', async ({
		page,
	}, testInfo) => {
		const isMobile = testInfo.project.name === 'mobile-chromium';
		await openScene(page, 'No Leak Manip');
		await addViaForm(page, isMobile, 'note', 'player-visible');
		await addViaForm(page, isMobile, 'map', 'dm-only', { entityType: 'vault', entityId: 'forbidden-vault' });

		// DM: both widgets manipulable — select-all reports two.
		await expect(page.locator('[data-testid^="canvas-tile-"][data-visibility]')).toHaveCount(2);
		await page.getByTestId('canvas-viewport').focus();
		await page.keyboard.press('Control+a');
		await expect(page.getByTestId('selection-count')).toHaveText('2 selected');

		// Switch the rendered actor to a player.
		await page.getByTestId('view-as-select').selectOption('actor-player');

		// The manipulation surface is gone (players do not edit), the DM-only tile is absent from the
		// canvas and outline, and the DM-only binding id never leaks anywhere in the player view.
		await expect(page.getByTestId('canvas-command-bar')).toHaveCount(0);
		await expect(page.getByTestId('selection-toolbar')).toHaveCount(0);
		await expect(page.locator('[data-testid^="canvas-tile-"][data-visibility]')).toHaveCount(1);
		await expect(page.getByTestId('scene-outline-count')).toHaveText('1 widget');
		await expect(page.getByTestId('scene-editor')).not.toContainText('forbidden-vault');
	});

	test('the manipulated canvas route passes axe with no critical/serious violations', async ({
		page,
	}) => {
		await openScene(page, 'Axe Manip Scene');
		await placeViaLibrary(page, 'note');
		const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
		const blocking = results.violations.filter((v) => BLOCKING.has(v.impact ?? ''));
		expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
	});
});
