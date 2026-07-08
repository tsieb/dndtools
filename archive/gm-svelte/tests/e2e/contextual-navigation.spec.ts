import { expect, test, type Page } from '@playwright/test';

// NAV-003: global/local/contextual navigation, breadcrumbs, backlinks, and
// pinned/recent items derive from one route (the single source of truth), so
// following any of them updates route and history coherently.

/** Reset to a known-empty vault on the given route. */
async function freshAt(page: Page, route: string, readyTestId: string) {
	await page.goto(route);
	await page.getByTestId(readyTestId).waitFor({ state: 'visible' });
	await page.evaluate(async () => {
		await indexedDB.deleteDatabase('dndtools-v2');
		localStorage.removeItem('dndtools-v2-nav-history');
	});
	await page.reload();
	await page.getByTestId(readyTestId).waitFor({ state: 'visible' });
}

test.describe('NAV-003 breadcrumbs and history coherence (AC1)', () => {
	test('a breadcrumb updates the route and browser back stays coherent', async ({
		page,
	}, testInfo) => {
		await freshAt(page, '/scenes/', 'scene-name');

		// Author a Scene and open it.
		await page.getByTestId('scene-name').fill('Riverside');
		await page.getByTestId('scene-create').click();
		await page.getByTestId('scene-list').getByRole('link', { name: 'Riverside' }).click();
		await page.getByTestId('scene-editor').waitFor({ state: 'visible' });
		const sceneUrl = page.url();

		const breadcrumbs = page.getByTestId('breadcrumbs');
		await expect(breadcrumbs).toBeVisible();

		// UX-NAV-007 AC3: on the compact (mobile) profile the trail truncates to `‹ <parent>` and the
		// full path lives in a tap-to-expand sheet; on Desktop/landscape the full trail is inline.
		let trail = breadcrumbs;
		if (testInfo.project.name === 'mobile-chromium') {
			const trigger = page.getByTestId('breadcrumb-compact-trigger');
			await expect(trigger).toContainText('Scenes');
			await trigger.click();
			trail = page.getByTestId('breadcrumb-sheet');
			await expect(trail).toBeVisible();
		}

		// The breadcrumb trail reflects the canonical path; the open Scene is current.
		await expect(trail.getByRole('link', { name: 'Command Center' })).toBeVisible();
		await expect(trail.getByRole('link', { name: 'Scenes' })).toBeVisible();
		await expect(trail.getByText('Riverside')).toHaveAttribute('aria-current', 'page');

		// Following the Scenes breadcrumb updates the route...
		await trail.getByRole('link', { name: 'Scenes' }).click();
		await expect(page).toHaveURL(/\/scenes\/?$/);

		// ...and browser back returns to the Scene: history is coherent, not duplicated.
		await page.goBack();
		await expect(page).toHaveURL(sceneUrl);
		await expect(page.getByTestId('scene-editor')).toBeVisible();
	});
});

test.describe('NAV-003 contextual backlinks and history coherence (AC1)', () => {
	test('a backlink updates the route and browser back stays coherent', async ({
		page,
	}, testInfo) => {
		// DEFERRED (design-package move): opens the home Scene editor via the board's "open in editor"
		// affordance, which only renders on the compact board; the Desktop spatial board has no such
		// entry point yet. Restoring it is part of the deferred scene-surface rework (zoom→scroll +
		// scene-ified widgets). Keep mobile coverage; skip on Desktop until the entry point exists.
		test.skip(
			testInfo.project.name === 'desktop-chromium',
			'Desktop board has no open-scene-editor affordance yet (deferred scene-surface rework)',
		);
		await freshAt(page, '/board/', 'command-center');

		// The DM's Command Center auto-creates its home Scene; open it in the editor.
		await page.getByTestId('cc-open-editor').click();
		await page.getByTestId('scene-editor').waitFor({ state: 'visible' });
		const sceneUrl = page.url();

		// UX-NAV-008: backlinks are a navigation surface. On Desktop the panel is an inline,
		// default-expanded complementary panel; on the compact profile the `Backlinks (N)` toggle
		// opens a sheet with the same rows.
		let contextual = page.getByTestId('contextual-nav');
		if (testInfo.project.name === 'mobile-chromium') {
			const toggle = page.getByTestId('backlinks-toggle');
			await expect(toggle).toContainText('Backlinks (');
			await toggle.click();
			contextual = page.getByTestId('contextual-nav');
		}
		await expect(contextual).toBeVisible();
		await expect(contextual).toContainText('Command Center home Scene');

		// Following the backlink routes to the Command Center...
		await contextual.getByRole('link', { name: 'Command Center' }).click();
		await expect(page).toHaveURL(/\/$/);
		await expect(page.getByTestId('command-center')).toBeVisible();

		// ...and browser back returns to the Scene editor coherently.
		await page.goBack();
		await expect(page).toHaveURL(sceneUrl);
		await expect(page.getByTestId('scene-editor')).toBeVisible();
	});
});

test.describe('NAV-003 mobile local navigation drawer (AC2)', () => {
	test('opens as an accessible sheet and releases focus after closing', async ({
		page,
	}, testInfo) => {
		test.skip(
			testInfo.project.name !== 'mobile-chromium',
			'AC2 covers the compact (mobile) profile drawer',
		);
		await freshAt(page, '/scenes/', 'scene-name');

		// At least one Scene so the section has local navigation items.
		await page.getByTestId('scene-name').fill('Riverside');
		await page.getByTestId('scene-create').click();
		await expect(page.getByTestId('scene-list').getByText('Riverside')).toBeVisible();

		const trigger = page.getByTestId('local-nav-trigger');
		await expect(trigger).toBeVisible();
		await trigger.click();

		// Local nav appears as an accessible modal sheet listing the section's items.
		const drawer = page.getByTestId('local-nav-drawer');
		await expect(drawer).toBeVisible();
		await expect(drawer.getByRole('dialog')).toBeVisible();
		await expect(drawer.getByRole('link', { name: 'Riverside' })).toBeVisible();

		// Escape closes the sheet and returns focus to the trigger.
		await page.keyboard.press('Escape');
		await expect(page.getByTestId('local-nav-drawer')).toHaveCount(0);
		await expect(trigger).toBeFocused();

		// Tab moves focus away freely — focus is not trapped in the removed sheet.
		await page.keyboard.press('Tab');
		await expect(trigger).not.toBeFocused();
	});
});
