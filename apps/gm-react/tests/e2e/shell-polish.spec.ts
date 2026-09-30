import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { gotoRoute, markOnboarded } from './_helpers';

const themes = ['tavern', 'parchment', 'scholar', 'dungeon', 'high-contrast'];
const phone = (page: Page) => (page.viewportSize()?.width ?? 1280) <= 640;
async function axe(page: Page) {
	const results = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
		.analyze();
	expect(results.violations).toEqual([]);
}
async function openVaults(page: Page) {
	if (phone(page)) await page.getByRole('button', { name: 'More', exact: true }).click();
	await page.getByRole('button', { name: /^Local vaults/ }).click();
	return page.getByRole('dialog', { name: 'Local vaults' });
}

test.beforeEach(async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await markOnboarded(page);
	await gotoRoute(page, '/screens');
});

test('shell and navigation overlays are axe clean in all five themes', async ({ page }) => {
	// Up to seven complete axe scans per theme; allow the serial matrix time on shared CI.
	test.setTimeout(60_000);
	for (const theme of themes) {
		await page.evaluate(
			(value) => document.documentElement.setAttribute('data-theme', value),
			theme,
		);
		await axe(page);
		await page.keyboard.press('Control+k');
		await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
		await axe(page);
		await page.keyboard.press('Escape');
		await page.getByRole('button', { name: 'Help', exact: true }).click();
		await expect(page.getByRole('dialog', { name: 'Help' })).toBeVisible();
		await axe(page);
		await page.keyboard.press('Escape');
		await page.locator('#main-content').focus();
		await page.keyboard.press('?');
		await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
		await axe(page);
		await page.keyboard.press('Escape');
		if (phone(page)) {
			await page.getByRole('button', { name: 'Table controls', exact: true }).click();
			await axe(page);
			await page.keyboard.press('Escape');
			await page.getByRole('button', { name: 'More', exact: true }).click();
			await axe(page);
			await page.keyboard.press('Escape');
		}
		const vaults = await openVaults(page);
		await expect(vaults.getByRole('textbox')).toBeVisible();
		await axe(page);
		await page.keyboard.press('Escape');
	}
});

test('keyboard skip, palette focus return, empty queue feedback and large text', async ({
	page,
}) => {
	const skip = page.getByRole('link', { name: 'Skip to content' });
	await skip.focus();
	await page.keyboard.press('Enter');
	await expect(page.locator('#main-content')).toBeFocused();
	await expect(page).toHaveURL(/#\/screens$/);
	await page.keyboard.press('Control+ArrowRight');
	await expect(page.getByText('Queue a scene card first.', { exact: true })).toBeVisible();
	const search = page
		.locator('header')
		.getByRole('button', { name: /Search/ })
		.first();
	await search.focus();
	await page.keyboard.press('Enter');
	await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(search).toBeFocused();
	await page.evaluate(() => {
		document.documentElement.style.fontSize = '200%';
	});
	await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
	await search.click();
	await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
	await page.keyboard.press('Escape');
	const vaults = await openVaults(page);
	await expect(vaults.getByRole('textbox')).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('vault catalog failure is actionable, announced and axe clean', async ({ page }) => {
	await page.evaluate(() => localStorage.setItem('dndtools:react:local-vaults-v1', '{broken'));
	const vaults = await openVaults(page);
	await expect(vaults.getByRole('alert')).toContainText('check device storage');
	await expect(vaults.getByRole('textbox')).toBeDisabled();
	await axe(page);
	await page.keyboard.press('Escape');
	await expect(vaults).toBeHidden();
});

test('rail vault target stays reachable at tablet width', async ({ page }) => {
	await page.setViewportSize({ width: 834, height: 1112 });
	const trigger = page
		.getByRole('navigation', { name: 'Primary', exact: true })
		.getByRole('button', { name: 'Local vaults', exact: true });
	await expect(trigger).toBeVisible();
	const box = await trigger.boundingBox();
	expect(box?.width).toBeGreaterThanOrEqual(44);
	expect(box?.height).toBeGreaterThanOrEqual(44);
	await trigger.click();
	await expect(
		page.getByRole('dialog', { name: 'Local vaults' }).getByRole('textbox'),
	).toBeVisible();
	await axe(page);
});

test('lazy vault opening announces loading and can be dismissed', async ({ page }) => {
	let release!: () => void;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route('**/src/app/shell/VaultSwitcher.tsx*', async (route) => {
		await held;
		await route.continue();
	});
	try {
		const vaults = await openVaults(page);
		await expect(vaults.getByRole('status')).toHaveText('Loading your vaults…');
		await axe(page);
		await page.keyboard.press('Escape');
		await expect(vaults).toBeHidden();
	} finally {
		release();
	}
});

test('vault creation recovers from storage failure and confirms the durable save inline', async ({
	page,
}) => {
	const vaults = await openVaults(page);
	await page.evaluate(() => {
		const original = Storage.prototype.setItem;
		Storage.prototype.setItem = function (key, value) {
			if (key === 'dndtools:react:local-vaults-v1' && value.includes('Full device')) {
				throw new DOMException('Test storage full', 'QuotaExceededError');
			}
			original.call(this, key, value);
		};
	});
	await vaults.getByRole('textbox').fill('Full device');
	await vaults.getByRole('button', { name: 'Create vault', exact: true }).click();
	await expect(vaults.getByRole('alert')).toContainText('Check device storage and try again');
	await expect(vaults.getByRole('button', { name: 'Open Full device' })).toHaveCount(0);
	await axe(page);
	await vaults.getByRole('textbox').fill('Polish campaign');
	await vaults.getByRole('button', { name: 'Create vault', exact: true }).click();
	await expect(vaults.getByRole('status')).toHaveText('Vault saved.');
	await expect(vaults.getByRole('button', { name: 'Open Polish campaign' })).toBeVisible();
	await page.keyboard.press('Escape');
	await openVaults(page);
	await expect(vaults.getByRole('button', { name: 'Open Polish campaign' })).toBeVisible();
});

test('Spanish shortcut feedback and vault failure are localized', async ({ page }) => {
	await page.evaluate(() => localStorage.setItem('dndtools:locale', 'es'));
	await page.reload();
	await expect(page.locator('html')).toHaveAttribute('lang', 'es');
	await page.locator('#main-content').focus();
	await page.keyboard.press('Control+ArrowRight');
	await expect(
		page.getByText('Añade primero una tarjeta de escena a la cola.', { exact: true }),
	).toBeVisible();
	await page.evaluate(() => localStorage.setItem('dndtools:react:local-vaults-v1', '{broken'));
	if (phone(page)) await page.getByRole('button', { name: 'Más', exact: true }).click();
	await page.getByRole('button', { name: /^Bóvedas locales/ }).click();
	await expect(
		page.getByRole('dialog', { name: 'Bóvedas locales' }).getByRole('alert'),
	).toContainText('revisa el almacenamiento del dispositivo');
});

test('phone More announces its sheet and restores focus', async ({ page }) => {
	await page.setViewportSize({ width: 393, height: 851 });
	const more = page.getByRole('button', { name: 'More', exact: true });
	await expect(more).toHaveAttribute('aria-haspopup', 'dialog');
	await expect(more).toHaveAttribute('aria-expanded', 'false');
	await more.focus();
	await page.keyboard.press('Enter');
	await expect(page.getByRole('dialog', { name: 'All sections' })).toBeVisible();
	// Modal focus isolation removes the background from the accessibility tree, not the DOM.
	await expect(page.locator('button[aria-haspopup="dialog"][aria-expanded="true"]')).toHaveCount(1);
	await page.keyboard.press('Escape');
	await expect(more).toBeFocused();
	await expect(more).toHaveAttribute('aria-expanded', 'false');
});

test('cold palette opening announces loading and remains dismissible', async ({ page }) => {
	let release!: () => void;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route('**/src/app/CommandPalette.tsx*', async (route) => {
		await held;
		await route.continue();
	});
	try {
		const search = page
			.locator('header')
			.getByRole('button', { name: /Search/ })
			.first();
		await search.focus();
		await page.keyboard.press('Enter');
		const loading = page.getByRole('status', { name: 'Search', exact: true });
		await expect(loading).toContainText('Loading');
		await axe(page);
		await loading.getByRole('button', { name: 'Cancel' }).click();
		await expect(loading).toBeHidden();
		await expect(search).toBeFocused();
		await page.keyboard.press('Enter');
		await expect(loading).toBeVisible();
		await loading.getByRole('button', { name: 'Cancel' }).focus();
		const back = await page.evaluate(async () => {
			const url = '/src/platform/backNavigation.ts';
			const nav = (await import(
				/* @vite-ignore */ url
			)) as typeof import('../../src/platform/backNavigation');
			let navigated = false;
			const result = await nav.handlePlatformBack({
				atRootDestination: false,
				canGoBack: true,
				navigateBack: () => {
					navigated = true;
				},
				navigateToRoot: () => {
					navigated = true;
				},
				minimize: () => undefined,
			});
			return { result, navigated };
		});
		expect(back).toEqual({ result: 'overlay', navigated: false });
		await expect(loading).toBeHidden();
		await expect(search).toBeFocused();
		await page.keyboard.press('Enter');
		release();
		await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(search).toBeFocused();
	} finally {
		release();
	}
});

test('vault loading hands focus back to the rail launcher after the ready dialog closes', async ({
	page,
}) => {
	await page.setViewportSize({ width: 834, height: 1112 });
	const trigger = page
		.getByRole('navigation', { name: 'Primary', exact: true })
		.getByRole('button', { name: 'Local vaults', exact: true });
	await expect(trigger).toBeVisible();
	let release!: () => void;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route('**/src/app/shell/VaultSwitcher.tsx*', async (route) => {
		await held;
		await route.continue();
	});
	try {
		await trigger.focus();
		await page.keyboard.press('Enter');
		const vaults = page.getByRole('dialog', { name: 'Local vaults' });
		await expect(vaults.getByRole('status')).toHaveText('Loading your vaults…');
		release();
		await expect(vaults.getByRole('textbox')).toBeVisible();
		await expect(vaults.locator(':focus')).toHaveCount(1);
		await page.keyboard.press('Escape');
		await expect(trigger).toBeFocused();
	} finally {
		release();
	}
});
