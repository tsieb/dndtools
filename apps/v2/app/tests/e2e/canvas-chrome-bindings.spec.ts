import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// UX-CANVAS-007/008/010/011/013: widget chrome + anatomy, data-binding affordances, canvas templates,
// DM/player view modes (visibility toggle + player-view preview), and the empty-canvas teaching state.
// Runs on BOTH desktop-chromium and mobile-chromium. Includes the binding/view-mode no-leak boundary:
// a DM-only widget and a player-visible widget bound to a player-hidden field never reveal a forbidden
// entity id, chrome, or binding to a player.

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

async function createScene(page: Page, name: string) {
	await page.getByTestId('scene-name').fill(name);
	await page.getByTestId('scene-visibility').selectOption('player-visible');
	await page.getByTestId('scene-create').click();
	await page.getByTestId('scene-list').getByRole('link', { name }).waitFor({ state: 'visible' });
}

async function openScene(page: Page, name: string) {
	await createScene(page, name);
	await page.getByTestId('scene-list').getByRole('link', { name }).click();
	await page.getByTestId('scene-editor').waitFor({ state: 'visible' });
	await page.getByTestId('canvas-viewport').waitFor({ state: 'visible' });
}

async function placeViaLibrary(page: Page, type: string) {
	await page.getByTestId('open-widget-library').click();
	await page.getByTestId('widget-library').waitFor({ state: 'visible' });
	await page.getByTestId(`widget-library-item-${type}`).click();
	await page.getByTestId('widget-library').waitFor({ state: 'hidden' });
}

async function addViaForm(
	page: Page,
	isMobile: boolean,
	type: string,
	visibility: 'player-visible' | 'dm-only',
	bind?: { entityType: string; entityId: string; selector?: string },
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
		if (bind.selector) await page.getByTestId('bind-selector').fill(bind.selector);
	}
	await page.getByTestId('widget-visibility').selectOption(visibility);
	await page.getByTestId('widget-add').click();
}

test.describe('UX-CANVAS chrome, bindings, templates, and view modes', () => {
	test.beforeEach(async ({ page }) => {
		await freshScenes(page);
	});

	test('widget chrome: bind via inspector, chain-link indicator, and collapse (UX-CANVAS-007/008)', async ({
		page,
	}) => {
		await createScene(page, 'Bind Target Scene');
		await openScene(page, 'Chrome Editor');

		// UX-CANVAS-007: a placed widget exposes the accessible chrome panel; its binding starts at "none".
		await placeViaLibrary(page, 'note');
		await expect(page.getByTestId('widget-chrome-panel')).toBeVisible();
		await expect(page.getByTestId('chrome-binding-status')).toHaveAttribute('data-binding-state', 'none');

		// UX-CANVAS-008: bind through the discrete inspector (the WCAG 2.5.7 path — no drag).
		await page.getByTestId('chrome-bind').click();
		await expect(page.getByTestId('binding-inspector')).toBeVisible();
		await page.getByTestId('binding-search').fill('Bind Target');
		await page.locator('[data-testid^="binding-entity-"]').first().check();
		await page.getByTestId('binding-confirm').click();
		await expect(page.getByTestId('binding-inspector')).toBeHidden();

		// The binding dispatched a core command (undo carries a descriptive label) and the chain-link shows.
		await expect(page.getByTestId('canvas-undo')).toHaveAttribute('aria-label', /Undo Bind/);
		await expect(page.locator('[data-testid^="tile-binding-link-"]')).toHaveCount(1);
		await expect(page.getByTestId('chrome-binding-status')).toHaveAttribute('data-binding-state', 'active');

		// UX-CANVAS-007 §Collapse: collapse persists on the tile and is undoable.
		await page.getByTestId('chrome-collapse-toggle').click();
		await expect(page.locator('[data-testid^="canvas-tile-"][data-collapsed="true"]')).toHaveCount(1);
		await expect(page.getByTestId('canvas-undo')).toHaveAttribute('aria-label', /Undo (Collapse|Expand)/);
	});

	test('missing binding placeholder + Rebind + banner (UX-CANVAS-007 AC4 / UX-CANVAS-010 AC2)', async ({
		page,
	}, testInfo) => {
		const isMobile = testInfo.project.name === 'mobile-chromium';
		await openScene(page, 'Missing Bind');

		// A binding whose field cannot resolve drives the explicit missing state (never a stale value).
		await addViaForm(page, isMobile, 'note', 'player-visible', {
			entityType: 'note',
			entityId: 'gone',
			selector: 'missing:field',
		});

		await expect(page.getByTestId('missing-binding-banner')).toBeVisible();
		await expect(page.locator('[data-testid^="tile-binding-placeholder-"]')).toHaveCount(1);
		// The Rebind recovery opens the binding inspector for that widget.
		await page.locator('[data-testid^="tile-rebind-"]').first().click();
		await expect(page.getByTestId('binding-inspector')).toBeVisible();
	});

	test('view modes: visibility toggle + read-only player-view preview (UX-CANVAS-011)', async ({
		page,
	}) => {
		await openScene(page, 'View Modes');
		await placeViaLibrary(page, 'note');

		// UX-CANVAS-011 §Change visibility (≤2 interactions): select + toggle flips the badge both ways.
		await expect(page.getByTestId('chrome-visibility-badge')).toHaveText('Players');
		await page.getByTestId('chrome-visibility-toggle').click();
		await expect(page.getByTestId('chrome-visibility-badge')).toHaveText('DM Only');
		await expect(page.getByTestId('canvas-undo')).toHaveAttribute('aria-label', /Undo Change visibility/);
		await page.getByTestId('chrome-visibility-toggle').click();
		await expect(page.getByTestId('chrome-visibility-badge')).toHaveText('Players');

		// UX-CANVAS-011 §Player-view preview: entering shows the banner and suspends editing.
		await page.getByTestId('preview-player-view-toggle').click();
		await expect(page.getByTestId('player-view-preview-banner')).toBeVisible();
		await expect(page.getByTestId('canvas-command-bar')).toHaveCount(0);
		await expect(page.getByTestId('widget-chrome-panel')).toHaveCount(0);
		// The player-visible widget still renders in the preview.
		await expect(page.locator('[data-testid^="canvas-tile-"][data-visibility]')).toHaveCount(1);

		// Exit restores the editing surface.
		await page.getByTestId('preview-exit').click();
		await expect(page.getByTestId('player-view-preview-banner')).toHaveCount(0);
		await expect(page.getByTestId('canvas-command-bar')).toBeVisible();

		// Shift+P toggles the same preview from the keyboard.
		await page.getByTestId('canvas-viewport').focus();
		await page.keyboard.press('Shift+P');
		await expect(page.getByTestId('player-view-preview-banner')).toBeVisible();
		await page.keyboard.press('Shift+P');
		await expect(page.getByTestId('player-view-preview-banner')).toHaveCount(0);
	});

	test('empty-canvas teaching state appears, opens the library, and vanishes on first widget (UX-CANVAS-013)', async ({
		page,
	}) => {
		await openScene(page, 'Empty Teaching');
		await expect(page.getByTestId('canvas-empty-state')).toBeVisible();
		await page.getByTestId('empty-canvas-cta').click();
		await expect(page.getByTestId('widget-library')).toBeVisible();
		await page.getByTestId('widget-library-item-note').click();
		await expect(page.getByTestId('canvas-empty-state')).toHaveCount(0);
	});

	test('templates: built-in library + save + instantiate creates a new canvas (UX-CANVAS-010)', async ({
		page,
	}) => {
		await openScene(page, 'Template Source');
		await placeViaLibrary(page, 'note');

		await page.getByTestId('open-templates').click();
		await expect(page.getByTestId('canvas-templates')).toBeVisible();
		// UX-CANVAS-010 §System templates: built-ins carry a "Built-in" badge and no delete.
		await expect(page.getByTestId('template-builtin-builtin.combat-session')).toBeVisible();

		// Save the current canvas as a user template.
		await page.getByTestId('template-name').fill('My Saved Board');
		await page.getByTestId('template-save').click();

		// Instantiate a built-in starter → a brand-new canvas opens with the preset widgets.
		await page.getByTestId('template-instantiate-builtin.combat-session').click();
		await expect(page.getByTestId('scene-name')).toHaveText('Combat Session (new)');
		await expect(page.locator('[data-testid^="canvas-tile-"][data-visibility]')).toHaveCount(3);
	});

	test('actor no-leak: a player never sees a DM-only widget, chrome, or a forbidden binding id (UX-CANVAS-008/011)', async ({
		page,
	}, testInfo) => {
		const isMobile = testInfo.project.name === 'mobile-chromium';
		await openScene(page, 'No Leak Chrome');

		// (a) A player-VISIBLE widget bound to a field hidden from players — the DM sees the entity id,
		//     the player must see neither the id nor any data (an explicit hidden placeholder instead).
		await addViaForm(page, isMobile, 'note', 'player-visible', {
			entityType: 'vault',
			entityId: 'forbidden-vault',
			selector: 'hidden:vault-field',
		});
		// (b) A DM-only widget bound to the same forbidden entity — wholly hidden from the player.
		await addViaForm(page, isMobile, 'map', 'dm-only', {
			entityType: 'vault',
			entityId: 'forbidden-vault',
		});

		// DM sees both widgets and the forbidden id is present in the DM's own (safe-for-DM) view.
		await expect(page.locator('[data-testid^="canvas-tile-"][data-visibility]')).toHaveCount(2);
		await page.getByTestId('canvas-viewport').focus();
		await page.keyboard.press('Control+a');
		await expect(page.getByTestId('selection-count')).toHaveText('2 selected');
		await expect(page.getByTestId('scene-editor')).toContainText('forbidden-vault');

		// Switch the rendered actor to a player.
		await page.getByTestId('view-as-select').selectOption('actor-player');

		// Editing chrome is gone; the DM-only widget is absent; the forbidden id appears nowhere.
		await expect(page.getByTestId('canvas-command-bar')).toHaveCount(0);
		await expect(page.getByTestId('widget-chrome-panel')).toHaveCount(0);
		await expect(page.getByTestId('selection-toolbar')).toHaveCount(0);
		await expect(page.locator('[data-testid^="canvas-tile-"][data-visibility]')).toHaveCount(1);
		await expect(page.getByTestId('scene-outline-count')).toHaveText('1 widget');
		await expect(page.getByTestId('scene-editor')).not.toContainText('forbidden-vault');
	});

	test('the chrome/bindings/templates route passes axe with no critical/serious violations', async ({
		page,
	}) => {
		await openScene(page, 'Axe Chrome Scene');
		await placeViaLibrary(page, 'note');
		await page.getByTestId('chrome-bind').click();
		await expect(page.getByTestId('binding-inspector')).toBeVisible();
		const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
		const blocking = results.violations.filter((v) => BLOCKING.has(v.impact ?? ''));
		expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
	});
});
