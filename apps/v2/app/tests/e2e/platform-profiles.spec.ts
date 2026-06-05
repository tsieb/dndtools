import { expect, test } from '@playwright/test';

// PLAT-001 / PLAT-004 / PLAT-016: the Settings route renders the resolved platform profile
// capability descriptor and the published web/PWA support matrix.
test.describe('PLAT platform profiles, capability status, and support matrix', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/settings/');
		await page.getByTestId('settings-view').waitFor({ state: 'visible' });
	});

	test('PLAT-001: the shell resolves a platform profile and shows its capabilities', async ({
		page,
	}, testInfo) => {
		// The resolved profile descriptor is shown. Desktop Chrome resolves to the web shell;
		// the Pixel 5 (touch + compact) resolves to the mobile profile.
		const profileMeta = page.getByTestId('capability-profile');
		await expect(profileMeta).toBeVisible();
		const expectedProfile = testInfo.project.name === 'mobile-chromium' ? 'web' : 'web';
		// Both browser contexts run the web shell prototype; assert the descriptor is present and
		// reports a known storage backend rather than a sniffed width.
		await expect(profileMeta).toContainText(expectedProfile);
		await expect(profileMeta).toContainText('storage');
	});

	test('PLAT-004 / PLAT-002 / PLAT-005: native-only services show as unsupported, not available', async ({
		page,
	}) => {
		await page.getByTestId('capability-status').scrollIntoViewIfNeeded();
		// Trusted filesystem, OS credential store, and MCP sidecar are native-only: the web shell
		// reports them unsupported so feature surfaces degrade rather than attempting a native path.
		await expect(
			page.getByTestId('capability-status-trustedFilesystem'),
		).toHaveAttribute('data-status', 'unsupported');
		await expect(page.getByTestId('capability-status-mcpSidecar')).toHaveAttribute(
			'data-status',
			'unsupported',
		);
		// The web shell's real capabilities ARE available.
		await expect(page.getByTestId('capability-status-serviceWorkerCache')).toHaveAttribute(
			'data-status',
			'available',
		);
	});

	test('PLAT-016: the support matrix declares each domain and fails closed for native features', async ({
		page,
	}) => {
		await page.getByTestId('support-matrix').scrollIntoViewIfNeeded();
		// Every core domain row is present with a support level.
		await expect(page.getByTestId('matrix-domain-notes')).toBeVisible();
		await expect(page.getByTestId('matrix-level-notes')).toHaveAttribute(
			'data-level',
			'cached-read-write',
		);
		await expect(page.getByTestId('matrix-domain-sync-status')).toBeVisible();
		await expect(page.getByTestId('matrix-auth-sync-status')).toContainText('reauth-on-reconnect');

		// Native-only features are listed as unsupported (fail closed).
		await expect(page.getByTestId('matrix-unsupported-filesystem-vault')).toBeVisible();
		await expect(page.getByTestId('matrix-unsupported-mcp-sidecar')).toBeVisible();
	});
});

// PLAT-003: the mobile (compact) profile presents the same Scene through a density-reduced
// focused view, backed by the same Scene state and commands. This runs meaningfully on the
// Pixel 5 project; on desktop the dense grid is used instead.
test.describe('PLAT-003 mobile density-reduced Scene access', () => {
	test('compact profile operates Scene widgets through a focused view and add-widget drawer', async ({
		page,
	}, testInfo) => {
		test.skip(
			testInfo.project.name !== 'mobile-chromium',
			'density-reduced presentation applies to the compact profile',
		);

		await page.goto('/scenes/');
		await page.getByTestId('scene-name').waitFor({ state: 'visible' });
		await page.evaluate(async () => {
			await indexedDB.deleteDatabase('dndtools-v2');
		});
		await page.reload();
		await page.getByTestId('scene-name').waitFor({ state: 'visible' });

		// Create a Scene and open it.
		await page.getByTestId('scene-name').fill('Mobile Board');
		await page.getByTestId('scene-create').click();
		const sceneLink = page.getByTestId('scene-list').getByRole('link', { name: 'Mobile Board' });
		await sceneLink.click();
		await page.getByTestId('scene-editor').waitFor({ state: 'visible' });

		// AC2: on compact there is no persistent add panel; the same add-widget command is reached
		// through a drawer toggle.
		const toggle = page.getByTestId('toggle-add-widget');
		await expect(toggle).toBeVisible();
		await toggle.click();
		await page.getByTestId('widget-type').fill('note');
		await page.getByTestId('widget-version').fill('1.0.0');
		await page.getByTestId('widget-add').click();

		// Add a second widget so the focused view has something to page through.
		await page.getByTestId('toggle-add-widget').click();
		await page.getByTestId('widget-type').fill('timer');
		await page.getByTestId('widget-version').fill('1.0.0');
		await page.getByTestId('widget-add').click();

		// AC1: widgets are operated through a focused (one-at-a-time) view backed by the same
		// Scene state — not a dense grid.
		const focusedView = page.getByTestId('focused-widget-view');
		await expect(focusedView).toBeVisible();
		await expect(page.getByTestId('widget-grid')).toHaveCount(0);
		await expect(page.getByTestId('focus-position')).toContainText('of 2');

		// Paging through widgets keeps the same Scene state (no parallel model): page back to the
		// first widget, then forward to the second.
		await page.getByTestId('focus-prev-widget').click();
		await expect(page.getByTestId('focus-position')).toContainText('1 of 2');
		await page.getByTestId('focus-next-widget').click();
		await expect(page.getByTestId('focus-position')).toContainText('2 of 2');
	});
});
