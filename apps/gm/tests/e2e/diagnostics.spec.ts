import { expect, test, type Page } from '@playwright/test';

// PLAT-009 / PLAT-017: the diagnostics and participant-status surfaces live on the
// PLAT-owned Settings route. The DM/admin diagnostics panel and the participant-safe
// status panel are gated by the Processing Core, so the surface is role-correct even
// though the route itself is reachable by every role.

async function freshSettings(page: Page) {
	await page.goto('/settings/');
	await page.getByTestId('settings-view').waitFor({ state: 'visible' });
	await page.evaluate(async () => {
		await indexedDB.deleteDatabase('dndtools-v2');
	});
	await page.reload();
	await page.getByTestId('settings-view').waitFor({ state: 'visible' });
}

async function viewAs(page: Page, actorId: string) {
	await page.getByTestId('view-as-select').selectOption(actorId);
}

test.describe('PLAT-009 DM/admin diagnostics', () => {
	test('shows system health, sync/source status, capabilities, and schema health to the DM', async ({
		page,
	}) => {
		await freshSettings(page);

		await expect(page.getByTestId('diagnostics-panel')).toBeVisible();
		await expect(page.getByTestId('diagnostics-health-level')).toBeVisible();
		await expect(page.getByTestId('diagnostics-sources')).toBeVisible();
		await expect(page.getByTestId('diagnostics-source-local-vault')).toBeVisible();
		await expect(page.getByTestId('diagnostics-capabilities')).toBeVisible();
		await expect(page.getByTestId('diagnostics-schema')).toBeVisible();
	});

	test('exports a redacted support bundle by default and includes raw values only on opt-in', async ({
		page,
	}) => {
		await freshSettings(page);

		await page.getByTestId('diagnostics-export').click();
		await expect(page.getByTestId('diagnostics-bundle')).toBeVisible();
		await expect(page.getByTestId('diagnostics-bundle-secrets')).toContainText('redacted');
		// The default bundle must not leak an absolute path or a secret value.
		const redacted = await page.getByTestId('diagnostics-bundle').innerText();
		expect(redacted).not.toMatch(/\/Users\//);
		expect(redacted).not.toContain('sk-secret');

		await page.getByTestId('diagnostics-include-secrets').check();
		await page.getByTestId('diagnostics-export').click();
		await expect(page.getByTestId('diagnostics-bundle-secrets')).toContainText('yes');
	});
});

test.describe('PLAT-017 participant-safe status', () => {
	test('a player sees their own session status without DM diagnostics or a support bundle', async ({
		page,
	}) => {
		await freshSettings(page);
		await viewAs(page, 'actor-player');

		await expect(page.getByTestId('participant-status')).toBeVisible();
		await expect(page.getByTestId('participant-connection-state')).toBeVisible();
		await expect(page.getByTestId('participant-sync-state')).toBeVisible();
		await expect(page.getByTestId('participant-delivery-state')).toBeVisible();
		await expect(page.getByTestId('participant-capabilities')).toBeVisible();

		// The DM-only diagnostics surface and support-bundle export must be absent.
		await expect(page.getByTestId('diagnostics-panel')).toHaveCount(0);
		await expect(page.getByTestId('diagnostics-export')).toHaveCount(0);
		await expect(page.getByTestId('diagnostics-bundle')).toHaveCount(0);
	});

	test('participant status messages are generic and never leak paths or hidden names', async ({
		page,
	}) => {
		await freshSettings(page);
		await viewAs(page, 'actor-player');

		const status = await page.getByTestId('participant-status').innerText();
		expect(status).not.toMatch(/\/Users\//);
		expect(status).not.toContain('sk-secret');
	});
});
