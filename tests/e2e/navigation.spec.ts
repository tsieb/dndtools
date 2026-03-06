import { test, expect } from '@playwright/test';
import { waitForAppReady } from './helpers.js';

test.describe('Navigation', () => {
	test.beforeEach(async ({ page }) => {
		await waitForAppReady(page);
	});

	test('home page loads with app title', async ({ page }) => {
		await expect(
			page.getByRole('navigation', { name: 'Global navigation: Primary sections' }),
		).toBeVisible();
	});

	test('navigates to notes page', async ({ page }) => {
		await page.goto('/knowledge/notes');
		await page.waitForURL('/knowledge/notes');
		await expect(
			page.getByRole('heading', { name: /All Notes|Player Notes|Notes tagged/i }),
		).toBeVisible();
	});

	test('navigates to search page', async ({ page }) => {
		await page.goto('/knowledge/search');
		await page.waitForURL('/knowledge/search');
		await expect(page.getByRole('heading', { name: 'Search & Discovery' })).toBeVisible();
		await expect(page.getByPlaceholder('Search notes...')).toBeVisible();
	});

	test('navigates to graph page', async ({ page }) => {
		await page.goto('/knowledge/graph');
		await page.waitForURL('/knowledge/graph');
		await expect(page.getByRole('heading', { name: 'Link Graph' })).toBeVisible();
	});

	test('navigates to maps page', async ({ page }) => {
		await page.goto('/atlas/maps');
		await page.waitForURL('/atlas/maps');
		await expect(page.getByRole('heading', { name: 'Map Library' })).toBeVisible();
	});

	test('navigates to combat page', async ({ page }) => {
		await page.goto('/session/combat');
		await page.waitForURL('/session/combat');
		await expect(page.getByRole('heading', { name: 'Combat Tracker' })).toBeVisible();
	});

	test('navigates to player page', async ({ page }) => {
		await page.goto('/player');
		await page.waitForURL('/player');
		await expect(page.getByRole('heading', { name: 'Player Screen' })).toBeVisible();
	});

	test('navigates to settings page', async ({ page }) => {
		await page.goto('/settings');
		await page.waitForURL('/settings');
		await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
	});

	test('sidebar toggle works', async ({ page }) => {
		const toggleButton = page.getByRole('button', { name: 'Toggle local navigation' });
		await toggleButton.click();
		await expect(toggleButton).toBeVisible();
	});

	test('expanded local panel collapses with Ctrl+B and persists across reloads', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 900 });
		await page.goto('/knowledge/notes');
		const localNav = page.getByRole('navigation', { name: 'Local navigation: Knowledge panel' });
		await expect(localNav).toBeVisible();

		await page.keyboard.press('Control+b');
		await expect(localNav).toBeHidden();

		await page.reload();
		await expect(localNav).toBeHidden();

		await page.keyboard.press('Control+b');
		await expect(localNav).toBeVisible();
	});

	test('expanded detail panel toggle is availability-aware and keyboard accessible', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 900 });
		await page.goto('/settings');
		const detailToggle = page.getByRole('button', { name: 'Toggle contextual detail panel' });
		await expect(detailToggle).toBeDisabled();

		await page.goto(`/knowledge/notes?create=${encodeURIComponent('Detail Panel Spec Note')}`);
		await expect(page).toHaveURL(/\/knowledge\/notes\/.+\/edit/);
		await page.goto(page.url().replace(/\/edit$/, ''));
		await expect(detailToggle).toBeEnabled();

		await detailToggle.click();
		await expect(page.getByTestId('detail-panel')).toBeVisible();

		await page.keyboard.press('Control+Shift+r');
		await expect(page.getByTestId('detail-panel')).toBeHidden();
	});

	test('expanded local panel resize handle supports keyboard resizing', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 900 });
		await page.goto('/knowledge/notes');
		const localNav = page.getByRole('navigation', { name: 'Local navigation: Knowledge panel' });
		const sidebar = localNav.locator('xpath=ancestor::aside[1]');
		const resizeHandle = page.getByRole('separator', { name: 'Resize local navigation panel' });

		await expect(localNav).toBeVisible();
		await expect(resizeHandle).toBeVisible();
		const before = await sidebar.boundingBox();
		expect(before).not.toBeNull();

		await resizeHandle.focus();
		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('ArrowRight');

		const after = await sidebar.boundingBox();
		expect(after).not.toBeNull();
		expect((after?.width ?? 0) - (before?.width ?? 0)).toBeGreaterThanOrEqual(15);
	});

	test('zen mode toggles shell chrome with F11', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 900 });
		await page.goto('/knowledge/notes');
		const localToggle = page.getByRole('button', { name: 'Toggle local navigation' });
		const exitZen = page.getByRole('button', { name: 'Exit zen mode' });
		await expect(localToggle).toBeVisible();

		await page.keyboard.press('F11');
		await expect(exitZen).toBeVisible();
		await expect(localToggle).toBeHidden();

		await page.keyboard.press('F11');
		await expect(localToggle).toBeVisible();
	});

	test('breadcrumb uses semantic structure with aria-current marker', async ({ page }) => {
		await page.goto('/knowledge/search');
		await expect(page.getByRole('heading', { name: 'Search & Discovery' })).toBeVisible();
		const breadcrumb = page.getByRole('navigation', { name: 'Contextual navigation: Breadcrumb' });
		await expect(breadcrumb).toBeVisible();
		await expect(breadcrumb.locator('ol')).toBeVisible();
		await expect(breadcrumb.locator('[aria-current="page"]')).toContainText('Search');
	});

	test('back button only enables for in-section history and disables on section root', async ({
		page,
	}) => {
		await page.goto('/knowledge');
		const backButton = page.getByRole('button', { name: 'Go back' });
		await expect(backButton).toBeDisabled();

		await page.keyboard.press('Control+Shift+F');
		await page.waitForURL('/knowledge/search');
		await expect(backButton).toBeEnabled();
		await expect(backButton).toHaveAttribute('title', /Back to Knowledge/i);

		await backButton.click();
		await page.waitForURL('/knowledge');
		await expect(backButton).toBeDisabled();
	});

	test('knowledge local navigation uses tabs, tree semantics, and persisted collapse state', async ({
		page,
	}) => {
		await page.goto('/knowledge/notes');
		await expect(
			page.getByRole('heading', { name: /All Notes|Player Notes|Notes tagged/i }),
		).toBeVisible();
		const localNav = page.getByRole('navigation', { name: 'Local navigation: Knowledge panel' });
		if (!(await localNav.isVisible().catch(() => false))) {
			await page.getByRole('button', { name: 'Toggle local navigation' }).click();
		}
		await expect(localNav).toBeVisible();
		await expect(
			localNav.getByRole('tablist', { name: 'Knowledge panel mode tabs' }),
		).toBeVisible();
		await localNav.getByRole('tab', { name: 'Recent' }).click();
		await expect(localNav.getByRole('tab', { name: 'Recent' })).toHaveAttribute(
			'aria-selected',
			'true',
		);
		await localNav.getByRole('tab', { name: 'Browse' }).click();
		await expect(localNav.getByRole('tree', { name: 'Knowledge folder tree' })).toBeVisible();

		const tagsToggle = localNav.getByRole('button', { name: 'Tags' });
		await tagsToggle.click();
		await expect(tagsToggle).toHaveAttribute('aria-expanded', 'true');

		await page.reload();
		const tagsAfterReload = page
			.getByRole('navigation', { name: 'Local navigation: Knowledge panel' })
			.getByRole('button', { name: 'Tags' });
		await expect(tagsAfterReload).toHaveAttribute('aria-expanded', 'true');
	});

	test('settings section has no local panel content', async ({ page }) => {
		await page.goto('/settings');
		await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
		const localNav = page.getByRole('navigation', { name: 'Local navigation: Settings panel' });
		if (!(await localNav.isVisible().catch(() => false))) {
			await page.getByRole('button', { name: 'Toggle local navigation' }).click();
		}
		await expect(localNav).toBeVisible();
		await expect(localNav).toContainText('Settings has no local navigation panel.');
	});

	test('theme toggle exists on settings page', async ({ page }) => {
		await page.goto('/settings');
		await expect(
			page.getByRole('tabpanel', { name: 'General' }).getByRole('radiogroup', { name: 'Theme' }),
		).toBeVisible();
	});

	test('shell switches layout tiers at breakpoint boundaries', async ({ page }) => {
		const primaryNavShell = page.locator('.primary-nav-shell');

		await page.setViewportSize({ width: 639, height: 900 });
		await expect(primaryNavShell).toHaveAttribute('data-mode', 'compact');

		await page.setViewportSize({ width: 640, height: 900 });
		await expect(primaryNavShell).toHaveAttribute('data-mode', 'medium');

		await page.setViewportSize({ width: 1100, height: 900 });
		await expect(primaryNavShell).toHaveAttribute('data-mode', 'expanded');
	});

	test('keyboard shortcut Ctrl+P opens command palette', async ({ page }) => {
		await page.keyboard.press('Control+p');
		await expect(page.getByRole('dialog', { name: /command palette/i })).toBeVisible({
			timeout: 5_000,
		});
	});

	test('keyboard shortcut Ctrl+D opens dice tray', async ({ page }) => {
		await page.keyboard.press('Control+d');
		await expect(page.getByRole('dialog', { name: /dice tray/i })).toBeVisible({
			timeout: 5_000,
		});
	});

	test('settings page shows keyboard shortcuts', async ({ page }) => {
		await page.goto('/settings');
		await expect(page.getByRole('heading', { name: 'Keyboard Shortcuts' })).toBeVisible();
		const shortcutsPanel = page.getByLabel('General');
		await expect(shortcutsPanel.getByText('Ctrl+N')).toBeVisible();
		await expect(shortcutsPanel.getByText('Ctrl+P')).toBeVisible();
	});

	test('handles 404 gracefully for non-existent note', async ({ page }) => {
		await page.goto('/knowledge/notes/nonexistent-id');
		await expect(page.getByText('Note not found')).toBeVisible();
	});
});
