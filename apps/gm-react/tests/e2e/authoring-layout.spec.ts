import { expect, test, type Page } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh } from './_helpers';

/**
 * Authoring cards must fit the *usable* phone width, not merely a typical 375px
 * handset.  This guards the 320px Android/folded-device case where Page gutters
 * leave 292px and a `minmax(300px, …)` card track creates an irrecoverable
 * horizontal scroll path.
 */
async function expectMainFitsPhone(page: Page, route: string): Promise<void> {
	await gotoRoute(page, route);
	await page.locator('#main-content').waitFor({ state: 'attached' });
	await expect
		.poll(() =>
			page.locator('#main-content').evaluate((main) => ({
				clientWidth: main.clientWidth,
				scrollWidth: main.scrollWidth,
			})),
		)
		.toMatchObject({ clientWidth: expect.any(Number), scrollWidth: expect.any(Number) });
	const dimensions = await page.locator('#main-content').evaluate((main) => ({
		clientWidth: main.clientWidth,
		scrollWidth: main.scrollWidth,
	}));
	expect(
		dimensions.scrollWidth,
		`${route} must not require horizontal scrolling`,
	).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

test('populated authoring libraries fit a 320px Android viewport', async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 640 });
	await markOnboarded(page);
	await gotoRoute(page, '/');
	await seedFresh(page);

	for (const route of ['/characters', '/knowledge', '/campaign']) {
		await expectMainFitsPhone(page, route);
	}

	// The populated campaign has factions, a second independently-rendered card grid.
	await page.getByRole('tab', { name: 'Factions' }).click();
	const dimensions = await page.locator('#main-content').evaluate((main) => ({
		clientWidth: main.clientWidth,
		scrollWidth: main.scrollWidth,
	}));
	expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);

	for (const route of ['/atlas', '/audio']) {
		await expectMainFitsPhone(page, route);
	}
});

test('the character builder starts its first step without horizontal clipping on a 320px phone', async ({
	page,
}) => {
	await page.setViewportSize({ width: 320, height: 640 });
	await markOnboarded(page);
	await gotoRoute(page, '/characters');
	await seedFresh(page);

	await page.getByRole('button', { name: 'New character', exact: true }).first().click();
	await page.getByRole('button', { name: /Build from scratch/ }).click();

	const wizard = page.getByRole('dialog', { name: 'New character wizard' });
	await expect(wizard).toBeVisible();
	const dimensions = await wizard.evaluate((panel) => ({
		clientWidth: panel.clientWidth,
		scrollWidth: panel.scrollWidth,
	}));
	expect(
		dimensions.scrollWidth,
		'the phone wizard must not hide controls horizontally',
	).toBeLessThanOrEqual(dimensions.clientWidth + 1);

	// The first step retains its primary task without the desktop-only rail: the kind picker and
	// identity inputs are visible, focusable controls rather than clipped off the right edge.
	await expect(page.getByRole('button', { name: 'PC', exact: true })).toBeInViewport();
	await expect(page.getByLabel('Name')).toBeInViewport();
	await expect(page.getByLabel('Alignment')).toBeInViewport();
});

test('the wizard kit step edits attack kind and damage type as separate fields', async ({
	page,
}) => {
	await markOnboarded(page);
	await gotoRoute(page, '/characters');
	await seedFresh(page);

	await page.getByRole('button', { name: 'New character', exact: true }).first().click();
	await page.getByRole('button', { name: /Build from scratch/ }).click();
	const wizard = page.getByRole('dialog', { name: 'New character wizard' });
	await expect(wizard).toBeVisible();

	// An NPC needs no owner, so identity completes with just a name.
	await wizard.getByRole('button', { name: 'NPC', exact: true }).click();
	await wizard.getByLabel('Name').fill('Bandit Captain');
	await wizard.getByRole('button', { name: 'Continue' }).click(); // class & level
	await wizard.getByRole('button', { name: 'Continue' }).click(); // ability scores
	await wizard.getByRole('button', { name: 'Continue' }).click(); // attacks & kit

	// The seeded attack exposes BOTH fields: melee/ranged kind and the damage type. The damage
	// type used to be unreachable — the input labelled for it silently edited `kind` instead.
	const kindInput = wizard.getByLabel('Attack kind');
	const damageInput = wizard.getByLabel('Damage type');
	await expect(kindInput).toHaveValue('Melee');
	await expect(damageInput).toHaveValue('slashing');

	await damageInput.fill('fire');
	await expect(damageInput).toHaveValue('fire');
	await expect(kindInput).toHaveValue('Melee');
});

test('the wizard uses the whole phone viewport instead of floating as a fixed slab', async ({
	page,
}) => {
	// The panel's height was an unconditional `620`, while every neighbouring property already went
	// full-bleed on a phone (no scrim padding, square corners). On a 851px-tall handset that left the
	// wizard as a box with ~115px of backdrop above and below, scrolling its content inside the
	// shortfall — worst exactly where the vertical room is scarcest. Pinned at a fixed size so the
	// assertion means the same thing on both Playwright projects.
	await page.setViewportSize({ width: 393, height: 851 });
	await markOnboarded(page);
	await gotoRoute(page, '/characters');
	await seedFresh(page);

	await page.getByRole('button', { name: 'New character', exact: true }).first().click();
	await page.getByRole('button', { name: /Build from scratch/ }).click();

	const wizard = page.getByRole('dialog', { name: 'New character wizard' });
	await expect(wizard).toBeVisible();

	const box = await wizard.boundingBox();
	expect(box, 'the wizard panel must have a measurable box').not.toBeNull();
	const viewportHeight = await page.evaluate(() => window.innerHeight);
	expect(
		box!.height,
		'the phone wizard must fill the viewport, not float inside it',
	).toBeGreaterThan(viewportHeight * 0.95);
});


test('entering the wizard moves focus into it, so Tab cannot walk out behind the scrim', async ({
	page,
}) => {
	// CharBuilder returns an <Overlay> at the root in all three phases (choose / scratch / import),
	// and they were UNKEYED — React reconciled one instance across the phase change, so the
	// Overlay's mount-only focus effect never re-ran. Choosing "Build from scratch" unmounted the
	// focused PathCard and left document.activeElement on <body>; the Tab trap only wraps when focus
	// is already ON the first/last node, so from <body> the next Tab walked straight out of the
	// modal into the shell behind the scrim.
	await markOnboarded(page);
	await gotoRoute(page, '/characters');
	await seedFresh(page);

	await page.getByRole('button', { name: 'New character', exact: true }).first().click();
	await page.getByRole('button', { name: /Build from scratch/ }).click();

	const wizard = page.getByRole('dialog', { name: 'New character wizard' });
	await expect(wizard).toBeVisible();

	// Focus landed inside the wizard, not on <body>.
	const insideOnEntry = await page.evaluate(() => {
		const dialog = document.querySelector('[role="dialog"][aria-label="New character wizard"]');
		const active = document.activeElement;
		return !!dialog && !!active && active !== document.body && dialog.contains(active);
	});
	expect(insideOnEntry, 'focus must enter the wizard when its phase opens').toBe(true);

	// And it stays inside across a few Tab presses rather than escaping to the page behind.
	for (let i = 0; i < 4; i += 1) {
		await page.keyboard.press('Tab');
		const stillInside = await page.evaluate(() => {
			const dialog = document.querySelector('[role="dialog"][aria-label="New character wizard"]');
			return !!dialog && !!document.activeElement && dialog.contains(document.activeElement);
		});
		expect(stillInside, `focus escaped the wizard on Tab #${i + 1}`).toBe(true);
	}
});
