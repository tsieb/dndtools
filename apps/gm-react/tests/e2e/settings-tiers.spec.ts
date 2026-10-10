import { expect, test, type Page } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';
import { builderStep, openBuilderRail } from './_widget-builder';

test.beforeEach(async ({ page }) => {
	await markOnboarded(page);
	await gotoRoute(page, '/settings');
	await seedFresh(page);
	await page.goto('/#/settings');
	await waitReady(page);
	await page.getByRole('radio', { name: /Beginner/ }).click();
});

test('Beginner hides controls and Manage links; Expert reveals the real sections', async ({
	page,
}) => {
	await gotoRoute(page, '/');
	await expect(page.getByRole('heading', { name: 'Manage', exact: true })).toHaveCount(0);
	await expect(page.getByRole('button', { name: /Permission grants|Permissions/ })).toHaveCount(0);
	await gotoRoute(page, '/settings?tab=about');
	for (const label of [
		'Storage usage',
		'Error counts',
		'Performance marks',
		'Export diagnostics bundle',
	]) {
		await expect(page.getByRole('heading', { name: label, exact: true })).toHaveCount(0);
	}
	await gotoRoute(page, '/settings?tab=sync');
	await expect(page.getByText('Hidden at your experience level')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Vault privacy mode', exact: true })).toHaveCount(
		0,
	);
	await gotoRoute(page, '/settings?tab=permissions');
	await expect(page.getByText('Hidden at your experience level')).toBeVisible();
	await page.getByRole('button', { name: 'Show advanced settings' }).click();
	await expect(page.locator('[data-settings-section="settings.permissions.roles"]')).toBeVisible();
	await gotoRoute(page, '/settings?tab=sync');
	await expect(
		page.getByRole('heading', { name: 'Vault privacy mode', exact: true }),
	).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Local backup', exact: true })).toBeVisible();
	await gotoRoute(page, '/settings?tab=about');
	for (const label of [
		'Storage usage',
		'Error counts',
		'Performance marks',
		'Export diagnostics bundle',
	]) {
		await expect(page.getByRole('heading', { name: label, exact: true })).toBeVisible();
	}
});

test('section deep link unlocks directly and an open page follows tier changes in another window', async ({
	page,
	context,
}) => {
	await gotoRoute(page, '/settings?tab=sync&section=settings-privacy-title');
	await expect(page.getByText('Hidden at your experience level')).toBeVisible();
	await page.getByRole('button', { name: 'Show advanced settings' }).click();
	await expect(
		page.getByRole('heading', { name: 'Vault privacy mode', exact: true }),
	).toBeVisible();
	const picker = await context.newPage();
	await gotoRoute(picker, '/settings');
	await picker
		.getByRole('radiogroup', { name: 'Experience complexity' })
		.getByRole('radio', { name: /Standard/ })
		.click();
	await expect(page.getByText('Hidden at your experience level')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Vault privacy mode', exact: true })).toHaveCount(
		0,
	);
	await gotoRoute(page, '/settings?tab=sync#settings-privacy-rowCloud');
	await expect(page.getByText('Hidden at your experience level')).toBeVisible();
	await gotoRoute(page, '/settings?tab=sync');
	await expect(page.getByText('Hidden at your experience level')).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'Local backup', exact: true })).toHaveCount(0);
	await picker
		.getByRole('radiogroup', { name: 'Experience complexity' })
		.getByRole('radio', { name: /Expert/ })
		.click();
	await expect(
		page.getByRole('heading', { name: 'Vault privacy mode', exact: true }),
	).toBeVisible();
	await picker
		.getByRole('radiogroup', { name: 'Experience complexity' })
		.getByRole('radio', { name: /Beginner/ })
		.click();
	await expect(page.getByText('Hidden at your experience level')).toBeVisible();
	await picker.close();
});

/** Count the Extensions entries in the desktop More group or the phone More sheet. */
async function extensionsEntries(page: Page, isMobile: boolean): Promise<number> {
	const entry = { name: /^Extensions\b(?! &)/ };
	if (isMobile) {
		await page.getByRole('button', { name: 'More', exact: true }).click();
		const sheet = page.getByRole('dialog', { name: 'All sections' });
		await expect(sheet.getByRole('button', { name: /^Settings/ })).toBeVisible();
		const count = await sheet.getByRole('button', entry).count();
		await page.keyboard.press('Escape');
		await expect(sheet).toBeHidden();
		return count;
	}
	const toggle = page.locator('aside').getByRole('button', { name: /^More ·/ });
	if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
	await expect(page.locator('#nav-more-panel')).toBeVisible();
	return page.locator('#nav-more-panel').getByRole('button', entry).count();
}

test('RC-UX-6.4: a Beginner sees no New widget, Extensions or Permissions; Expert shows all three without a reload', async ({
	page,
	isMobile,
}) => {
	// The beforeEach chose Beginner. Every later move is a same-document hash change, and this
	// marker would not survive a reload.
	await page.evaluate(() => {
		(window as unknown as { tierNoReload: boolean }).tierNoReload = true;
	});
	const go = async (path: string) => {
		await page.evaluate((hash) => {
			window.location.hash = hash;
		}, `#${path}`);
	};
	const newWidget = page.getByRole('button', { name: /^New widget/ });
	const permissions = page.getByRole('button', { name: /^Permissions/ });

	await go('/');
	await expect(page.getByRole('button', { name: /^New character/ })).toBeVisible();
	await expect(newWidget).toHaveCount(0);
	await expect(permissions).toHaveCount(0);
	expect(await extensionsEntries(page, isMobile)).toBe(0);

	await go('/settings?tab=appearance');
	const picker = page.getByRole('radiogroup', { name: 'Experience complexity' });
	await expect(picker.getByRole('radio', { name: /Beginner/ })).toHaveAttribute(
		'aria-checked',
		'true',
	);
	await picker.getByRole('radio', { name: /Expert/ }).click();
	await expect(picker.getByRole('radio', { name: /Expert/ })).toHaveAttribute(
		'aria-checked',
		'true',
	);

	await go('/');
	await expect(newWidget).toBeVisible();
	await expect(permissions).toBeVisible();
	expect(await extensionsEntries(page, isMobile)).toBe(1);
	expect(
		await page.evaluate(() => (window as unknown as { tierNoReload?: boolean }).tierNoReload),
	).toBe(true);
});

test('RC-UX-6.4: the three experience cards list different hidden sections', async ({ page }) => {
	await gotoRoute(page, '/settings?tab=appearance');
	const lists = await page
		.locator('[data-experience-hides]')
		.evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ''));
	expect(lists).toHaveLength(3);
	expect(new Set(lists).size).toBe(3);
	expect(lists[0]).toContain('Extensions');
	expect(lists[0]).toContain('New widget');
	expect(lists[1]).toContain('Permissions');
	expect(lists[1]).not.toContain('New widget');
	expect(lists[2]).toContain('Nothing hidden');
});

test("RC-UX-6.4: a Beginner's widget builder skips Advanced and reveals it in place", async ({
	page,
}) => {
	// The beforeEach chose Beginner. The Extensions route stays open to a direct link.
	await gotoRoute(page, '/extensions');
	await page.getByRole('button', { name: 'Build a widget' }).click();
	const builder = page.getByRole('dialog', { name: /Widget builder/ });
	await expect(builder.getByRole('button', { name: /Step 1 of 7/ })).toBeVisible();
	const steps = await openBuilderRail(builder);
	await expect(steps.getByRole('button', { name: 'Identity', exact: true })).toBeVisible();
	await expect(steps.getByRole('button', { name: 'Review', exact: true })).toBeVisible();
	await expect(steps.getByRole('button', { name: 'Advanced', exact: true })).toHaveCount(0);
	await expect(builder.getByText('Custom HTML and JavaScript')).toHaveCount(0);

	const gate = builder.getByTestId('widget-builder-advanced-hidden');
	await expect(gate).toContainText('Advanced is part of the Standard toolkit');
	await gate.getByRole('button', { name: 'Switch to Standard' }).click();
	await expect(gate).toHaveCount(0);
	await builderStep(builder, 'Advanced');
	await expect(builder.getByText('Custom HTML and JavaScript')).toBeVisible();
});
