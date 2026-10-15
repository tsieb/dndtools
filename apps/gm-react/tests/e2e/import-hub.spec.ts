import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { gotoRoute, markOnboarded, preferTier, seedFresh, waitReady } from './_helpers';
import { IMPORTERS } from '../../src/app/importHub/registry';

const hub = (page: Page) => page.getByRole('dialog', { name: 'Bring your existing material' });
async function openHub(page: Page) {
	await page.evaluate(() => {
		window.location.hash = '#/settings?tab=vault';
	});
	await page.getByRole('button', { name: 'Import hub', exact: true }).first().click();
	await expect(hub(page)).toBeVisible();
}

test.beforeEach(async ({ page }, info) => {
	await preferTier(page);
	if (info.title.startsWith('empty vault')) {
		await page.goto('/#/');
		await waitReady(page);
		await expect(page.locator('[data-fullscreen-overlay="onboarding"]')).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page.locator('[data-fullscreen-overlay="onboarding"]')).toBeHidden();
		await expect
			.poll(() => page.evaluate(() => Object.keys(window.__rt!.state.maps.maps).length))
			.toBe(0);
	} else {
		await markOnboarded(page);
		await gotoRoute(page, '/');
		await seedFresh(page);
	}
});

test('all four entry points open the same complete hub; Sources names it too', async ({ page }) => {
	await page.getByRole('button', { name: 'Help', exact: true }).click();
	await page
		.getByRole('dialog', { name: 'Help', exact: true })
		.getByRole('button', { name: 'Import hub', exact: true })
		.click();
	await expect(hub(page)).toBeVisible();
	await expect(hub(page).locator('[data-importer]')).toHaveCount(Object.keys(IMPORTERS).length);
	expect((await new AxeBuilder({ page }).include('[role=dialog]').analyze()).violations).toEqual(
		[],
	);
	await hub(page).screenshot({ path: test.info().outputPath('import-hub.png') });
	await page.keyboard.press('Escape');
	await page.keyboard.press('Control+k');
	await page.getByRole('combobox').fill('Import');
	await page.getByRole('option', { name: /Import…/ }).click();
	await expect(hub(page)).toBeVisible();
	await page.keyboard.press('Escape');
	await openHub(page);
	await page.keyboard.press('Escape');
	await page.evaluate(() => {
		window.location.hash = '#/knowledge';
	});
	await page.getByRole('button', { name: 'Sources', exact: true }).click();
	await page.getByRole('button', { name: 'Import hub', exact: true }).click();
	await expect(hub(page)).toBeVisible();
	await page.keyboard.press('Escape');
	// Restore the guide in the demo vault, then use its own entry (fresh vaults show it already).
	await page.evaluate(() => {
		window.location.hash = '#/';
	});
	await page.getByRole('button', { name: 'Help', exact: true }).click();
	await page.getByRole('button', { name: 'Show the guide on the Command Center' }).click();
	await page
		.locator('[data-first-session-guide]')
		.getByRole('button', { name: 'Import hub', exact: true })
		.click();
	await expect(hub(page)).toBeVisible();
});

for (const [id, accept, destination] of [
	['markdown-zip', '.zip', '/settings'],
	['notes', '.md', '/knowledge'],
	['characters', '.json', '/characters'],
	['maps', 'image/png', '/atlas'],
	['audio', 'audio/', '/audio'],
	['backup', '.json', '/settings'],
	['module', '.dndmodule', '/community'],
	['scene', '.dndscene', '/community'],
] as const) {
	test(`${id} opens its existing picker without another click`, async ({ page }) => {
		await openHub(page);
		const chooser = page.waitForEvent('filechooser');
		await hub(page).locator(`[data-importer="${id}"] button`).click();
		const picked = await chooser;
		expect(await picked.element().getAttribute('accept')).toContain(accept);
		await expect(page).toHaveURL(new RegExp(`#${destination}`));
		await expect(hub(page)).toBeHidden();
		if (id === 'maps')
			await expect(page.getByRole('dialog', { name: 'Import map', exact: true })).toBeVisible();
		if (id === 'notes')
			await expect(page.getByRole('heading', { name: 'Import a markdown vault' })).toBeVisible();
		// Cancel on the existing input; returning to the hub must allow another fresh attempt.
		await picked.element().dispatchEvent('cancel');
	});
}

test('folder row invokes the existing directory picker, or offers ZIP on unsupported devices', async ({
	page,
}) => {
	await page.evaluate(() => {
		Object.defineProperty(window, 'showDirectoryPicker', {
			configurable: true,
			value: async () => {
				document.documentElement.dataset.folderPicked = 'yes';
				throw new DOMException('Cancelled', 'AbortError');
			},
		});
	});
	await openHub(page);
	await hub(page).locator('[data-importer="markdown-folder"] button').click();
	await expect(page.locator('html')).toHaveAttribute('data-folder-picked', 'yes');
});

test('backup launch retains the existing destructive confirmation', async ({ page }) => {
	await page.evaluate(() => {
		window.location.hash = '#/settings?tab=sync';
	});
	const download = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Download backup', exact: true }).click();
	const path = await (await download).path();
	await openHub(page);
	const chooser = page.waitForEvent('filechooser');
	await hub(page).locator('[data-importer="backup"] button').click();
	await (await chooser).setFiles(path!);
	await expect(page.getByRole('alertdialog', { name: 'Replace this vault?' })).toBeVisible();
});

test('fresh beginner can launch ZIP without changing experience level', async ({ page }) => {
	await page.evaluate(() => {
		localStorage.setItem('dndtools:react:tier', 'core');
	});
	await page.reload();
	await waitReady(page);
	await page.getByRole('button', { name: 'Help', exact: true }).click();
	await page
		.getByRole('dialog', { name: 'Help', exact: true })
		.getByRole('button', { name: 'Import hub', exact: true })
		.click();
	const chooser = page.waitForEvent('filechooser');
	await hub(page).locator('[data-importer="markdown-zip"] button').click();
	await (await chooser).element().dispatchEvent('cancel');
});

test('character file lands in the existing field review without creating a character', async ({
	page,
}) => {
	await openHub(page);
	const chooser = page.waitForEvent('filechooser');
	await hub(page).locator('[data-importer="characters"] button').click();
	await (
		await chooser
	).setFiles({
		name: 'traveller.json',
		mimeType: 'application/json',
		buffer: Buffer.from(JSON.stringify({ name: 'Hub traveller', kind: 'npc' })),
	});
	const review = page.getByRole('dialog', { name: 'Import character file' });
	await expect(review).toBeVisible();
	await expect(review.getByRole('button', { name: 'Import character', exact: true })).toBeEnabled();
});

test('system package lands in the same module review used by Community', async ({ page }) => {
	await page.evaluate(() => {
		window.location.hash = '#/community';
	});
	await page.getByRole('tab', { name: 'Export', exact: true }).click();
	const download = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Save system package', exact: true }).click();
	const path = await (await download).path();
	await openHub(page);
	const chooser = page.waitForEvent('filechooser');
	await hub(page).locator('[data-importer="module"] button').click();
	await (await chooser).setFiles(path!);
	const review = page.getByRole('dialog', { name: 'Install this module?' });
	await expect(review).toBeVisible();
	await expect(review.getByText('System package')).toBeVisible();
});

test('notes picker can be cancelled and reopened from the same route', async ({ page }) => {
	await openHub(page);
	for (let attempt = 0; attempt < 2; attempt++) {
		const chooser = page.waitForEvent('filechooser');
		await hub(page).locator('[data-importer="notes"] button').click();
		await (await chooser).element().dispatchEvent('cancel');
		await page.getByRole('button', { name: 'Import hub', exact: true }).click();
		await expect(hub(page)).toBeVisible();
	}
});

test('unsupported folder picker explains the ZIP alternative', async ({ page }) => {
	await page.evaluate(() => {
		Reflect.deleteProperty(window, 'showDirectoryPicker');
	});
	await openHub(page);
	await expect(hub(page).locator('[data-importer="markdown-folder"] button')).toBeDisabled();
	await expect(
		hub(page).getByText('Folder picking is unavailable on this device. Use Markdown ZIP instead.'),
	).toBeVisible();
});

test('empty vault map launch creates a destination then opens the existing import picker', async ({
	page,
}) => {
	await openHub(page);
	await hub(page).locator('[data-importer="maps"] button').click();
	await expect(page.getByRole('heading', { name: 'Create a new map' })).toBeVisible();
	await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Imported harbour');
	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('button', { name: 'Create map', exact: true }).click();
	await (await chooser).element().dispatchEvent('cancel');
	await expect(page.getByRole('dialog', { name: 'Import map', exact: true })).toBeVisible();
	await expect(page.getByRole('dialog', { name: 'Import map', exact: true })).toContainText(
		'Imported harbour',
	);
});

test('empty vault cancelling map creation does not leave an import intent behind', async ({
	page,
}) => {
	await openHub(page);
	await hub(page).locator('[data-importer="maps"] button').click();
	await expect(page.getByRole('heading', { name: 'Create a new map' })).toBeVisible();
	await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Discarded destination');
	await page.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Create a new map' })).toBeHidden();
	await page.getByRole('button', { name: 'New map', exact: true }).click();
	await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Manual map');
	let pickerOpened = false;
	page.on('filechooser', () => {
		pickerOpened = true;
	});
	await page.getByRole('button', { name: 'Create map', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Create a new map' })).toBeHidden();
	await expect(page.getByRole('dialog', { name: 'Import map', exact: true })).toBeHidden();
	expect(pickerOpened).toBe(false);
});
