import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh } from './_helpers';

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

const CONTROL_SELECTOR =
	'button, a[href], input, select, textarea, [role="button"], [role="option"], [role="menuitem"], [role="radio"], [role="checkbox"], [role="tab"], [role="switch"]';

async function clippedControls(page: Page, rootSelector = 'body'): Promise<string[]> {
	return page
		.locator(rootSelector)
		.locator(CONTROL_SELECTOR)
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
				// No ancestor clips it, so the one scroll path left is the document. The standalone
				// routes (`/play`, `/join`, `/wiki`) scroll the page rather than a pane. Sideways that is
				// never a path: a page that scrolls horizontally is the failure
				// `expectNoHorizontalOverflow` exists for.
				if (axis === 'x') return true;
				const root = document.scrollingElement ?? document.documentElement;
				const scrolls = root.scrollHeight > root.clientHeight + 1;
				return (
					!scrolls || start + window.scrollY < -1 || end + window.scrollY > root.scrollHeight + 1
				);
			};

			return elements.flatMap((element) => {
				const rect = element.getBoundingClientRect();
				const style = getComputedStyle(element);
				// A skip link is intentionally parked above the viewport until keyboard focus reveals
				// it. Its focus behaviour is covered independently; treating its resting position as
				// clipping would turn this audit into a false positive on every route. Keyed off the
				// `data-skip-link` marker so it covers /play's own link as well as the shell's.
				if (element.matches('[data-skip-link]') && element !== document.activeElement) {
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
	// RC-UX-4.3 — the two tablet sizes the rail tier's list/detail split is accepted at.
	{ name: '820 portrait tablet', width: 820, height: 1180 },
	{ name: '1024 landscape tablet', width: 1024, height: 768 },
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

// `/board` and `/scene/:id` are self-contained bounded canvases: they own an internal scroll
// region and must fit the shell's `<main>` pane exactly, never make it scroll. They used to size
// themselves off `--app-viewport-height` (the WHOLE window) minus a magic number, but `<main>` is
// already `flex:1; min-height:0; overflow-y:auto` (AppShell.tsx) — i.e. the window minus the top
// bar and, on a phone, minus the tab bar. Subtracting a constant from the wrong base overflowed
// `<main>` on desktop (a second, nested scrollbar, and `/scene`'s zoom cluster — a required
// UX-CANVAS affordance — pushed below the fold) while wasting vertical space on a phone.
for (const viewport of [
	{ name: 'a compact phone', width: 393, height: 720 },
	{ name: 'a desktop window', width: 1280, height: 800 },
]) {
	test(`the bounded canvas routes fit the shell's main pane on ${viewport.name}`, async ({
		page,
	}) => {
		await page.setViewportSize({ width: viewport.width, height: viewport.height });
		await markOnboarded(page);
		await gotoRoute(page, '/scenes');
		await seedFresh(page);

		const sceneName = `Fit Scene ${Date.now()}`;
		const created = await dispatch(page, {
			type: 'scene.create',
			actorId: await page.evaluate(() => window.__rt!.defaultActorId),
			payload: { name: sceneName, description: '', visibility: 'dm-only', tags: [] },
		});
		expect(created.status).toBe('accepted');
		const sceneId = await page.evaluate(
			(name) =>
				Object.values(window.__rt!.state.scenes.scenes).find((s) => s.name === name)?.id ?? null,
			sceneName,
		);
		expect(sceneId).toBeTruthy();

		for (const route of ['/board', `/scene/${sceneId}`]) {
			await gotoRoute(page, route);
			// These routes are lazily loaded and `gotoRoute` only changes the hash, so its `h1` wait can
			// resolve against the PREVIOUS route's heading. A fixed sleep here then raced the chunk load
			// under parallel workers and measured a half-laid-out pane. Poll the measurement instead: a
			// real overflow still fails, it just takes the retry budget to do it.
			// A 2px tolerance absorbs sub-pixel rounding of the flex track, nothing more.
			const measure = async () =>
				page.locator('#main-content').evaluate((element) => ({
					clientHeight: element.clientHeight,
					scrollHeight: element.scrollHeight,
				}));
			await expect
				.poll(
					async () => {
						const m = await measure();
						return m.scrollHeight - m.clientHeight;
					},
					{ message: `${route} overflowed the shell's main pane`, timeout: 10_000 },
				)
				.toBeLessThanOrEqual(2);
			const main = await measure();
			// …and it must not shrink away from the pane either: a bounded canvas that only fills
			// half of main is the same magic-number bug with the sign flipped.
			const canvasHeight = await page
				.locator('#main-content > div')
				.first()
				.evaluate((element) => element.getBoundingClientRect().height);
			expect(
				canvasHeight,
				`${route} left ${main.clientHeight - canvasHeight}px of the main pane unused`,
			).toBeGreaterThanOrEqual(main.clientHeight - 2);
		}
	});
}

// RC-CAN-3.2 — the "scroll-natural" pan model (wheel/Shift+wheel/trackpad/touch scroll it, a
// middle-mouse drag pans it) still has to leave every control reachable at the narrowest phone width
// the app supports. 320px is narrower than the `minimum-width phone` fixture the general sweep above
// uses, and is scoped to `/board` alone rather than folded into that sweep: it is the one route whose
// reachability now depends on a real internal scroll region rather than layout reflow.
test('the board keeps every control reachable at 320x640', async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 640 });
	await markOnboarded(page);
	await gotoRoute(page, '/board');
	await seedFresh(page);
	await page.goto('/#/board', { waitUntil: 'domcontentloaded' });
	await page.locator('h1').first().waitFor({ state: 'attached', timeout: 20_000 });
	await page.waitForFunction(
		() => {
			const rt = window.__rt!;
			const id = rt.state.commandCenter.homeSceneId;
			return !!id && rt.state.scenes.scenes[id]?.widgets.length > 0;
		},
		null,
		{ timeout: 10_000 },
	);
	await page.waitForTimeout(100);

	// The pane itself must never widen — the board reaches its own content through its internal
	// scroll region, never by pushing the shell wider than the viewport.
	await expectNoHorizontalOverflow(page, '320px board', '#main-content', true);
	expect(await clippedControls(page), '320px board has an unreachable control').toEqual([]);
});

// The character SHEET (/characters/:id) needs a seeded id, so the static ROUTES sweep above could
// never reach it — and it shipped with no phone branch at all: a hard two-column sheet whose
// ability (6-track) and skills (2-track) grids then overflowed their ~180px columns.
test('the character sheet fits a compact phone without clipped controls', async ({ page }) => {
	await page.setViewportSize({ width: 393, height: 830 });
	await markOnboarded(page);
	await gotoRoute(page, '/characters');
	await seedFresh(page);

	const characterId = await page.evaluate(() => {
		const chars = (
			window.__rt as unknown as {
				state: { characters?: { characters?: Record<string, { id: string }> } };
			}
		).state.characters?.characters;
		const first = Object.values(chars ?? {})[0];
		return first?.id ?? null;
	});
	expect(characterId, 'the seeded vault should contain a character').not.toBeNull();

	await page.evaluate((id) => {
		window.location.hash = `/characters/${id}`;
	}, characterId);
	await page.waitForFunction((id) => window.location.hash === `#/characters/${id}`, characterId);
	await page.locator('h1').first().waitFor({ state: 'attached', timeout: 20_000 });
	await page.waitForTimeout(150);

	await expectNoHorizontalOverflow(page, '/characters/:id', '#main-content');
	expect(await clippedControls(page), 'the character sheet clipped a control').toEqual([]);
});

// `character.set-class-resource` puts no upper bound on `max`, and the Resources tab drew one pip
// per use at 13px — under WCAG 2.5.8's 24px floor. The pips are CONTENTLESS <button>s, so their
// min-content width is ~3px: on a phone they silently shrank into unhittable slivers rather than
// overflowing, which is exactly why `clippedControls` above never caught them.
test('class-resource pips stay hittable at a high resource maximum on a phone', async ({
	page,
}) => {
	await page.setViewportSize({ width: 393, height: 830 });
	await markOnboarded(page);
	await gotoRoute(page, '/player');
	await seedFresh(page);

	// Seed 9 uses — a real ceiling (a high-level monk's ki) and well past the ~253px the phone row
	// can spare for name + pips. Applied to EVERY seeded PC so this does not depend on which one
	// /player happens to select, and stamped with the DM actor: an omitted `actorId` is treated as
	// an unknown actor and denied at the observer ceiling (collab/observer-access.ts).
	const rejections = await page.evaluate(async () => {
		const rt = window.__rt!;
		const chars = (
			rt as unknown as {
				state: { characters?: { characters?: Record<string, { id: string; kind: string }> } };
			}
		).state.characters?.characters;
		const pcs = Object.values(chars ?? {}).filter((c) => c.kind === 'pc');
		const failed: string[] = [];
		for (const pc of pcs) {
			const result = await rt.dispatch({
				type: 'character.set-class-resource',
				actorId: rt.defaultActorId,
				payload: {
					characterId: pc.id,
					id: rt.newId(),
					name: 'Ki points',
					max: 9,
					recharge: 'short',
				},
			});
			if (result.status !== 'accepted') failed.push(JSON.stringify(result.rejection ?? {}));
		}
		return { count: pcs.length, failed };
	});
	expect(rejections.count, 'the seeded vault should contain at least one PC').toBeGreaterThan(0);
	expect(rejections.failed).toEqual([]);

	await page.getByRole('tab', { name: 'Resources' }).click();
	const pips = page.getByRole('button', { name: /^Ki points use \d+ / });
	await expect(pips).toHaveCount(9);

	const boxes = await pips.evaluateAll((els) =>
		els.map((el) => {
			const r = el.getBoundingClientRect();
			return { w: r.width, h: r.height, right: r.right };
		}),
	);
	// Every pip clears the 24x24 minimum…
	for (const [i, box] of boxes.entries()) {
		expect(box.w, `pip ${i + 1} width`).toBeGreaterThanOrEqual(24);
		expect(box.h, `pip ${i + 1} height`).toBeGreaterThanOrEqual(24);
	}
	// …they are uniform (a shrunk pip is the exact failure mode this replaces)…
	expect(new Set(boxes.map((b) => Math.round(b.w))).size, 'pips must all be the same size').toBe(1);
	// …and they wrap onto a second row rather than pushing past the viewport.
	for (const [i, box] of boxes.entries()) {
		expect(box.right, `pip ${i + 1} right edge`).toBeLessThanOrEqual(394);
	}

	await expectNoHorizontalOverflow(page, 'player Resources tab with 9 pips', '#main-content');
	expect(
		await clippedControls(page, '#main-content'),
		'the Resources tab clipped a control',
	).toEqual([]);
});

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

// RC-UX-2.4 — text scaling and zoom (WCAG 1.4.4 Resize Text, 1.4.10 Reflow). The two settings reach
// layout differently, so each gets its own sweep across all three navigation tiers:
//  • Browser zoom scales CSS px along with everything else. To layout, 200% of a window IS a
//    viewport half its width and height at twice the device pixels, so 200% of 1280×800 is 640×400
//    at devicePixelRatio 2. The windows below are picked so the zoomed viewport lands on each tier
//    of useViewport (≤640 phone, ≤1024 rail, desktop above): zooming is how a desktop user ends up
//    on the phone layout, and the shell has to hold up when that happens.
//  • A large-text preference raises the default font size and leaves the viewport alone. Only
//    rem/em text follows it (hence every type token is rem), so that sweep also proves text grew.
const STANDALONE_ROUTES = ['/play', '/join', '/wiki'];

type NavigationTier = 'phone' | 'rail' | 'desktop';

async function nextFrames(page: Page): Promise<void> {
	// Settle from a fresh task, as `dispatch` does (RC-ENG-2.6).
	await page.evaluate(
		() =>
			new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 0))),
			),
	);
}

/**
 * Moves to a hash route and waits until its screen, not a placeholder, is what gets measured. The
 * `h1` the other sweeps wait on is no signal: the shell's TopBar owns it, so it is attached before a
 * lazily loaded screen has arrived. react-router 6's HashRouter does not navigate inside a
 * transition, so a screen whose chunk is still loading shows the route `<Suspense>` Boot fallback
 * in its place, and that fallback is what to wait out.
 */
async function settleRoute(page: Page, route: string): Promise<void> {
	await page.evaluate((next) => {
		window.location.hash = next;
	}, route);
	await page.waitForFunction((next) => window.location.hash === `#${next}`, route);
	await nextFrames(page);
	await expect(page.getByText('Loading your vault…', { exact: true })).toHaveCount(0, {
		timeout: 20_000,
	});
	await nextFrames(page);
}

/** Which navigation profile the shell rendered, read from the Primary navigation's geometry. */
async function navigationTier(page: Page): Promise<NavigationTier | null> {
	const box = await page.getByRole('navigation', { name: 'Primary' }).boundingBox();
	if (!box) return null;
	const viewport = page.viewportSize();
	if (viewport && box.y > viewport.height / 2) return 'phone';
	return box.width < 100 ? 'rail' : 'desktop';
}

/**
 * Raises the browser's default font size, which is what a large-text preference changes, instead of
 * injecting an author `html { font-size }` rule. An injected `!important` rule overrides whatever
 * the app declares on `html`, so it would pass even if the app pinned its root size in px and
 * ignored the user's preference altogether.
 */
async function setDefaultFontSize(page: Page, standardPx: number): Promise<void> {
	const session = await page.context().newCDPSession(page);
	await session.send('Page.setFontSizes', {
		fontSizes: { standard: standardPx, fixed: Math.round(standardPx * 0.8125) },
	});
}

/**
 * A control you scroll to is only reached if nothing sits on top of it once you get there: a fixed
 * bar covers exactly the edge that scrolling brings a control to. Scrolls each control that starts
 * off-screen into view, hit-tests its centre, then restores every scroll offset it moved. A control
 * still off-screen afterwards is `clippedControls`'s to report, and a box under 3px is a visually
 * hidden control rather than a target.
 */
async function controlsCoveredWhenReached(page: Page): Promise<string[]> {
	return page.locator(CONTROL_SELECTOR).evaluateAll((elements) => {
		const offsets = new Map<Element, [number, number]>();
		const covered: string[] = [];
		for (const element of elements) {
			const resting = element.getBoundingClientRect();
			if (resting.width < 3 || resting.height < 3) continue;
			if (getComputedStyle(element).visibility === 'hidden') continue;
			if (
				resting.top >= 0 &&
				resting.left >= 0 &&
				resting.bottom <= window.innerHeight &&
				resting.right <= window.innerWidth
			) {
				continue;
			}
			for (let node = element.parentElement; node; node = node.parentElement) {
				if (!offsets.has(node)) offsets.set(node, [node.scrollLeft, node.scrollTop]);
			}
			element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
			const rect = element.getBoundingClientRect();
			const x = rect.left + rect.width / 2;
			const y = rect.top + rect.height / 2;
			if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue;
			const hit = document.elementFromPoint(x, y);
			if (!hit || element.contains(hit) || hit.closest('label')?.control === element) continue;
			const name =
				element.getAttribute('aria-label') || element.textContent?.trim() || element.tagName;
			const cover = hit.getAttribute('aria-label') || hit.getAttribute('class') || hit.tagName;
			covered.push(
				`${name.replace(/\s+/g, ' ').slice(0, 60)} is under ${cover.slice(0, 60)} once scrolled into view`,
			);
		}
		for (const [node, [left, top]] of offsets) {
			node.scrollLeft = left;
			node.scrollTop = top;
		}
		return covered;
	});
}

async function expectScaledRoutesWhole(page: Page, setting: string): Promise<void> {
	for (const route of [...ROUTES, ...STANDALONE_ROUTES]) {
		await settleRoute(page, route);
		// `/play`, `/join` and `/wiki` render outside AppShell, so they have no `#main-content`.
		const pane = STANDALONE_ROUTES.includes(route) ? 'html' : '#main-content';
		await expectNoHorizontalOverflow(page, `${route} ${setting}`, pane, true);
		expect.soft(await clippedControls(page), `${route} clipped a control ${setting}`).toEqual([]);
		expect
			.soft(await controlsCoveredWhenReached(page), `${route} hid a control ${setting}`)
			.toEqual([]);
	}
}

test.describe('200% browser zoom', () => {
	test.use({ deviceScaleFactor: 2 });

	for (const zoom of [
		{ tier: 'phone', window: '1280×800', width: 640, height: 400 },
		{ tier: 'rail', window: '1920×1080', width: 960, height: 540 },
		{ tier: 'desktop', window: '2560×1440', width: 1280, height: 720 },
	] as const) {
		test(`a ${zoom.window} window at 200% keeps every route whole on the ${zoom.tier} tier`, async ({
			page,
		}) => {
			await page.setViewportSize({ width: zoom.width, height: zoom.height });
			await markOnboarded(page);
			await gotoRoute(page, '/');
			await seedFresh(page);

			expect(
				await page.evaluate(() => ({ ratio: window.devicePixelRatio, width: window.innerWidth })),
			).toEqual({ ratio: 2, width: zoom.width });
			await expect.poll(() => navigationTier(page)).toBe(zoom.tier);
			await expectScaledRoutesWhole(page, `at 200% zoom of a ${zoom.window} window`);
		});
	}
});

for (const large of [
	{ tier: 'phone', width: 360, height: 640 },
	{ tier: 'rail', width: 768, height: 1024 },
	{ tier: 'desktop', width: 1280, height: 800 },
] as const) {
	test(`200% large text keeps every route whole on the ${large.tier} tier`, async ({ page }) => {
		await page.setViewportSize({ width: large.width, height: large.height });
		await markOnboarded(page);
		await gotoRoute(page, '/');
		await seedFresh(page);
		await setDefaultFontSize(page, 32);

		// The preference only helps if the app's text follows it: the root takes the doubled default,
		// and body text (`--text-base`, 0.9375rem) doubles from 15px with it.
		await expect
			.poll(() =>
				page.evaluate(() =>
					[document.documentElement, document.body].map((el) => getComputedStyle(el).fontSize),
				),
			)
			.toEqual(['32px', '30px']);
		await expect.poll(() => navigationTier(page)).toBe(large.tier);
		await expectScaledRoutesWhole(page, 'with 200% large text');
	});
}

/**
 * The sweep hit-tests each control's centre, which is the point a click resolves to — this case
 * spends the click. Both surfaces are the ones large text used to take away on a phone: /player's
 * tab bar sat under a sticky vitals bar that had wrapped into a block taller than the pane, and
 * /board's map tile clipped its own operate row inside an extent the text had outgrown. A real
 * press carries Playwright's actionability checks (visible, stable, receives pointer events), so it
 * fails on a covered control the way a user's finger does rather than on geometry.
 */
test('200% large text leaves phone controls pressable, not just present', async ({ page }) => {
	await page.setViewportSize({ width: 360, height: 640 });
	await markOnboarded(page);
	await gotoRoute(page, '/');
	await seedFresh(page);
	await setDefaultFontSize(page, 32);

	await settleRoute(page, '/player');
	await page.locator('#player-tab-resources').click({ timeout: 10_000 });
	await expect(page.locator('#player-panel-resources')).toBeVisible();

	await settleRoute(page, '/board');
	const changeMap = page.getByLabel('Change map').first();
	await changeMap.scrollIntoViewIfNeeded();
	await expect(changeMap).toBeEnabled();
	await changeMap.click({ timeout: 10_000 });
});

for (const mode of ['reduced motion', 'forced colors'] as const) {
	test(`primary routes remain reachable with ${mode}`, async ({ page }) => {
		await page.setViewportSize({ width: 360, height: 640 });
		if (mode === 'reduced motion') await page.emulateMedia({ reducedMotion: 'reduce' });
		if (mode === 'forced colors') await page.emulateMedia({ forcedColors: 'active' });
		await markOnboarded(page);
		await gotoRoute(page, '/');
		await seedFresh(page);

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
					// RC-CAN-3.1: a control inside a surface that scrolls SIDEWAYS (the GM Screen at the
					// Fit floor, or at Comfortable/Detail) can sit under the cutout at scroll 0 and be
					// brought into safe space by the same scroll that reaches it at all — the same
					// reason this check already ignores controls below the fold. The 48dp and
					// system-bar rules still apply to them.
					let scroller: HTMLElement | null = control.parentElement;
					let scrollsSideways = false;
					while (scroller && !scrollsSideways) {
						if (scroller.scrollWidth > scroller.clientWidth + 1) {
							const overflowX = getComputedStyle(scroller).overflowX;
							scrollsSideways = overflowX === 'auto' || overflowX === 'scroll';
						}
						scroller = scroller.parentElement;
					}
					const reasons: string[] = [];
					if (rect.width < 47.5 || rect.height < 47.5) reasons.push('under 48dp');
					if (!scrollsSideways && (rect.left < 15.5 || rect.right > innerWidth - 17.5))
						reasons.push('inside cutout');
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
	// `expect.poll`, not a bare `expect(await …)`: the layout is driven by `useViewport`, which reacts
	// to a matchMedia `change` event, so the re-render lands a tick AFTER setViewportSize resolves.
	// A one-shot read raced that tick and made this test the suite's long-standing intermittent
	// failure — it reproduced on a clean tree at roughly 1 run in 4.
	await page.setViewportSize({ width: 1280, height: 800 });
	await expect.poll(() => trackCount('Reading preview')).toBe(2);
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

	// … and the skip actually SHOWS. `<main>` carried an inline `outline: 'none'`, which beats the
	// stylesheet, so base.css's global `:focus-visible` ring never painted on the one element the
	// app's only bypass mechanism targets: pressing "Skip to content" confirmed nothing at all.
	// The offset must be negative too — a positive one lands outside a viewport-filling box.
	const ring = await page.locator('#main-content').evaluate((el) => {
		const cs = getComputedStyle(el);
		return {
			style: cs.outlineStyle,
			width: parseFloat(cs.outlineWidth) || 0,
			offset: parseFloat(cs.outlineOffset) || 0,
		};
	});
	expect(ring.style).not.toBe('none');
	expect(ring.width).toBeGreaterThan(0);
	expect(ring.offset).toBeLessThan(0);
});

// RC-UX-1.3 — RTL readiness smoke test. No locale ships `dir="rtl"` yet (RC-UX-1.1 owns that
// wiring), so this forces the attribute directly, on the live document, to exercise the CSS
// logical properties in styles/index.css independently of the locale system. A layout still built
// on physical left/right would clip or overflow the instant the browser mirrors it; this pins that
// it doesn't, on the eight busiest routes.
test('primary routes stay reachable and unclipped with the document mirrored rtl', async ({
	page,
}) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await markOnboarded(page);
	await gotoRoute(page, '/');
	await seedFresh(page);
	await page.evaluate(() => {
		document.documentElement.dir = 'rtl';
	});
	await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

	for (const route of ROUTES.slice(0, 8)) {
		await page.evaluate((next) => {
			window.location.hash = next;
		}, route);
		await page.waitForFunction((next) => window.location.hash === `#${next}`, route);
		await page.locator('h1').first().waitFor({ state: 'attached', timeout: 20_000 });
		await page.waitForTimeout(100);

		await expectNoHorizontalOverflow(page, `${route} mirrored rtl`, '#main-content');
		expect(
			await clippedControls(page),
			`${route} clipped an interactive control mirrored rtl`,
		).toEqual([]);
	}
});

// `/play` is rendered OUTSIDE AppShell, so it never inherited the shell's skip link — and
// styles/index.css pins the player nav to the bottom of a phone while the `<aside>` stays the FIRST
// child in the DOM. A plain player therefore tabbed through nine nav buttons (six primary + three
// aria-disabled elevated) before reaching any content (WCAG 2.4.1 / 2.4.3).
test('the standalone player view has its own skip link into main', async ({ page }) => {
	await page.setViewportSize({ width: 393, height: 720 });
	await markOnboarded(page);
	await gotoRoute(page, '/');
	await seedFresh(page);
	await page.goto('/#/play', { waitUntil: 'domcontentloaded' });
	// NOT `waitReady`: it waits for `#main-content`, which is AppShell's landmark, and /play renders
	// outside the shell. Wait for /play's own main instead.
	await page.getByRole('main').first().waitFor({ state: 'visible', timeout: 20_000 });
	expect(new URL(page.url()).hash).toBe('#/play');

	// It is the first tab stop, and it is only visible once focused.
	await page.keyboard.press('Tab');
	const skip = page.getByRole('link', { name: 'Skip to content' });
	await expect(skip).toBeFocused();

	await skip.press('Enter');
	// Focus lands on /play's own main landmark — a DISTINCT id, because `#main-content` is the
	// AppShell marker that _helpers.waitReady keys off.
	await expect(page.locator('#player-main')).toBeFocused();
	// The hash route survives (the app is a HashRouter, so following the href would rewrite it).
	expect(new URL(page.url()).hash).toBe('#/play');
});

/**
 * RC-UX-4.3 — the rail tier's right detail panel contract (`ListDetail`, app/screen-kit.tsx). On a
 * tablet the open detail sits in a panel to the RIGHT of its list instead of replacing it. Both panes
 * fill `<main>` and scroll on their own (so `<main>` never does), the detail is a labelled region,
 * neither pane widens, and nothing in either is clipped.
 */
async function expectListDetailSplit(page: Page, screen: string, viewportWidth: number) {
	const list = page.locator('[data-pane="list"]');
	const detail = page.locator('[data-pane="detail"]');
	await expect(detail, `${screen} opened no detail pane`).toBeVisible();
	await expect(detail, `${screen} detail pane has no accessible name`).toHaveAttribute(
		'aria-label',
		/\S/,
	);
	await page.waitForTimeout(100);
	const listBox = await list.boundingBox();
	const detailBox = await detail.boundingBox();
	expect(listBox, `${screen} list pane is not rendered`).not.toBeNull();
	expect(detailBox, `${screen} detail pane is not rendered`).not.toBeNull();
	if (!listBox || !detailBox) return;
	expect(listBox.width, `${screen} list pane is narrower than one card`).toBeGreaterThanOrEqual(
		279,
	);
	expect(detailBox.x, `${screen} detail must sit to the right of the list`).toBeGreaterThanOrEqual(
		listBox.x + listBox.width - 1,
	);
	expect(Math.abs(detailBox.y - listBox.y), `${screen} panes must share a top edge`).toBeLessThan(
		2,
	);
	expect(detailBox.x + detailBox.width).toBeLessThanOrEqual(viewportWidth + 1);
	expect(detailBox.width, `${screen} detail pane is too narrow to read`).toBeGreaterThanOrEqual(
		400,
	);

	const mainOverflow = await page
		.locator('#main-content')
		.evaluate((main) => main.scrollHeight - main.clientHeight);
	expect(mainOverflow, `${screen} scrolled <main> instead of its panes`).toBeLessThanOrEqual(2);
	for (const selector of ['#main-content', '[data-pane="list"]', '[data-pane="detail"]']) {
		await expectNoHorizontalOverflow(page, screen, selector);
	}
	expect(await clippedControls(page), `${screen} clipped a control`).toEqual([]);
}

for (const viewport of [
	{ name: '1024x768 landscape tablet', width: 1024, height: 768 },
	{ name: '820x1180 portrait tablet', width: 820, height: 1180 },
]) {
	test(`list/detail screens open a right detail panel beside the list on a ${viewport.name}`, async ({
		page,
	}) => {
		await page.setViewportSize({ width: viewport.width, height: viewport.height });
		await markOnboarded(page);
		await gotoRoute(page, '/');
		await seedFresh(page);
		const noteTitle = `Split pane note ${Date.now()}`;
		const created = await dispatch(page, {
			type: 'content.create-item',
			actorId: await page.evaluate(() => window.__rt!.defaultActorId),
			payload: {
				kind: 'note',
				title: noteTitle,
				body: 'Read beside the list.',
				visibility: 'dm-only',
			},
		});
		expect(created.status).toBe('accepted');

		const list = page.locator('[data-pane="list"]');
		const detail = page.locator('[data-pane="detail"]');

		// Characters, by keyboard: Enter on a roster card moves focus INTO the pane, the card is marked
		// as the open one, and the sheet's own back button closes the pane and returns focus to it.
		await gotoRoute(page, '/characters');
		const card = list.locator('[data-roster-card]').first();
		const cardName = await card.getAttribute('aria-label');
		expect(cardName, 'the seeded roster should contain a character').toBeTruthy();
		await card.focus();
		await card.press('Enter');
		await expect(detail).toBeFocused();
		await expect(detail).toHaveAttribute('aria-label', cardName!);
		await expect(card).toHaveAttribute('aria-current', 'true');
		await expectListDetailSplit(page, '/characters/:id', viewport.width);
		await detail.getByRole('button', { name: 'Characters', exact: true }).click();
		await expect(detail).toHaveCount(0);
		await expect(card).toBeFocused();
		await expectNoHorizontalOverflow(page, 'closed /characters pane', '[data-pane="list"]');

		// Knowledge: the note reads beside the note list, which stays in view.
		await gotoRoute(page, '/knowledge');
		await list.getByText(noteTitle, { exact: true }).click();
		await expect(detail).toHaveAttribute('aria-label', noteTitle);
		await expect(list.getByText(noteTitle, { exact: true })).toBeVisible();
		await expectListDetailSplit(page, '/knowledge/:id', viewport.width);
		await detail.getByRole('button', { name: 'Notes', exact: true }).click();
		await expect(detail).toHaveCount(0);

		// Campaign: the quest editor opens in the pane instead of pushing the cards down the page.
		await gotoRoute(page, '/campaign');
		await list.getByRole('button', { name: /^(New quest|Create the first quest)$/ }).click();
		await expect(detail).toBeFocused();
		await expect(detail).toHaveAttribute('aria-label', 'New quest');
		await expectListDetailSplit(page, '/campaign quest editor', viewport.width);
		await detail.getByRole('button', { name: 'Cancel', exact: true }).click();
		await expect(detail).toHaveCount(0);

		// Atlas: the map library keeps the list pane and the selected map fills the detail pane.
		await gotoRoute(page, '/atlas');
		await expectListDetailSplit(page, '/atlas', viewport.width);

		// Desktop keeps its full-width pages: nothing splits once the viewport leaves the rail tier.
		await page.setViewportSize({ width: 1280, height: 800 });
		await expect(page.locator('[data-pane]')).toHaveCount(0);
	});
}

/**
 * RC-UX-4.3 — crossing the split width must not DISCARD TYPED WORK.
 *
 * A tablet rotates between 820×1180 (split) and 1180×820 (a full-width desktop page), and the
 * list/detail screens lay themselves out differently on either side of that line. Layout is all that
 * may change: an editor the DM is part-way through has to still be there, holding every value, in
 * both directions. The first cut of this story swapped whole subtrees at the breakpoint, so a
 * rotation emptied an unsaved quest with no warning and no undo.
 */
test('rotating across the split width keeps an unsaved draft', async ({ page }) => {
	await page.setViewportSize({ width: 820, height: 1180 });
	await markOnboarded(page);
	await gotoRoute(page, '/');
	await seedFresh(page);

	const detail = page.locator('[data-pane="detail"]');
	const questTitle = 'Unsaved tablet quest';
	const questHook = 'Typed in portrait, still here in landscape.';

	// Campaign — the quest editor, opened in the tablet's detail pane and filled in there.
	await gotoRoute(page, '/campaign');
	await page.getByRole('button', { name: /^(New quest|Create the first quest)$/ }).click();
	await expect(detail).toBeVisible();
	await detail.getByLabel('Title').fill(questTitle);
	await detail.getByLabel('Hook & journal').fill(questHook);

	// Rotate to landscape, past the split width: the editor goes back inline above the cards.
	await page.setViewportSize({ width: 1180, height: 820 });
	await expect(page.locator('[data-pane]')).toHaveCount(0);
	await expect(page.getByLabel('Title')).toHaveValue(questTitle);
	await expect(page.getByLabel('Hook & journal')).toHaveValue(questHook);

	// And back into the pane, still whole. (Cancel, and the draft is gone for good — as asked.)
	await page.setViewportSize({ width: 820, height: 1180 });
	await expect(detail.getByLabel('Title')).toHaveValue(questTitle);
	await expect(detail.getByLabel('Hook & journal')).toHaveValue(questHook);
	await detail.getByRole('button', { name: 'Cancel', exact: true }).click();
	await page.getByRole('button', { name: /^(New quest|Create the first quest)$/ }).click();
	await expect(detail.getByLabel('Title')).toHaveValue('');

	// Atlas — the same contract for the "New map" form, which lives in the list pane. Its map editor
	// overlay also has to ride out the rotation rather than reopening on a blank canvas.
	await gotoRoute(page, '/atlas');
	const mapName = 'Unsaved tablet map';
	await page.getByRole('button', { name: 'New map' }).click();
	await page.getByLabel('Name', { exact: true }).fill(mapName);
	await page.setViewportSize({ width: 1180, height: 820 });
	await expect(page.locator('[data-pane]')).toHaveCount(0);
	await expect(page.getByLabel('Name', { exact: true })).toHaveValue(mapName);
	await page.setViewportSize({ width: 820, height: 1180 });
	await expect(page.getByLabel('Name', { exact: true })).toHaveValue(mapName);
});

/**
 * The detail pane and the full-width page are the SAME mount, so a rotation cannot reset what is open
 * in the detail either — here the character sheet, which is put into edit mode BEFORE the rotation.
 * That mode is the sheet's own state: it comes back as "Edit" if the sheet was remounted.
 */
test('rotating across the split width keeps the open detail mounted', async ({ page }) => {
	await page.setViewportSize({ width: 820, height: 1180 });
	await markOnboarded(page);
	await gotoRoute(page, '/');
	await seedFresh(page);

	await gotoRoute(page, '/characters');
	const detail = page.locator('[data-pane="detail"]');
	const card = page.locator('[data-roster-card]').first();
	const cardName = await card.getAttribute('aria-label');
	await card.click();
	await expect(detail).toBeVisible();
	await detail.getByRole('button', { name: 'Edit', exact: true }).click();
	await expect(detail.getByRole('button', { name: 'Done', exact: true })).toBeVisible();

	// Landscape: the sheet is a full-width page again, the same instance, still in edit mode.
	await page.setViewportSize({ width: 1180, height: 820 });
	await expect(page.locator('[data-pane]')).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeVisible();

	// Portrait again: back beside the roster, which is showing the sheet's character as the open one.
	await page.setViewportSize({ width: 820, height: 1180 });
	await expect(detail.getByRole('button', { name: 'Done', exact: true })).toBeVisible();
	await expect(detail).toHaveAttribute('aria-label', /\S/);
	await expect(page.locator(`[data-roster-card][aria-label="${cardName}"]`)).toHaveAttribute(
		'aria-current',
		'true',
	);
});
