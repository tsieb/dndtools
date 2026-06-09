import { expect, test, type Page } from '@playwright/test';
import { openSection } from './_nav-helper';

// NAV-001 / NAV-009: the Command Center is the home surface, and the canonical
// top-level Navigation Section registry roots every section with an owner, route root,
// landmark, actor availability, and release status. Opening a section makes route,
// landmark, and title reflect it; DM-only sections never appear for players/observers.

/** Reset to a known-empty vault on the given route. */
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

test.describe('NAV-001 home and canonical section reflection', () => {
	test('the home surface is the Command Center, reflected in landmark and title (AC1)', async ({
		page,
	}) => {
		await freshAt(page, '/', 'command-center');

		await expect(page.getByTestId('command-center')).toBeVisible();
		// Route landmark and page title reflect the canonical home section.
		await expect(page.getByTestId('route-landmark')).toHaveAttribute(
			'data-section-landmark',
			'command-center',
		);
		await expect(page).toHaveTitle(/Command Center/);
	});

	test('opening a section makes route, landmark, and title reflect the canonical section (AC2)', async ({
		page,
	}) => {
		await freshAt(page, '/', 'command-center');

		// Command Center → Atlas (a global section reached through the primary nav on every profile).
		await openSection(page, 'atlas');
		await page.getByTestId('atlas-view').waitFor({ state: 'visible' });
		await expect(page).toHaveURL(/\/atlas\/?$/);
		await expect(page.getByTestId('route-landmark')).toHaveAttribute(
			'data-section-landmark',
			'atlas',
		);
		await expect(page).toHaveTitle(/Atlas/);

		// Atlas → Settings (overflow on the compact tab bar; the helper opens "More" when needed).
		await openSection(page, 'settings');
		await page.getByTestId('settings-view').waitFor({ state: 'visible' });
		await expect(page).toHaveURL(/\/settings\/?$/);
		await expect(page.getByTestId('route-landmark')).toHaveAttribute(
			'data-section-landmark',
			'settings',
		);
		await expect(page).toHaveTitle(/Settings/);

		// Settings → back to the Command Center home.
		await openSection(page, 'command-center');
		await page.getByTestId('command-center').waitFor({ state: 'visible' });
		await expect(page.getByTestId('route-landmark')).toHaveAttribute(
			'data-section-landmark',
			'command-center',
		);
	});
});

test.describe('NAV-009 canonical section registry view', () => {
	test('the Settings registry lists the approved IA for the DM with owners and release status', async ({
		page,
	}) => {
		await freshAt(page, '/settings/', 'settings-view');

		const registry = page.getByTestId('settings-ia-registry');
		await expect(registry).toBeVisible();
		// Released home plus approved-but-planned sections from NAV-001 are all maintained.
		await expect(page.getByTestId('ia-section-command-center')).toContainText('Command Center');
		await expect(page.getByTestId('ia-section-command-center')).toContainText('home');
		await expect(page.getByTestId('ia-status-command-center')).toContainText('reachable');
		await expect(page.getByTestId('ia-section-knowledge')).toContainText('owner: CONTENT');
		await expect(page.getByTestId('ia-status-knowledge')).toContainText('planned');
		// DM-only sections are present for the DM.
		await expect(page.getByTestId('ia-section-scenes')).toBeVisible();
		await expect(page.getByTestId('ia-section-audio')).toBeVisible();
		await expect(page.getByTestId('ia-section-mcp')).toBeVisible();
	});

	test('DM-only sections are absent from player navigation data (AC2)', async ({ page }) => {
		await freshAt(page, '/settings/', 'settings-view');
		await viewAs(page, 'actor-player');

		// The player keeps the home and player-available sections...
		await expect(page.getByTestId('ia-section-command-center')).toBeVisible();
		await expect(page.getByTestId('ia-section-knowledge')).toBeVisible();
		// ...but DM-only sections (Scenes authoring, Audio, MCP) are absent entirely.
		await expect(page.getByTestId('ia-section-scenes')).toHaveCount(0);
		await expect(page.getByTestId('ia-section-audio')).toHaveCount(0);
		await expect(page.getByTestId('ia-section-mcp')).toHaveCount(0);
		// The registry never leaks a hidden section's name into player data.
		await expect(page.getByTestId('settings-ia-registry')).not.toContainText('MCP');

		// And the DM-only Scenes authoring section is absent from the primary nav too (AC3).
		await expect(page.getByTestId('nav-scenes')).toHaveCount(0);
	});
});
