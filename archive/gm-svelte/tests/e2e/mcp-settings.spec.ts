import { expect, test } from '@playwright/test';

// UX-MCP-001/009/010 — the AI/MCP settings surface: AI is optional and OFF by default with full UI
// parity (a complete, usable fallback state), and enabling it surfaces the policy-mode controls and the
// staged-write/provenance review. Renders the same on desktop and compact profiles, so this runs on
// BOTH Playwright projects.

test.describe('UX-MCP AI/MCP settings', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/settings/');
		await page.getByTestId('settings-view').waitFor({ state: 'visible' });
		await page.evaluate(async () => {
			await indexedDB.deleteDatabase('dndtools-v2');
		});
		await page.reload();
		await page.getByTestId('settings-view').waitFor({ state: 'visible' });
	});

	test('UX-MCP-001/009: AI is off by default with an honest fallback, and toggles on to reveal policy', async ({ page }) => {
		const panel = page.getByTestId('mcp-settings');
		await panel.scrollIntoViewIfNeeded();
		await expect(panel).toBeVisible();

		// Off by default — the fallback state is shown and policy controls are absent.
		await expect(page.getByTestId('mcp-enabled-state')).toHaveText('Disabled');
		await expect(page.getByTestId('mcp-fallback')).toBeVisible();
		await expect(page.getByTestId('mcp-policy-modes')).toHaveCount(0);

		// Enable AI — the policy mode controls + staged-write review appear.
		await page.getByTestId('mcp-enable-toggle').click();
		await expect(page.getByTestId('mcp-enabled-state')).toHaveText('Enabled');
		await expect(page.getByTestId('mcp-fallback')).toHaveCount(0);
		await expect(page.getByTestId('mcp-policy-modes')).toBeVisible();
		await expect(page.getByTestId('mcp-staged-empty')).toBeVisible();

		// The safe default policy is Strict review (UX-MCP-010).
		await expect(page.getByTestId('mcp-mode-strict_review')).toHaveAttribute('aria-pressed', 'true');

		// UX-MCP-008 — the response-presentation reference renders each response status.
		await expect(page.getByTestId('mcp-response-presentation')).toBeVisible();
		await expect(page.getByTestId('mcp-response-ok')).toBeVisible();
		await expect(page.getByTestId('mcp-response-denied')).toBeVisible();
		await expect(page.getByTestId('mcp-inline-assist-note')).toBeVisible();

		// Turning it back off restores the parity fallback.
		await page.getByTestId('mcp-enable-toggle').click();
		await expect(page.getByTestId('mcp-fallback')).toBeVisible();
	});

	test('UX-MCP: the AI/MCP settings panel is DM-only', async ({ page }) => {
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId('mcp-settings')).toHaveCount(0);
	});
});
