import { expect, test, type Page } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// RC-WID-6.7 — install and trust in the GM's words. Both profiles:
// - Install on the bundled Torchlight starter (code, but no permissions) enables it in that one
//   click: no review sheet, no switch. The card says "Bundled · no permissions", and the board's
//   Add panel places it with one more pick, where its own code draws.
// - "Generate with assistant" says what is missing on the card, and its link opens Settings › AI &
//   tools (behind Settings' own "show advanced" gate at the default level). No dialog opens to say
//   the same thing.

interface PackageLite {
	enabled: boolean;
	trust: { state: string; hostPermissions: Record<string, string> };
}

function packageRecord(page: Page, id: string): Promise<PackageLite | null> {
	return page.evaluate(
		(packageId) =>
			((window.__rt!.state.widgets as { packages: Record<string, PackageLite> }).packages[
				packageId
			] ?? null) as PackageLite | null,
		id,
	);
}

/** The placed copies of a widget type on the home board, by instance id. */
function placed(page: Page, type: string): Promise<string[]> {
	return page.evaluate((widgetType) => {
		const rt = window.__rt!;
		const scene = rt.state.scenes.scenes[rt.state.commandCenter.homeSceneId!]!;
		return scene.widgets.filter((w) => w.type === widgetType).map((w) => w.id);
	}, type);
}

const gallery = (page: Page) => page.getByTestId('add-widget-gallery');

async function openAdd(page: Page): Promise<void> {
	await gotoRoute(page, '/board');
	await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
	await expect(page.getByTestId('scene-board-bounded')).toBeVisible();
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(gallery(page)).toBeVisible();
}

test('Install on Torchlight enables it in one click, and one pick places it', async ({ page }) => {
	await markOnboarded(page);
	await gotoRoute(page, '/extensions');
	await seedFresh(page);
	await gotoRoute(page, '/extensions');
	await waitReady(page);
	expect(await packageRecord(page, 'starter.torchlight')).toBeNull();

	// The one click.
	await page.getByRole('button', { name: 'Install Torchlight', exact: true }).click();

	const card = page.getByTestId('package-card-starter.torchlight');
	await expect(card.getByTestId('package-status')).toHaveText('Bundled · no permissions');
	await expect(card.getByRole('switch', { name: 'Enable Torchlight' })).toBeChecked();
	await expect(page.getByText('Installed Torchlight. It is on and ready to place.')).toBeVisible();
	// No review sheet was asked for, and nothing was granted: on, every permission still denied.
	await expect(page.getByRole('dialog')).toHaveCount(0);
	const record = await packageRecord(page, 'starter.torchlight');
	expect(record).toMatchObject({ enabled: true, trust: { state: 'unreviewed' } });
	expect(Object.values(record!.trust.hostPermissions).every((d) => d === 'denied')).toBe(true);

	// Placing it: its row is addable straight away (no in-place Enable), and one pick places it.
	await openAdd(page);
	await expect(gallery(page).getByRole('button', { name: 'Enable Torchlight' })).toHaveCount(0);
	await gallery(page).getByRole('button', { name: 'Add Torchlight', exact: true }).click();
	await expect.poll(() => placed(page, 'torchlight')).toHaveLength(1);
	const [id] = await placed(page, 'torchlight');
	await expect(page.getByTestId(`widget-${id}`)).toBeFocused();
	await expect(page.getByTestId('add-widget-announcement')).toHaveText('Added Torchlight');
	// …and its own sandboxed code ran and drew its reading.
	await expect(
		page.frameLocator('iframe[data-widget-sandbox="torchlight"]').locator('[data-reading]'),
	).toContainText('of 10');
});

test('the Generate card names the missing provider and links to Settings › AI & tools', async ({
	page,
}) => {
	await markOnboarded(page);
	// The assistant is switched on, but no provider is set up.
	await page.addInitScript(() => {
		localStorage.setItem('dndtools.ai.usage-preference', 'complete');
	});
	await gotoRoute(page, '/board');
	await seedFresh(page);
	await openAdd(page);

	const more = gallery(page).getByRole('group', { name: 'More ways to add' });
	const card = more.getByRole('group', { name: 'Generate with assistant' });
	await expect(card).toContainText('No AI provider is set up.');
	// The card is not a button that opens a dialog; the only control on it is the link.
	await expect(more.getByRole('button', { name: 'Generate with assistant' })).toHaveCount(0);
	await card.getByRole('link', { name: 'Open Settings › AI & tools' }).click();

	await expect(page).toHaveURL(/#\/settings\?tab=ai$/);
	await expect(page.getByRole('dialog', { name: 'Generate a widget' })).toHaveCount(0);
	// At the default experience level Settings says the AI tab is advanced and offers to show it
	// (its own deep-link gate); one press later the provider form is there.
	const main = page.getByRole('main');
	await expect(
		main.getByRole('heading', { name: 'Hidden at your experience level' }),
	).toBeVisible();
	await expect(main.locator('strong', { hasText: 'AI & tools' })).toBeVisible();
	await main.getByRole('button', { name: 'Show advanced settings' }).click();
	await expect(page.getByLabel('Provider API key')).toBeVisible();
});
