import { expect, test, type Page } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// SYSTEM PACKAGE PICKER (RC-SYS-3.1) — the Extensions › System tab is the front door to the rules
// system a campaign plays. The gallery lists the packages actually installed in the `systems` slice
// and each card describes what THAT package declares; choosing one opens the pure
// `previewSystemPackageSelect` dry-run and applies through the real `system.select` command. Every
// assertion drives the real UI and then reads the durable slice through `__rt` — never a test id.

const DND5E = 'builtin:dnd5e';
const GENERIC = 'builtin:generic';

/** The campaign's active system package id, straight off the durable slice. */
function activeSystemId(page: Page): Promise<string> {
	return page.evaluate(
		() => (window.__rt!.state.systems as { activePackageId: string }).activePackageId,
	);
}

async function openSystemTab(page: Page): Promise<void> {
	await page.getByRole('tab', { name: 'System' }).click();
	await expect(page.getByText('Choose a system')).not.toHaveCount(0);
}

/**
 * Drive the picker end to end for one package: open its detail, preview the switch, acknowledge the
 * dry-run's drops when it has any, apply, and wait for the slice to carry the new active id.
 */
async function switchTo(page: Page, name: string, expectedId: string): Promise<void> {
	await page
		.getByRole('button', { name: new RegExp(`^${name}`) })
		.first()
		.click();
	await expect(page.getByText('What this package declares')).toBeVisible();

	await page.getByRole('button', { name: 'Preview this system' }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog.getByText(`Switch to ${name}`).first()).toBeVisible();
	// Nothing has changed yet — the dry-run is a read.
	expect(await activeSystemId(page)).not.toBe(expectedId);

	const ack = dialog.getByRole('checkbox', { name: 'I understand' });
	if ((await ack.count()) > 0) await ack.click();
	await dialog.getByRole('button', { name: 'Switch system' }).click();

	await page.waitForFunction(
		(id) => (window.__rt!.state.systems as { activePackageId: string }).activePackageId === id,
		expectedId,
		{ timeout: 10_000 },
	);
}

test.describe('system package picker', () => {
	test.beforeEach(async ({ page }) => {
		// Each test wipes the vault and reloads, so the whole file pays the dev server's cold compile
		// in parallel on the first run; 30s is not enough room for that on a loaded machine.
		test.slow();
		await markOnboarded(page);
		await gotoRoute(page, '/extensions');
		await seedFresh(page);
		await waitReady(page);
		await openSystemTab(page);
	});

	test('the gallery describes every installed package and marks the active one', async ({
		page,
	}) => {
		// Both built-ins are seeded by the build, so both are pickable on a fresh vault.
		await expect(page.getByRole('button', { name: /^D&D 5e/ })).toHaveCount(1);
		await expect(page.getByRole('button', { name: /^Generic/ })).toHaveCount(1);

		// The chips are read off the package: 5e declares six attributes, Generic declares none.
		const fivee = page.getByRole('button', { name: /^D&D 5e/ });
		await expect(fivee).toContainText('6 attributes');
		await expect(fivee).toContainText('d20 plus modifier');
		await expect(page.getByRole('button', { name: /^Generic/ })).toContainText('0 attributes');

		// Active-package context, in text and not by colour alone.
		await expect(fivee).toContainText('Active');
		expect(await activeSystemId(page)).toBe(DND5E);

		// The build-your-own entry is present in the gallery.
		await expect(page.getByRole('button', { name: /Build your own/ })).toHaveCount(1);
	});

	test('selects Generic through the dry-run dialog and back', async ({ page }) => {
		expect(await activeSystemId(page)).toBe(DND5E);

		await switchTo(page, 'Generic', GENERIC);
		// The detail view follows the campaign: Generic is what the campaign now runs, so its switch
		// control is replaced by the plain statement of fact.
		await expect(page.getByText('This is the system your campaign is running.')).toBeVisible();

		// …and back. The gallery is one click away from the detail view.
		await page.getByRole('button', { name: 'All systems' }).click();
		await expect(page.getByRole('button', { name: /^Generic/ })).toContainText('Active');
		await expect(page.getByRole('button', { name: /^D&D 5e/ })).toHaveCount(1);

		await switchTo(page, 'D&D 5e', DND5E);
		expect(await activeSystemId(page)).toBe(DND5E);
	});

	test('build your own forks the package into the gallery', async ({ page }) => {
		await page.getByRole('button', { name: /Build your own/ }).click();
		const dialog = page.getByRole('dialog');
		await expect(dialog.getByText('Fork a system')).toBeVisible();

		const name = dialog.getByRole('textbox').first();
		await name.fill('Table rules');
		await dialog.getByRole('button', { name: 'Create the fork' }).click();

		// A fork is a real, durable package in the `custom:` namespace — not a placeholder.
		await page.waitForFunction(
			() =>
				Object.keys(
					(window.__rt!.state.systems as { packages: Record<string, unknown> }).packages,
				).some((id) => id.startsWith('custom:')),
			null,
			{ timeout: 10_000 },
		);
		await expect(page.getByRole('button', { name: /^Table rules/ })).toContainText('Forked');
	});
});
