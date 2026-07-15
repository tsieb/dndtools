import { expect, test, type Page } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh } from './_helpers';

const ROUTES = [
	'/',
	'/session',
	'/scenes',
	'/characters',
	'/atlas',
	'/campaign',
	'/knowledge',
	'/graph',
	'/audio',
	'/extensions',
	'/community',
	'/upgrade',
	'/player',
	'/settings',
	'/board',
];

async function clippedControls(page: Page, rootSelector = 'body'): Promise<string[]> {
	return page
		.locator(rootSelector)
		.locator('button, input, select, textarea, [role="tab"]')
		.evaluateAll((elements) =>
			elements.flatMap((element) => {
				const rect = element.getBoundingClientRect();
				const style = getComputedStyle(element);
				if (
					rect.width === 0 ||
					rect.height === 0 ||
					style.display === 'none' ||
					style.visibility === 'hidden' ||
					(rect.left >= -1 && rect.right <= window.innerWidth + 1)
				) {
					return [];
				}
				const name =
					element.getAttribute('aria-label') || element.textContent?.trim() || element.tagName;
				return [
					`${name.replace(/\s+/g, ' ').slice(0, 60)} (${Math.round(rect.left)}–${Math.round(rect.right)})`,
				];
			}),
		);
}

async function horizontalDimensions(
	page: Page,
	selector: string,
): Promise<{
	clientWidth: number;
	scrollWidth: number;
}> {
	return page.locator(selector).evaluate((element) => ({
		clientWidth: element.clientWidth,
		scrollWidth: element.scrollWidth,
	}));
}

async function expectNoHorizontalOverflow(
	page: Page,
	label: string,
	selector = 'html',
	soft = false,
) {
	const dimensions = await horizontalDimensions(page, selector);
	const assertion = soft
		? expect.soft(dimensions.scrollWidth, `${label} widened ${selector}`)
		: expect(dimensions.scrollWidth, `${label} widened ${selector}`);
	assertion.toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

async function openFirstRun(page: Page): Promise<void> {
	await page.goto('/#/', { waitUntil: 'domcontentloaded' });
	await page.waitForFunction(() => !!window.__rt && window.__rt.loaded === true, null, {
		timeout: 20_000,
	});
	await page.getByRole('dialog', { name: 'First-run setup' }).waitFor({
		state: 'visible',
		timeout: 20_000,
	});
}

async function expectOnboardingStep(
	page: Page,
	step: number,
	actionLabel: 'Get started' | 'Continue' | 'Enter Command Center',
) {
	const dialog = page.getByRole('dialog', { name: 'First-run setup' });
	const action = dialog.getByRole('button', { name: actionLabel });
	await expect(dialog.getByText(`Step ${step} of 5`, { exact: true })).toBeVisible();
	await expect(dialog.getByRole('button', { name: 'Skip setup' })).toBeInViewport();
	if (step > 1) await expect(dialog.getByRole('button', { name: 'Back' })).toBeInViewport();
	await expect(action).toBeVisible();
	await expect(action).toBeInViewport();
	await expectNoHorizontalOverflow(page, `onboarding step ${step}`);
	await expectNoHorizontalOverflow(
		page,
		`onboarding step ${step}`,
		'[role="dialog"][aria-label="First-run setup"]',
	);
	expect(
		await clippedControls(page, '[role="dialog"][aria-label="First-run setup"]'),
		`onboarding step ${step} clipped a control`,
	).toEqual([]);
}

for (const viewport of [
	{ name: 'compact phone', width: 375, height: 812 },
	{ name: 'phone breakpoint', width: 640, height: 700 },
	{ name: 'rail breakpoint', width: 641, height: 700 },
	{ name: 'desktop-window minimum', width: 720, height: 520 },
	{ name: 'release rail window', width: 1024, height: 600 },
	{ name: 'desktop navigation breakpoint', width: 1025, height: 600 },
	{ name: 'release compact desktop', width: 1280, height: 720 },
	{ name: 'release standard desktop', width: 1440, height: 900 },
	{ name: 'release large desktop', width: 1920, height: 1080 },
]) {
	test(`primary routes keep controls reachable at ${viewport.name}`, async ({ page }) => {
		await page.setViewportSize({ width: viewport.width, height: viewport.height });
		await markOnboarded(page);
		await gotoRoute(page, '/');
		await seedFresh(page);

		for (const route of ROUTES) {
			await page.evaluate((next) => {
				window.location.hash = next;
			}, route);
			await page.waitForFunction((next) => window.location.hash === `#${next}`, route);
			await page.locator('h1').first().waitFor({ state: 'attached', timeout: 20_000 });
			await page.waitForTimeout(100);

			await expectNoHorizontalOverflow(page, route, '#main-content', true);
			expect
				.soft(await clippedControls(page), `${route} clipped an interactive control`)
				.toEqual([]);
		}
	});
}

test('the 640/641 shell switch and desktop-window minimum select the intended navigation profile', async ({
	page,
}) => {
	await markOnboarded(page);
	await page.setViewportSize({ width: 640, height: 700 });
	await gotoRoute(page, '/');
	await seedFresh(page);

	for (const expected of [
		{ width: 640, height: 700, profile: 'phone' as const },
		{ width: 641, height: 700, profile: 'rail' as const },
		{ width: 720, height: 520, profile: 'rail' as const },
		{ width: 1025, height: 600, profile: 'desktop' as const },
	]) {
		await page.setViewportSize({ width: expected.width, height: expected.height });
		const primary = page.getByRole('navigation', { name: 'Primary' });
		await expect(primary).toBeVisible();
		await expect
			.poll(async () => {
				const width = (await primary.boundingBox())?.width ?? 0;
				if (expected.profile === 'phone') return width >= expected.width - 1;
				if (expected.profile === 'rail') return width >= 63 && width <= 65;
				return width > 200 && width < 264;
			})
			.toBe(true);

		const box = await primary.boundingBox();
		expect(box).not.toBeNull();
		if (!box) continue;
		if (expected.profile === 'phone') {
			expect(box.width).toBeGreaterThanOrEqual(expected.width - 1);
			expect(box.y).toBeGreaterThan(expected.height / 2);
			await expect(primary.getByRole('button', { name: 'More' })).toBeVisible();
		} else if (expected.profile === 'rail') {
			expect(box.x).toBeLessThanOrEqual(1);
			expect(box.width).toBeGreaterThanOrEqual(63);
			expect(box.width).toBeLessThanOrEqual(65);
			expect(box.height).toBeGreaterThanOrEqual(expected.height - 1);
		} else {
			expect(box.width).toBeGreaterThan(200);
			expect(box.width).toBeLessThan(264);
			await expect(primary.getByText('Run the table', { exact: true })).toBeVisible();
		}
		await expectNoHorizontalOverflow(page, `${expected.width}px ${expected.profile} shell`);
	}
});

test('first-run setup remains usable through every step at 375x520', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 520 });
	await openFirstRun(page);
	const dialog = page.getByRole('dialog', { name: 'First-run setup' });

	await expect(dialog.getByRole('heading', { name: 'Run a better table.' })).toBeVisible();
	await expect(dialog.locator('[data-onboarding-content]')).toBeFocused();
	await expectOnboardingStep(page, 1, 'Get started');
	await dialog.getByRole('button', { name: 'Get started' }).click();

	await expect(
		dialog.getByRole('heading', { name: 'Where should your world live?' }),
	).toBeVisible();
	await expectOnboardingStep(page, 2, 'Continue');
	await dialog.getByRole('button', { name: 'Continue' }).click();

	await expect(
		dialog.getByRole('heading', { name: 'How much do you want on screen?' }),
	).toBeVisible();
	await dialog.getByRole('radio', { name: /Expert/ }).click();
	await expectOnboardingStep(page, 3, 'Continue');
	await dialog.getByRole('button', { name: 'Continue' }).click();

	await expect(dialog.getByRole('heading', { name: 'Bring your party.' })).toBeVisible();
	const longPartyName = `Sir ${'Extremely-Long-Party-Name-'.repeat(5)}`.slice(0, 120);
	const partyInput = dialog.getByRole('textbox', { name: 'Player name or email' });
	await partyInput.scrollIntoViewIfNeeded();
	await partyInput.fill(longPartyName);
	await dialog.getByRole('button', { name: 'Add', exact: true }).click();
	const savedName = dialog.getByText(longPartyName, { exact: true });
	await savedName.scrollIntoViewIfNeeded();
	await expect(savedName).toBeVisible();
	await expect(dialog.getByRole('button', { name: `Remove ${longPartyName}` })).toBeInViewport();
	await expectOnboardingStep(page, 4, 'Continue');
	await dialog.getByRole('button', { name: 'Continue' }).click();

	await expect(dialog.getByRole('heading', { name: "You're ready to run." })).toBeVisible();
	await expectOnboardingStep(page, 5, 'Enter Command Center');
	await dialog.getByRole('button', { name: 'Enter Command Center' }).click();

	await expect(dialog).toHaveCount(0);
	await expect(page.locator('#main-content')).toBeVisible();
	await expectNoHorizontalOverflow(page, 'completed compact onboarding');
	const persisted = await page.evaluate(() => ({
		party: JSON.parse(localStorage.getItem('dndtools:react:invites') ?? '[]'),
		tier: localStorage.getItem('dndtools:react:tier'),
	}));
	expect(persisted.party).toEqual([longPartyName]);
	expect(persisted.tier).toBe('advanced');
});

test('starting fresh can reload directly into a HashRouter destination', async ({ page }) => {
	await openFirstRun(page);
	const dialog = page.getByRole('dialog', { name: 'First-run setup' });

	await dialog.getByRole('button', { name: 'Get started' }).click();
	await dialog.getByRole('radio', { name: /Start fresh/ }).click();
	await dialog.getByRole('button', { name: 'Continue' }).click();
	await dialog.getByRole('button', { name: 'Continue' }).click();
	await dialog.getByRole('button', { name: 'Continue' }).click();

	await Promise.all([
		page.waitForURL(/#\/scenes$/, { timeout: 20_000 }),
		dialog.getByRole('button', { name: 'A scene is staged' }).click(),
	]);
	await page.waitForFunction(() => window.__rt?.loaded === true, null, { timeout: 20_000 });

	await expect(dialog).toHaveCount(0);
	await expect(page.getByText('Scenes · 0', { exact: true })).toBeVisible();
	await expect(
		page.locator('#main-content').getByText('Command Center', { exact: true }),
	).toHaveCount(0);
});

test('first-run setup changes layout cleanly at 640/641 and fits the 720x520 window minimum', async ({
	page,
}) => {
	await page.setViewportSize({ width: 640, height: 700 });
	await openFirstRun(page);
	const dialog = page.getByRole('dialog', { name: 'First-run setup' });

	for (const expected of [
		{ width: 640, height: 700, phone: true },
		{ width: 641, height: 700, phone: false },
		{ width: 720, height: 520, phone: false },
	]) {
		await page.setViewportSize({ width: expected.width, height: expected.height });
		await expect(dialog).toBeVisible();
		await expect(dialog.getByRole('button', { name: 'Get started' })).toBeInViewport();
		await expect(dialog.getByRole('button', { name: 'Skip setup' })).toBeInViewport();
		if (expected.phone) {
			await expect(dialog.getByText('Welcome · 1/5', { exact: true })).toBeVisible();
			await expect(dialog.getByText('About 2 minutes to your first scene')).toHaveCount(0);
		} else {
			await expect(dialog.getByText('About 2 minutes to your first scene')).toBeVisible();
			await expect(dialog.getByText('Welcome · 1/5', { exact: true })).toHaveCount(0);
		}
		const box = await dialog.boundingBox();
		expect(box).not.toBeNull();
		if (box) {
			expect(box.x).toBeGreaterThanOrEqual(0);
			expect(box.y).toBeGreaterThanOrEqual(0);
			expect(box.x + box.width).toBeLessThanOrEqual(expected.width + 1);
			expect(box.y + box.height).toBeLessThanOrEqual(expected.height + 1);
		}
		await expectNoHorizontalOverflow(page, `${expected.width}px onboarding`);
		expect(
			await clippedControls(page, '[role="dialog"][aria-label="First-run setup"]'),
			`${expected.width}px onboarding clipped a control`,
		).toEqual([]);
	}
});

test('a Co-DM can reach every elevated standalone player tool at compact phone size', async ({
	page,
}) => {
	await page.setViewportSize({ width: 375, height: 520 });
	await markOnboarded(page);
	await gotoRoute(page, '/');
	await seedFresh(page);

	const promoted = await page.evaluate(() =>
		window.__rt!.dispatch({
			type: 'permission.assign-role',
			actorId: window.__rt!.defaultActorId,
			payload: { targetActorId: 'actor-player', role: 'co-dm', coDmSeatLimit: 1 },
		}),
	);
	expect(promoted.status).toBe('accepted');
	await page.waitForFunction(
		() =>
			(window.__rt!.state.permissions as { actors: Record<string, { role?: string }> }).actors[
				'actor-player'
			]?.role === 'co-dm',
		null,
		{ timeout: 10_000 },
	);

	await page.goto('/#/play', { waitUntil: 'domcontentloaded' });
	await page.waitForFunction(() => !!window.__rt && window.__rt.loaded === true, null, {
		timeout: 20_000,
	});
	await page.getByText('Player view').first().waitFor({ state: 'attached', timeout: 20_000 });
	await expectNoHorizontalOverflow(page, 'compact Co-DM player view');

	const playerNav = page.getByRole('navigation', { name: 'Player sections' });
	const navBox = await playerNav.boundingBox();
	expect(navBox).not.toBeNull();
	if (navBox) {
		expect(navBox.width).toBeGreaterThanOrEqual(374);
		expect(navBox.y).toBeGreaterThan(390);
		expect(navBox.y + navBox.height).toBeGreaterThanOrEqual(519);
	}

	for (const tool of [
		{ button: 'Maps', heading: 'Maps & scenes' },
		{ button: 'Bestiary', heading: 'Bestiary' },
		{ button: 'Combat assist', heading: 'Combat assist' },
	]) {
		const button = playerNav.getByRole('button', { name: tool.button });
		await expect(button).toBeEnabled();
		await button.scrollIntoViewIfNeeded();
		await expect(button).toBeInViewport();
		await button.click();
		await expect(page.getByRole('heading', { name: tool.heading })).toBeVisible();
		await expectNoHorizontalOverflow(page, `${tool.button} compact Co-DM surface`);
	}
});

test('standalone player entry points fit a compact phone without clipped controls', async ({
	page,
}) => {
	await page.setViewportSize({ width: 375, height: 520 });
	await markOnboarded(page);
	await gotoRoute(page, '/');
	await seedFresh(page);

	for (const route of ['/play', '/join', '/wiki']) {
		await page.goto(`/#${route}`, { waitUntil: 'domcontentloaded' });
		await page.getByRole('main').first().waitFor({ state: 'visible', timeout: 20_000 });
		await expectNoHorizontalOverflow(page, `${route} compact standalone route`);
		expect(
			await clippedControls(page),
			`${route} clipped an interactive control at compact phone size`,
		).toEqual([]);
	}
});

test('every player tab uses a single bounded column on a compact phone', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 667 });
	await markOnboarded(page);
	await gotoRoute(page, '/player');
	await seedFresh(page);

	for (const tab of ['Sheet', 'Resources', 'Party', 'Level up', 'Journal']) {
		await page.getByRole('tab', { name: tab }).click();
		await expectNoHorizontalOverflow(page, `player ${tab} tab`, '#main-content');
		expect(
			await clippedControls(page, '#main-content'),
			`player ${tab} tab clipped an interactive control`,
		).toEqual([]);
	}
});

test('the compact map builder keeps the canvas and inspector reachable', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 667 });
	await markOnboarded(page);
	await gotoRoute(page, '/atlas');
	await seedFresh(page);

	await page.getByRole('button', { name: 'Open in builder' }).click();
	// MAP-021 rebuilt the overlay as the "Map editor" (Foundry-style tool rail + bottom-sheet dock).
	const builder = page.getByRole('dialog', { name: /Map editor/ });
	await expect(builder).toBeVisible();
	await expectNoHorizontalOverflow(page, 'compact map editor');
	await expectNoHorizontalOverflow(page, 'compact map editor', '[aria-label^="Map editor"]');
	// The header actions must stay within the viewport. The tool rail below is an intentionally
	// horizontally-scrollable toolbar (nine tool groups), so its off-screen groups are reachable by
	// scroll rather than clipped — hence scope the clipped-control check to the header.
	expect(await clippedControls(page, '[aria-label^="Map editor"] > header')).toEqual([]);

	const canvas = page.locator('[data-testid="map-canvas-well"]').last();
	const canvasBox = await canvas.boundingBox();
	expect(canvasBox).not.toBeNull();
	if (canvasBox) expect(canvasBox.width).toBeGreaterThanOrEqual(374);
	const rail = page.getByRole('toolbar', { name: 'Map tools' });
	await expect(rail).toHaveAttribute('aria-orientation', 'horizontal');

	await page.getByRole('button', { name: 'Panels' }).click();
	const panels = page.getByRole('dialog', { name: 'Map panels' });
	await expect(panels).toBeVisible();
	const panelBox = await panels.boundingBox();
	expect(panelBox).not.toBeNull();
	if (panelBox) {
		expect(panelBox.x).toBeGreaterThanOrEqual(0);
		expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(376);
	}
	// The dock sheet is labelled by its title (aria-labelledby), so scope by that shape.
	expect(await clippedControls(page, '[role="dialog"][aria-labelledby]')).toEqual([]);
	await panels.getByRole('button', { name: 'Close' }).click();
	await expect(panels).toBeHidden();

	// Import now lives in the header Export menu.
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	await page.getByRole('button', { name: /Import map/ }).click();
	const importDialog = page.getByRole('dialog', { name: 'Import map' });
	await expect(importDialog).toBeVisible();
	await expectNoHorizontalOverflow(
		page,
		'compact map import dialog',
		'[role="dialog"][aria-labelledby]',
	);
	expect(await clippedControls(page, '[role="dialog"][aria-labelledby]')).toEqual([]);
	await page.keyboard.press('Escape');
});

test('compact accessibility settings keep shortcut copy inside the page', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 667 });
	await markOnboarded(page);
	await gotoRoute(page, '/settings?tab=accessibility');
	await seedFresh(page);

	await expect(page.getByRole('heading', { name: 'Keyboard shortcuts' })).toBeVisible();
	await expectNoHorizontalOverflow(page, 'compact accessibility settings', '#main-content');
	expect(await clippedControls(page, '#main-content')).toEqual([]);
});

test('compact shell overlays keep their footer content inside the viewport', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 667 });
	await markOnboarded(page);
	await gotoRoute(page, '/');
	await seedFresh(page);

	await page.getByRole('button', { name: 'Search' }).click();
	const palette = page.getByRole('dialog', { name: 'Command palette' });
	await expect(palette).toBeVisible();
	await expectNoHorizontalOverflow(
		page,
		'compact command palette',
		'[aria-label="Command palette"]',
	);
	expect(await clippedControls(page, '[aria-label="Command palette"]')).toEqual([]);
	await page.keyboard.press('Escape');

	await page.getByRole('button', { name: 'Table controls' }).click();
	const controls = page.getByRole('dialog', { name: 'Table controls' });
	await expect(controls).toBeVisible();
	await expectNoHorizontalOverflow(page, 'compact table controls', '[role="dialog"]');
	expect(await clippedControls(page, '[role="dialog"]')).toEqual([]);
});
