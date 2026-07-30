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
		.locator(
			'button, a[href], input, select, textarea, [role="button"], [role="option"], [role="menuitem"], [role="radio"], [role="checkbox"], [role="tab"], [role="switch"]',
		)
		.evaluateAll((elements) => {
			const isClippedWithoutScrollPath = (element: Element, axis: 'x' | 'y') => {
				const rect = element.getBoundingClientRect();
				const viewportSize = axis === 'x' ? window.innerWidth : window.innerHeight;
				const start = axis === 'x' ? rect.left : rect.top;
				const end = axis === 'x' ? rect.right : rect.bottom;
				if (start >= -1 && end <= viewportSize + 1) return false;

				// A control may begin outside the viewport only when one of its ancestors owns a
				// real scroll range on that axis. This deliberately accepts discoverable content
				// below a page fold while rejecting content clipped by a non-scrolling flex pane.
				for (let parent = element.parentElement; parent; parent = parent.parentElement) {
					const style = getComputedStyle(parent);
					const overflow = axis === 'x' ? style.overflowX : style.overflowY;
					const parentRect = parent.getBoundingClientRect();
					const parentStart = axis === 'x' ? parentRect.left : parentRect.top;
					const parentEnd = axis === 'x' ? parentRect.right : parentRect.bottom;
					const clips = /auto|scroll|hidden|clip/.test(overflow);
					if (!clips || (start >= parentStart - 1 && end <= parentEnd + 1)) continue;
					const scrollSize = axis === 'x' ? parent.scrollWidth : parent.scrollHeight;
					const clientSize = axis === 'x' ? parent.clientWidth : parent.clientHeight;
					return scrollSize <= clientSize + 1;
				}
				return true;
			};

			return elements.flatMap((element) => {
				const rect = element.getBoundingClientRect();
				const style = getComputedStyle(element);
				// The skip link is intentionally parked above the viewport until keyboard focus
				// reveals it. Its focus behaviour is covered independently; treating its resting
				// position as clipping would turn this audit into a false positive on every route.
				if (element.matches('a[href="#main-content"]') && element !== document.activeElement) {
					return [];
				}
				if (
					rect.width === 0 ||
					rect.height === 0 ||
					style.display === 'none' ||
					style.visibility === 'hidden' ||
					(!isClippedWithoutScrollPath(element, 'x') && !isClippedWithoutScrollPath(element, 'y'))
				) {
					return [];
				}
				const name =
					element.getAttribute('aria-label') || element.textContent?.trim() || element.tagName;
				const axes = [
					isClippedWithoutScrollPath(element, 'x') ? 'horizontal' : '',
					isClippedWithoutScrollPath(element, 'y') ? 'vertical' : '',
				]
					.filter(Boolean)
					.join(' and ');
				return [
					`${name.replace(/\s+/g, ' ').slice(0, 60)} is ${axes}ly clipped (${Math.round(rect.left)},${Math.round(rect.top)}–${Math.round(rect.right)},${Math.round(rect.bottom)})`,
				];
			});
		});
}

/**
 * Exercises the shared bounded-overlay contract at a deliberately keyboard-like short height.
 * The test scopes to the dialog so controls below its visible body are accepted only when the
 * dialog body itself can scroll to them; a control simply painted below the screen is a failure.
 */
async function expectOverlayControlsReachable(page: Page, name: string): Promise<void> {
	// `toBeVisible()` succeeds while a sheet is entering. Audit after the short transform finishes;
	// otherwise every control is (correctly, but transiently) below the viewport during the slide-in.
	await page.waitForTimeout(250);
	expect(
		await clippedControls(page, '[role="dialog"]'),
		`${name} has an unreachable control`,
	).toEqual([]);
	const dimensions = await page.locator('[role="dialog"]').evaluate((dialog) => {
		const scrollRegion = Array.from(dialog.children).find((child) => {
			const style = getComputedStyle(child);
			return /(auto|scroll)/.test(style.overflowY);
		}) as HTMLElement | undefined;
		return scrollRegion
			? { clientHeight: scrollRegion.clientHeight, scrollHeight: scrollRegion.scrollHeight }
			: null;
	});
	if (dimensions) {
		expect(
			dimensions.scrollHeight,
			`${name} body must have a bounded scroll path when needed`,
		).toBeGreaterThanOrEqual(dimensions.clientHeight);
	}
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
	await expect(dialog.getByText(`Step ${step} of 7`, { exact: true })).toBeVisible();
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
	{ name: 'minimum-width phone', width: 360, height: 640 },
	{ name: 'compact phone', width: 375, height: 812 },
	{ name: 'tall phone', width: 412, height: 915 },
	{ name: 'short landscape phone', width: 640, height: 360 },
	{ name: 'virtual-keyboard phone', width: 360, height: 360 },
	{ name: 'phone breakpoint', width: 640, height: 700 },
	{ name: 'rail breakpoint', width: 641, height: 700 },
	{ name: 'foldable portrait', width: 768, height: 1024 },
	{ name: 'tablet portrait', width: 853, height: 1280 },
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

test('Settings category navigation stays touch-sized on the rail/tablet profile', async ({
	page,
}) => {
	await page.setViewportSize({ width: 641, height: 700 });
	await markOnboarded(page);
	await gotoRoute(page, '/settings');
	await seedFresh(page);

	const settingsNavigation = page.getByRole('navigation', { name: 'Settings navigation' });
	await expect(settingsNavigation).toBeVisible();
	const categories = settingsNavigation.locator('button');
	expect(await categories.count()).toBeGreaterThan(0);
	for (let index = 0; index < (await categories.count()); index += 1) {
		await expect(categories.nth(index)).toHaveCSS('min-height', '44px');
		const box = await categories.nth(index).boundingBox();
		expect(box, `Settings category ${index + 1} is not rendered`).not.toBeNull();
		expect(box?.height, `Settings category ${index + 1} is undersized`).toBeGreaterThanOrEqual(44);
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

	// ADR-026 — the forced, undefaulted privacy decision; Private also demands the typed ack.
	await expect(dialog.getByRole('heading', { name: 'Who can read your world?' })).toBeVisible();
	await expect(dialog.getByRole('button', { name: 'Choose an option to continue' })).toBeDisabled();
	await dialog.getByRole('radio', { name: /Private vault/ }).click();
	const ackInput = dialog.getByLabel('Type "i hold the keys" to confirm');
	await ackInput.scrollIntoViewIfNeeded();
	await ackInput.fill('i hold the keys');
	await expectOnboardingStep(page, 3, 'Continue');
	await dialog.getByRole('button', { name: 'Continue' }).click();

	await expect(
		dialog.getByRole('heading', { name: 'How much do you want on screen?' }),
	).toBeVisible();
	await dialog.getByRole('radio', { name: /Expert/ }).click();
	await expectOnboardingStep(page, 4, 'Continue');
	await dialog.getByRole('button', { name: 'Continue' }).click();

	await expect(
		dialog.getByRole('heading', { name: 'Which optional tools do you want?' }),
	).toBeVisible();
	await dialog.getByRole('radio', { name: /Generators only/ }).click();
	await expectOnboardingStep(page, 5, 'Continue');
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
	await expectOnboardingStep(page, 6, 'Continue');
	await dialog.getByRole('button', { name: 'Continue' }).click();

	await expect(dialog.getByRole('heading', { name: "You're ready to run." })).toBeVisible();
	await expectOnboardingStep(page, 7, 'Enter Command Center');
	await dialog.getByRole('button', { name: 'Enter Command Center' }).click();

	await expect(dialog).toHaveCount(0);
	await expect(page.locator('#main-content')).toBeVisible();
	await expectNoHorizontalOverflow(page, 'completed compact onboarding');
	const persisted = await page.evaluate(() => ({
		party: JSON.parse(localStorage.getItem('dndtools:react:invites') ?? '[]'),
		tier: localStorage.getItem('dndtools:react:tier'),
		mode: localStorage.getItem('dndtools:react:vault-privacy-mode'),
		tools: localStorage.getItem('dndtools.ai.usage-preference'),
	}));
	expect(persisted.party).toEqual([longPartyName]);
	expect(persisted.tier).toBe('advanced');
	expect(persisted.mode).toBe('private-e2ee');
	expect(persisted.tools).toBe('generation-only');
});

test('starting fresh can reload directly into a HashRouter destination', async ({ page }) => {
	await openFirstRun(page);
	const dialog = page.getByRole('dialog', { name: 'First-run setup' });

	await dialog.getByRole('button', { name: 'Get started' }).click();
	await dialog.getByRole('radio', { name: /Start fresh/ }).click();
	await dialog.getByRole('button', { name: 'Continue' }).click();
	// ADR-026 forced privacy step — Cloud-Enhanced needs no typed acknowledgment.
	await dialog.getByRole('radio', { name: /Cloud-Enhanced vault/ }).click();
	await dialog.getByRole('button', { name: 'Continue' }).click();
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
			await expect(dialog.getByText('Welcome · 1/7', { exact: true })).toBeVisible();
			await expect(dialog.getByText('About 2 minutes to your first scene')).toHaveCount(0);
		} else {
			await expect(dialog.getByText('About 2 minutes to your first scene')).toBeVisible();
			await expect(dialog.getByText('Welcome · 1/7', { exact: true })).toHaveCount(0);
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

for (const mode of ['200% text', 'reduced motion', 'forced colors'] as const) {
	test(`primary routes remain reachable with ${mode}`, async ({ page }) => {
		await page.setViewportSize({ width: 360, height: 640 });
		if (mode === 'reduced motion') await page.emulateMedia({ reducedMotion: 'reduce' });
		if (mode === 'forced colors') await page.emulateMedia({ forcedColors: 'active' });
		await markOnboarded(page);
		await gotoRoute(page, '/');
		await seedFresh(page);
		if (mode === '200% text') {
			await page.addStyleTag({
				content:
					'html { font-size: 200% !important; -webkit-text-size-adjust: 100% !important; text-size-adjust: 100% !important; }',
			});
		}

		for (const route of ROUTES) {
			await page.evaluate((next) => {
				window.location.hash = next;
			}, route);
			await page.waitForFunction((next) => window.location.hash === `#${next}`, route);
			await page.locator('h1').first().waitFor({ state: 'attached', timeout: 20_000 });
			await page.evaluate(
				() =>
					new Promise<void>((resolve) =>
						requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
					),
			);
			await expectNoHorizontalOverflow(page, `${route} with ${mode}`, '#main-content', true);
			expect
				.soft(await clippedControls(page), `${route} clipped a control with ${mode}`)
				.toEqual([]);
		}

		if (mode === 'reduced motion') {
			expect(
				await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
			).toBe(true);
		}
		if (mode === 'forced colors') {
			expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
		}
	});
}

test('Android routes consume native safe areas and keep 48dp controls keyboard-visible', async ({
	page,
}) => {
	await page.addInitScript(() => {
		(
			globalThis as typeof globalThis & {
				__DNDTOOLS_TEST_RUNTIME_KIND__?: 'android';
			}
		).__DNDTOOLS_TEST_RUNTIME_KIND__ = 'android';
	});
	await page.setViewportSize({ width: 360, height: 640 });
	await markOnboarded(page);
	await gotoRoute(page, '/');
	await seedFresh(page);
	await page.evaluate(() => {
		const root = document.documentElement.style;
		root.setProperty('--safe-area-inset-top', '24px');
		root.setProperty('--safe-area-inset-right', '18px');
		root.setProperty('--safe-area-inset-bottom', '30px');
		root.setProperty('--safe-area-inset-left', '16px');
	});
	await expect(page.locator('html')).toHaveAttribute('data-runtime', 'android');

	for (const route of ROUTES) {
		await page.evaluate((next) => {
			window.location.hash = next;
		}, route);
		await page.waitForFunction((next) => window.location.hash === `#${next}`, route);
		await page.locator('h1').first().waitFor({ state: 'attached', timeout: 20_000 });
		await page.evaluate(
			() =>
				new Promise<void>((resolve) =>
					requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
				),
		);
		await expectNoHorizontalOverflow(
			page,
			`${route} with Android safe areas`,
			'#main-content',
			true,
		);
		expect.soft(await clippedControls(page), `${route} clipped an Android control`).toEqual([]);

		const failures = await page
			.locator('#main-content, header, nav[aria-label="Primary"]')
			.locator(
				'button, a[href], [role="button"], [role="option"], [role="menuitem"], [role="radio"], [role="checkbox"], [role="tab"], [role="switch"], input, select, textarea',
			)
			.evaluateAll((controls) =>
				controls.flatMap((control) => {
					const rect = control.getBoundingClientRect();
					const style = getComputedStyle(control);
					if (
						rect.width === 0 ||
						rect.height === 0 ||
						style.display === 'none' ||
						style.visibility === 'hidden' ||
						rect.bottom <= 0 ||
						rect.top >= innerHeight
					) {
						return [];
					}
					const name =
						control.getAttribute('aria-label') || control.textContent?.trim() || control.tagName;
					const reasons: string[] = [];
					if (rect.width < 47.5 || rect.height < 47.5) reasons.push('under 48dp');
					if (rect.left < 15.5 || rect.right > innerWidth - 17.5) reasons.push('inside cutout');
					const systemChrome = control.closest('header, nav[aria-label="Primary"]');
					if (systemChrome && (rect.top < 23.5 || rect.bottom > innerHeight - 29.5)) {
						reasons.push('inside system bar');
					}
					return reasons.length === 0
						? []
						: [`${name.replace(/\s+/g, ' ').slice(0, 50)}: ${reasons.join(', ')}`];
				}),
			);
		expect.soft(failures, `${route} violated Android touch/safe-area bounds`).toEqual([]);
	}

	await page.locator('body').press('Tab');
	expect(
		await page.evaluate(() => {
			const active = document.activeElement;
			return active instanceof HTMLElement && getComputedStyle(active).outlineStyle !== 'none';
		}),
		'keyboard focus must have a visible ring',
	).toBe(true);
});

test('the compact map builder keeps the canvas and inspector reachable', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 667 });
	await markOnboarded(page);
	await gotoRoute(page, '/atlas');
	await seedFresh(page);

	await page.getByRole('button', { name: 'Open in map editor' }).click();
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
	await expectOverlayControlsReachable(page, 'compact command palette');
	await page.keyboard.press('Escape');

	await page.getByRole('button', { name: 'Table controls' }).click();
	const controls = page.getByRole('dialog', { name: 'Table controls' });
	await expect(controls).toBeVisible();
	await expectNoHorizontalOverflow(page, 'compact table controls', '[role="dialog"]');
	await expectOverlayControlsReachable(page, 'compact table controls');
});

test('community tabs collapse their two-column layouts on a phone', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 812 });
	await markOnboarded(page);
	await gotoRoute(page, '/');
	await seedFresh(page);
	await page.evaluate(() => {
		window.location.hash = '/community';
	});
	await page.locator('h1').first().waitFor({ state: 'attached', timeout: 20_000 });

	const trackCount = async (headingText: string) => {
		const grid = page
			.getByText(headingText, { exact: true })
			.locator('xpath=ancestor::section[1]/..');
		return grid.evaluate(
			(el) => getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length,
		);
	};

	// Export: "What to export" + the download column must stack, not fight over ~170px halves.
	await page.getByRole('tab', { name: 'Export' }).click();
	await page.getByText('What to export', { exact: true }).waitFor({ state: 'visible' });
	expect(await trackCount('What to export')).toBe(1);
	await expectNoHorizontalOverflow(page, '/community export tab', '#main-content');

	// Campaign wiki: settings + reading preview stack the same way.
	await page.getByRole('tab', { name: 'Campaign wiki' }).click();
	await page.getByText('Reading preview', { exact: true }).waitFor({ state: 'visible' });
	expect(await trackCount('Reading preview')).toBe(1);
	await expectNoHorizontalOverflow(page, '/community wiki tab', '#main-content');

	// The same layouts keep their side-by-side split once the viewport leaves the phone profile.
	await page.setViewportSize({ width: 1280, height: 800 });
	expect(await trackCount('Reading preview')).toBe(2);
});

test('toasts stack above the phone bottom tab bar, never over it', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 667 });
	await markOnboarded(page);
	await gotoRoute(page, '/');

	const nav = page.locator('nav[aria-label="Primary"]');
	await expect(nav).toBeVisible();
	const toast = page.getByTestId('app-toast-viewport');
	const toastBox = await toast.boundingBox();
	const navBox = await nav.boundingBox();
	expect(toastBox).not.toBeNull();
	expect(navBox).not.toBeNull();
	// The toast viewport's bottom edge must clear the tab bar so a toast can never cover the
	// primary navigation's tap targets.
	expect(toastBox!.y + toastBox!.height).toBeLessThanOrEqual(navBox!.y + 1);
});

// The shell's skip link is the very first tab stop on every route. The app is a HashRouter, so the
// hash IS the route: letting the browser follow `href="#main-content"` rewrote `#/scenes` to
// `#main-content`, desynced the URL from the rendered screen, and sent a reload to the catch-all
// route (dumping the user on Command Center).
test('the skip link moves focus to main without clobbering the hash route', async ({ page }) => {
	await markOnboarded(page);
	await gotoRoute(page, '/scenes');
	expect(new URL(page.url()).hash).toBe('#/scenes');

	const skip = page.getByRole('link', { name: 'Skip to content' });
	await skip.focus();
	await expect(skip).toBeFocused();
	await skip.press('Enter');

	// Focus lands on the main landmark …
	await expect(page.locator('#main-content')).toBeFocused();
	// … and the route is untouched, so Back and reload still work.
	expect(new URL(page.url()).hash).toBe('#/scenes');
	await expect(page.locator('#main-content')).toBeVisible();
});
