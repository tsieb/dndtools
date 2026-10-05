import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { markOnboarded, waitReady } from './_helpers';

// ADR-042 creation defaults, with the 2026-09-29 task's unconditional skip rule.
const MODE = 'dndtools:react:vault-privacy-mode';
const DONE = 'dndtools:react:onboarded';
const ACK = 'i hold the keys';
const overlay = (page: Page) => page.locator('[data-fullscreen-overlay="onboarding"]');
const storage = (page: Page, key: string) => page.evaluate((key) => localStorage.getItem(key), key);
async function openFresh(page: Page) {
	await page.goto('/#/');
	await waitReady(page);
	await expect(overlay(page)).toBeVisible();
}
async function complexity(page: Page) {
	await overlay(page).getByLabel('Campaign name').fill('Lantern Coast');
	await overlay(page).getByRole('button', { name: 'Continue', exact: true }).click();
}
async function accessible(page: Page) {
	const result = await new AxeBuilder({ page })
		.include('[data-fullscreen-overlay="onboarding"]')
		.analyze();
	expect(result.violations).toEqual([]);
}
async function finished(page: Page) {
	await expect(overlay(page)).toBeHidden();
	await expect(page).toHaveURL(/#\/$/);
	await expect
		.poll(() =>
			page.evaluate(() =>
				document.querySelector('#main-content')?.contains(document.activeElement),
			),
		)
		.toBe(true);
}

for (const tier of ['Standard', 'Beginner']) {
	test(`${tier}: three accessible steps to a named empty campaign in five clicks`, async ({
		page,
		isMobile,
	}) => {
		test.setTimeout(90_000);
		await openFresh(page);
		const started = Date.now();
		await page.evaluate(() => {
			(window as unknown as { onboardingClicks: number }).onboardingClicks = 0;
			document
				.querySelector('[data-fullscreen-overlay="onboarding"]')!
				.addEventListener('click', () => {
					(window as unknown as { onboardingClicks: number }).onboardingClicks++;
				});
		});
		await expect(overlay(page).getByText('Step 1 of 3')).toBeVisible();
		await expect(overlay(page).getByLabel('Campaign name')).toHaveValue('');
		await expect(
			overlay(page).getByRole('button', { name: 'Continue', exact: true }),
		).toBeDisabled();
		await accessible(page);
		await overlay(page).getByLabel('Campaign name').click();
		await complexity(page);
		await expect(overlay(page).getByText('Step 2 of 3')).toBeVisible();
		await expect(overlay(page).getByRole('radio', { name: /Standard/ })).toHaveAttribute(
			'aria-checked',
			'true',
		);
		if (tier === 'Beginner')
			await overlay(page)
				.getByRole('radio', { name: /Beginner/ })
				.click();
		await expect(overlay(page).getByText(/E2EE|Private \(E2EE\)|hold the keys/)).toHaveCount(0);
		const descriptions = await overlay(page).getByRole('radio').allTextContents();
		expect(new Set(descriptions.map((text) => text.slice(text.indexOf('Hides')))).size).toBe(3);
		await accessible(page);
		await overlay(page).getByRole('button', { name: 'Continue', exact: true }).click();
		await expect(overlay(page).getByText('Step 3 of 3')).toBeVisible();
		await expect(overlay(page).getByText(/including secrets/)).toBeVisible();
		await expect(
			overlay(page).getByRole('link', { name: 'Settings › Backup & history' }),
		).toBeVisible();
		await accessible(page);
		await overlay(page).getByRole('button', { name: 'Open the Command Center' }).click();
		await finished(page);
		expect(Date.now() - started).toBeLessThan(60_000);
		expect(
			await page.evaluate(
				() => (window as unknown as { onboardingClicks: number }).onboardingClicks,
			),
		).toBeLessThanOrEqual(5);
		expect(await storage(page, MODE)).toBe('cloud-enhanced');
		expect(await storage(page, 'dndtools:react:vault-privacy-disclosure')).toContain(
			'including secrets',
		);
		expect(await storage(page, DONE)).toBe('done');
		if (!isMobile)
			await expect(page.locator('aside').getByText('Lantern Coast', { exact: true })).toBeVisible();
		expect(
			await page.evaluate(() => {
				const state = window.__rt!.state as unknown as {
					characters: { characters: object };
					maps: { maps: object };
					content: { items: object };
				};
				return [
					Object.keys(state.characters.characters).length,
					Object.keys(state.maps.maps).length,
					Object.keys(state.content.items).length,
				];
			}),
		).toEqual([0, 0, 0]);
		await page.reload();
		await waitReady(page);
		await expect(overlay(page)).toBeHidden();
		expect(await storage(page, MODE)).toBe('cloud-enhanced');
	});
}

test('Expert: explicit choice, visible mismatch, acknowledgement, accessible steps and layout', async ({
	page,
	isMobile,
}) => {
	await openFresh(page);
	await accessible(page);
	await complexity(page);
	await overlay(page)
		.getByRole('radio', { name: /Expert/ })
		.click();
	await expect(
		overlay(page).getByRole('radio', { name: 'Private (E2EE)', exact: true }),
	).not.toBeChecked();
	await expect(overlay(page).getByText('Choose a storage mode to continue.')).toBeVisible();
	await overlay(page).getByRole('radio', { name: 'Private (E2EE)', exact: true }).check();
	await expect(overlay(page).getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
	await overlay(page).getByLabel(`Type “${ACK}” to confirm`).fill('i hold the key');
	await expect(overlay(page).getByRole('alert')).toContainText('The phrase does not match');
	await expect(overlay(page).getByLabel(`Type “${ACK}” to confirm`)).toHaveAttribute(
		'aria-invalid',
		'true',
	);
	await accessible(page);
	if (!isMobile) {
		expect(
			await overlay(page)
				.locator('[data-onboarding-content]')
				.evaluate((el) => el.scrollHeight <= el.clientHeight),
		).toBe(true);
	}
	await overlay(page).getByLabel(`Type “${ACK}” to confirm`).fill(ACK);
	await overlay(page).getByRole('button', { name: 'Continue', exact: true }).click();
	await accessible(page);
	await overlay(page).getByRole('button', { name: 'Open the Command Center' }).click();
	await finished(page);
	expect(await storage(page, MODE)).toBe('private-e2ee');
});

test('Expert can explicitly select Cloud-Enhanced', async ({ page }) => {
	await openFresh(page);
	await complexity(page);
	await overlay(page)
		.getByRole('radio', { name: /Expert/ })
		.click();
	await overlay(page).getByRole('radio', { name: 'Cloud-Enhanced', exact: true }).check();
	await overlay(page).getByRole('button', { name: 'Continue', exact: true }).click();
	await overlay(page).getByRole('button', { name: 'Open the Command Center' }).click();
	await finished(page);
	expect(await storage(page, MODE)).toBe('cloud-enhanced');
});

for (const method of ['button', 'escape', 'platform-back']) {
	test(`skip from step one with ${method} records defaults`, async ({ page }) => {
		await openFresh(page);
		await expect(overlay(page).getByText(/including secrets/)).toBeVisible();
		if (method === 'button')
			await overlay(page).getByRole('button', { name: 'Skip setup' }).click();
		else if (method === 'escape') {
			await overlay(page).getByLabel('Campaign name').focus();
			await page.keyboard.press('Escape');
		} else
			await page.evaluate(async () => {
				const modulePath = '/src/platform/backNavigation.ts';
				const { handlePlatformBack } = await import(/* @vite-ignore */ modulePath);
				await handlePlatformBack({
					atRootDestination: true,
					canGoBack: false,
					navigateBack() {},
					navigateToRoot() {},
					minimize() {},
				});
			});
		await finished(page);
		expect(await storage(page, DONE)).toBe('skipped');
		expect(await storage(page, MODE)).toBe('cloud-enhanced');
		expect(await storage(page, 'dndtools:react:tier')).toBe('intermediate');
	});
}

test('a skipped Expert can defer storage without a modal', async ({ page }) => {
	await page.addInitScript(() => localStorage.setItem('dndtools:react:tier', 'advanced'));
	await openFresh(page);
	await overlay(page).getByRole('button', { name: 'Skip setup' }).click();
	await finished(page);
	expect(await storage(page, MODE)).toBeNull();
	expect(await page.getByRole('dialog').count()).toBe(0);
});

test('Generic system persists, and replay cannot change an existing mode', async ({ page }) => {
	await openFresh(page);
	await overlay(page).getByLabel('Game system').selectOption({ label: 'Generic' });
	await complexity(page);
	await overlay(page)
		.getByRole('radio', { name: /Expert/ })
		.click();
	await overlay(page).getByRole('radio', { name: 'Private (E2EE)', exact: true }).check();
	await overlay(page).getByLabel(`Type “${ACK}” to confirm`).fill(ACK);
	await overlay(page).getByRole('button', { name: 'Continue', exact: true }).click();
	await overlay(page).getByRole('button', { name: 'Open the Command Center' }).click();
	await finished(page);
	expect(
		await page.evaluate(
			() => (window.__rt!.state.systems as { activePackageId: string }).activePackageId,
		),
	).toContain('generic');
	await page.evaluate(() => {
		localStorage.removeItem('dndtools:react:onboarded');
		window.dispatchEvent(new Event('dndtools:onboarding-replay'));
	});
	await complexity(page);
	await overlay(page)
		.getByRole('radio', { name: /Beginner/ })
		.click();
	await overlay(page).getByRole('button', { name: 'Skip setup' }).click();
	await finished(page);
	expect(await storage(page, MODE)).toBe('private-e2ee');
});

test('existing gate hook still loads the seeded fixture', async ({ page }) => {
	await markOnboarded(page);
	await page.goto('/#/');
	await waitReady(page);
	await expect(overlay(page)).toBeHidden();
	expect(
		await page.evaluate(
			() =>
				Object.keys((window.__rt!.state.characters as { characters: object }).characters).length,
		),
	).toBeGreaterThan(0);
});
