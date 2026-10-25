import { expect, test, type Page } from '@playwright/test';
import { dispatch, enterPreview, exitPreview, gotoRoute, markOnboarded } from './_helpers';

// RC-ENG-15.3 — bookmark compatibility under IA-1 (docs/planning/IA_REVIEW.md, "Route, bookmark and
// rollback contract"). One test per row of that table, on both Playwright profiles. Each route is
// opened as a COLD pasted bookmark (a new document after about:blank), refreshed, walked Back off the
// app and Forward onto it again, then reached WARM inside the running app and walked Back/Forward.
//
// Every history write that changes the URL is recorded from the first script on each document, so
// "an alias replaces once" is checked as exactly one `replaceState` to the canonical URL and nothing
// else, and "no loop" as nothing more after it. A plain route writes nothing at all. The selected
// primary section is read off the shell (Primary on desktop, the tab bar on a phone), and the
// chrome-less entry points must render with no shell and keep their parameters untouched.

type Owner = 'Screens' | 'Characters' | 'Maps' | 'Story' | 'Notes' | 'Tools' | 'Settings';

interface RouteCase {
	/** What the bookmark says (path + query). */
	route: string;
	/** The hash the app must settle on. Differs from `#${route}` only for an alias. */
	final?: string;
	/** The section that must be selected, or null for a chrome-less entry point. */
	owner: Owner | null;
	/** What proves this route rendered (not a loading fallback or another screen). */
	ready: (page: Page) => Promise<void>;
}

const MARK = '?ref=bookmark';
const PHONE_TABS: Owner[] = ['Screens', 'Characters', 'Maps'];
// A section is `page` on its own landing and `true` while one of its shortcuts or local pages is
// the page (ADR-013 as amended): either way it is the selected section.
const CURRENT = '[aria-current="page"], [aria-current="true"]';
const IS_CURRENT = /^(page|true)$/;

declare global {
	interface Window {
		__routeWrites?: Array<{ kind: string; to: string }>;
	}
}

test.beforeEach(async ({ page }) => {
	await markOnboarded(page);
	await page.addInitScript(() => {
		window.__routeWrites = [];
		for (const kind of ['pushState', 'replaceState'] as const) {
			const original = history[kind].bind(history);
			history[kind] = (data: unknown, unused: string, url?: string | URL | null) => {
				const before = window.location.hash;
				original(data, unused, url);
				if (window.location.hash !== before)
					window.__routeWrites!.push({ kind, to: window.location.hash });
			};
		}
	});
});

function hash(page: Page): string {
	return new URL(page.url()).hash;
}

function historyLength(page: Page): Promise<number> {
	return page.evaluate(() => window.history.length);
}

function writes(page: Page) {
	return page.evaluate(() => window.__routeWrites ?? []);
}

function resetWrites(page: Page) {
	return page.evaluate(() => {
		window.__routeWrites = [];
	});
}

/** Wait for the vault to load; shelled routes also wait for the shell's main landmark. */
async function booted(page: Page, shelled: boolean) {
	await page.waitForFunction(() => window.__rt?.loaded === true, null, { timeout: 20_000 });
	if (shelled) await page.locator('#main-content').waitFor({ state: 'attached', timeout: 20_000 });
	await expect(page.getByText('Loading your vault…')).toHaveCount(0, { timeout: 20_000 });
}

/** Wait for a write to land in IndexedDB, not just in `__rt.state`, before leaving the document. */
async function persisted(page: Page) {
	await page.waitForFunction(() => window.__rt!.lastLifecycle?.status !== 'pending');
}

function isPhone(page: Page): boolean {
	return (page.viewportSize()?.width ?? 1280) <= 640;
}

/** The selected section, read the way a user sees it on this tier. Chrome-less: no shell at all. */
async function expectOwner(page: Page, owner: Owner | null) {
	const primary = page.getByRole('navigation', { name: 'Primary', exact: true });
	if (owner === null) {
		await expect(primary).toHaveCount(0);
		await expect(page.getByRole('navigation', { name: 'Screen shortcuts' })).toHaveCount(0);
		return;
	}
	const visible = primary.filter({ visible: true });
	const current = visible.locator(CURRENT);
	if (isPhone(page)) {
		const tab = PHONE_TABS.includes(owner) ? owner : 'More';
		await expect(visible.getByRole('button', { name: tab, exact: true })).toHaveAttribute(
			'aria-current',
			IS_CURRENT,
		);
		await expect(current).toHaveCount(1);
		if (tab === 'More') {
			// More changes presentation, not membership: the sheet marks the owning section itself.
			await visible.getByRole('button', { name: 'More', exact: true }).click();
			const more = page.getByRole('dialog', { name: 'All sections' });
			await expect(more.getByRole('button', { name: new RegExp(`^${owner}`) })).toHaveAttribute(
				'aria-current',
				IS_CURRENT,
			);
			await page.keyboard.press('Escape');
			await expect(more).toBeHidden();
		}
		return;
	}
	if (owner === 'Settings') {
		const utility = page.getByRole('navigation', { name: 'Settings', exact: true });
		await expect(utility.getByRole('button', { name: /^Settings/ })).toHaveAttribute(
			'aria-current',
			IS_CURRENT,
		);
		await expect(current).toHaveCount(0);
		return;
	}
	await expect(current).toHaveCount(1);
	await expect
		.poll(() => current.evaluate((b) => b.getAttribute('aria-label') ?? b.textContent ?? ''))
		.toMatch(new RegExp(`^${owner}`));
}

function expectedWrites(c: RouteCase, final: string) {
	return final === `#${c.route}` ? [] : [{ kind: 'replaceState', to: final }];
}

/** Settle on the canonical URL, prove the route rendered and the section, and check the writes. */
async function expectSettled(
	page: Page,
	c: RouteCase,
	writesSoFar: Array<{ kind: string; to: string }>,
) {
	const final = c.final ?? `#${c.route}`;
	await page.waitForURL((url) => url.hash === final, { timeout: 15_000 });
	await c.ready(page);
	await expectOwner(page, c.owner);
	expect(hash(page), 'no second redirect after the route rendered').toBe(final);
	expect(await writes(page)).toEqual(writesSoFar);
}

/**
 * A pasted bookmark in a new document, a refresh, Back off the app and Forward onto it again, then
 * the same bookmark reached warm from another section, Back and Forward.
 */
async function checkRoute(page: Page, c: RouteCase) {
	const final = c.final ?? `#${c.route}`;
	const shelled = c.owner !== null;
	await test.step(`cold ${c.route}`, async () => {
		await page.goto('about:blank');
		const before = await historyLength(page);
		await page.goto(`/#${c.route}`, { waitUntil: 'domcontentloaded' });
		await booted(page, shelled);
		await expectSettled(page, c, expectedWrites(c, final));
		// The alias replaced the bookmark's entry rather than adding one beside it.
		expect(await historyLength(page)).toBe(before + 1);

		await page.reload({ waitUntil: 'domcontentloaded' });
		await booted(page, shelled);
		await expectSettled(page, c, []);
		expect(await historyLength(page)).toBe(before + 1);

		await page.goBack();
		await page.waitForURL('about:blank');
		await page.goForward({ waitUntil: 'domcontentloaded' });
		await booted(page, shelled);
		await expectSettled(page, c, []);
		expect(await historyLength(page)).toBe(before + 1);
	});
	if (!shelled) return;
	await test.step(`warm ${c.route}`, async () => {
		const base = c.route.startsWith('/characters') ? '/atlas' : '/characters';
		await page.evaluate((target) => {
			window.location.hash = target;
		}, `#${base}`);
		await page.waitForURL((url) => url.hash === `#${base}`);
		await expectOwner(page, base === '/atlas' ? 'Maps' : 'Characters');
		const before = await historyLength(page);
		await resetWrites(page);
		await page.evaluate((target) => {
			window.location.hash = target;
		}, `#${c.route}`);
		await expectSettled(page, c, expectedWrites(c, final));
		expect(await historyLength(page), 'one navigation, one entry').toBe(before + 1);

		await resetWrites(page);
		await page.goBack();
		await page.waitForURL((url) => url.hash === `#${base}`);
		await expectOwner(page, base === '/atlas' ? 'Maps' : 'Characters');
		await page.goForward();
		await expectSettled(page, c, []);
		expect(await historyLength(page)).toBe(before + 1);
	});
}

/** The pane's own heading names the screen (the shell's <h1> is the section title). */
function screenHeading(page: Page, name: string) {
	return page.locator('#main-content').getByRole('heading', { level: 2, name, exact: true });
}

const shellHeading = (name: string | RegExp) => async (page: Page) => {
	await expect(page.getByRole('heading', { level: 1, name })).toBeAttached();
};

async function actorId(page: Page): Promise<string> {
	return page.evaluate(() => window.__rt!.defaultActorId);
}

async function homeSceneId(page: Page): Promise<string> {
	await expect
		.poll(() => page.evaluate(() => window.__rt!.state.commandCenter.homeSceneId))
		.not.toBeNull();
	return page.evaluate(() => window.__rt!.state.commandCenter.homeSceneId!);
}

async function createScreen(page: Page, name: string): Promise<string> {
	const created = await dispatch(page, {
		type: 'scene.create',
		actorId: await actorId(page),
		payload: { name, visibility: 'dm-only' },
	});
	expect(created.status).toBe('accepted');
	return created.events!.find((event) => event.kind === 'scene.created')!.sceneId as string;
}

async function rename(page: Page, sceneId: string, name: string) {
	const result = await dispatch(page, {
		type: 'scene.update-metadata',
		actorId: await actorId(page),
		payload: { sceneId, name },
	});
	expect(result.status).toBe('accepted');
}

const unavailable = (page: Page) =>
	expect(page.getByText('This screen isn’t available')).toBeVisible();

test('/, /board and /session stay default-screen entry points; /board resolves by origin', async ({
	page,
}) => {
	await gotoRoute(page, '/screens');
	const homeId = await homeSceneId(page);
	// A renamed home is still the GM screen: identity comes from its origin, never its title.
	await rename(page, homeId, 'Our table');
	await persisted(page);
	await checkRoute(page, {
		route: '/',
		owner: 'Screens',
		ready: (p) => expect(p.getByTestId('home-screen')).toBeVisible(),
	});
	await checkRoute(page, {
		route: '/board',
		final: `#/screen/${homeId}`,
		owner: 'Screens',
		ready: (p) => expect(screenHeading(p, 'Our table')).toBeVisible(),
	});
	await checkRoute(page, {
		route: `/board${MARK}`,
		final: `#/screen/${homeId}${MARK}`,
		owner: 'Screens',
		ready: (p) => expect(screenHeading(p, 'Our table')).toBeVisible(),
	});
	await checkRoute(page, {
		route: `/session${MARK}`,
		owner: 'Screens',
		ready: shellHeading(/Session/),
	});
});

test('/screens and /screen/:id keep ids; renamed, missing, deleted and private screens', async ({
	page,
}) => {
	await gotoRoute(page, '/screens');
	const renamed = await createScreen(page, 'Ford ambush');
	await rename(page, renamed, 'Ford ambush at night');
	const deleted = await createScreen(page, 'Old tavern');
	expect(
		(
			await dispatch(page, {
				type: 'scene.delete',
				actorId: await actorId(page),
				payload: { sceneId: deleted },
			})
		).status,
	).toBe('accepted');
	await persisted(page);

	await checkRoute(page, {
		route: `/screens${MARK}`,
		owner: 'Screens',
		ready: (p) => expect(p.getByTestId('screens-library')).toBeVisible(),
	});
	await checkRoute(page, {
		route: `/screen/${renamed}`,
		owner: 'Screens',
		ready: (p) => expect(screenHeading(p, 'Ford ambush at night')).toBeVisible(),
	});
	for (const id of ['no-such-screen', deleted]) {
		await checkRoute(page, {
			route: `/screen/${id}`,
			owner: 'Screens',
			ready: async (p) => {
				await unavailable(p);
				// Never swapped for some other screen.
				await expect(p.getByTestId('screen-pin')).toHaveCount(0);
			},
		});
	}
});

test('a private screen stays unavailable to a previewed player, cold and through Back/Forward', async ({
	page,
}) => {
	await gotoRoute(page, '/screens');
	const homeId = await homeSceneId(page);
	const secret = await createScreen(page, 'Villain lair');
	await persisted(page);
	await enterPreview(page, 'player');
	const before = await historyLength(page);
	await resetWrites(page);
	// A bookmark pasted into this tab while previewing: the player's read decides, not the GM's.
	await page.evaluate((target) => {
		window.location.hash = target;
	}, `#/screen/${secret}`);
	await page.waitForURL((url) => url.hash === `#/screen/${secret}`);
	await unavailable(page);
	await expect(screenHeading(page, 'Villain lair')).toHaveCount(0);
	await expectOwner(page, 'Screens');
	expect(await writes(page)).toEqual([]);
	expect(await historyLength(page)).toBe(before + 1);
	// `/board` keeps its non-GM state: no redirect to the GM's home screen.
	await page.evaluate(() => {
		window.location.hash = '#/board';
	});
	await page.waitForURL((url) => url.hash === '#/board');
	await expect(page.locator('#main-content')).toBeAttached();
	await expect(screenHeading(page, 'Villain lair')).toHaveCount(0);
	await expect(page.getByTestId('screen-pin')).toHaveCount(0);
	expect(await writes(page)).toEqual([]);
	await page.goBack();
	await page.waitForURL((url) => url.hash === `#/screen/${secret}`);
	await unavailable(page);
	await page.goBack();
	await page.waitForURL((url) => url.hash === '#/screens');
	await page.goForward();
	await page.waitForURL((url) => url.hash === `#/screen/${secret}`);
	await unavailable(page);
	expect(await writes(page)).toEqual([]);
	expect(hash(page)).not.toContain(homeId);
	await exitPreview(page);
	// The GM, back in their own view, opens it again from the same entry.
	await expect(screenHeading(page, 'Villain lair')).toBeVisible();
});

test('/scenes and /scene/:id migrate with their query, edit intent kept; templates keep their editor', async ({
	page,
}) => {
	await gotoRoute(page, '/screens');
	const screen = await createScreen(page, 'Harbour chase');
	const saved = await dispatch(page, {
		type: 'scene.save-template',
		actorId: await actorId(page),
		payload: { sourceSceneId: screen, templateName: 'Chase template' },
	});
	expect(saved.status).toBe('accepted');
	const template = saved.events!.find((event) => event.kind === 'scene.template-saved')!
		.templateSceneId as string;
	await persisted(page);

	await checkRoute(page, {
		route: `/scenes${MARK}`,
		final: `#/screens${MARK}`,
		owner: 'Screens',
		ready: (p) => expect(p.getByTestId('screens-library')).toBeVisible(),
	});
	const editing = async (p: Page) => {
		await expect(screenHeading(p, 'Harbour chase')).toBeVisible();
		await expect(p.getByRole('button', { name: 'Done', exact: true })).toBeVisible();
	};
	await checkRoute(page, {
		route: `/scene/${screen}${MARK}`,
		final: `#/screen/${screen}${MARK}&edit=1`,
		owner: 'Screens',
		ready: editing,
	});
	await checkRoute(page, {
		route: `/screen/${screen}?edit=1`,
		owner: 'Screens',
		ready: editing,
	});
	await checkRoute(page, {
		route: `/scene/${template}`,
		owner: 'Screens',
		ready: async (p) => {
			await expect(p.getByTestId('scene-unavailable')).toHaveCount(0);
			await expect(p.getByRole('button', { name: 'Edit layout', exact: true })).toBeVisible();
		},
	});
});

test('/characters/:id?, /player and /atlas keep paths and ids; Characters and Maps', async ({
	page,
}) => {
	await gotoRoute(page, '/characters');
	const character = await page.evaluate(
		() => Object.keys(window.__rt!.state.characters.characters)[0]!,
	);
	await checkRoute(page, {
		route: `/characters${MARK}`,
		owner: 'Characters',
		ready: shellHeading('Characters'),
	});
	await checkRoute(page, {
		route: `/characters/${character}`,
		owner: 'Characters',
		ready: shellHeading('Characters'),
	});
	await checkRoute(page, { route: '/player', owner: 'Characters', ready: shellHeading(/./) });
	await checkRoute(page, { route: `/atlas${MARK}`, owner: 'Maps', ready: shellHeading('Maps') });
});

test('/campaign and its deep links select Story', async ({ page }) => {
	await gotoRoute(page, '/campaign');
	for (const route of [`/campaign${MARK}`, '/campaign/calendar', '/campaign/relationships'])
		await checkRoute(page, { route, owner: 'Story', ready: shellHeading(/./) });
});

test('/knowledge/:id?, /graph and /graph/repair select Notes', async ({ page }) => {
	await gotoRoute(page, '/knowledge');
	const note = await page.evaluate(() => Object.keys(window.__rt!.state.content.items)[0]!);
	for (const route of [`/knowledge${MARK}`, `/knowledge/${note}`, '/graph', '/graph/repair'])
		await checkRoute(page, { route, owner: 'Notes', ready: shellHeading(/./) });
});

test('/audio, /extensions and /community keep their bookmarks beside the additive /tools', async ({
	page,
}) => {
	await gotoRoute(page, '/tools');
	for (const route of ['/tools', `/audio${MARK}`, '/extensions', '/community'])
		await checkRoute(page, { route, owner: 'Tools', ready: shellHeading(/./) });
});

test('/upgrade and /settings identify the Settings utility', async ({ page }) => {
	await gotoRoute(page, '/settings');
	for (const route of [`/settings${MARK}`, '/upgrade'])
		await checkRoute(page, { route, owner: 'Settings', ready: shellHeading(/./) });
});

test('/play, /join, /wiki, /display and /legal/* stay chrome-less with their parameters', async ({
	page,
}) => {
	await gotoRoute(page, '/');
	const cases: RouteCase[] = [
		{
			route: '/play',
			owner: null,
			ready: (p) => expect(p.getByRole('button', { name: 'Join a table' })).toBeVisible(),
		},
		{
			route: '/join?token=e2e-fake-invite-token',
			owner: null,
			ready: (p) => expect(p.getByRole('main', { name: 'Campaign invite' })).toBeVisible(),
		},
		{
			route: '/wiki?id=route-compat-not-a-real-wiki',
			owner: null,
			ready: (p) => expect(p.locator('body')).not.toBeEmpty(),
		},
		{ route: '/display', owner: null, ready: (p) => expect(p.locator('body')).not.toBeEmpty() },
		{
			route: '/legal/privacy',
			owner: null,
			ready: (p) => expect(p.getByRole('heading', { level: 1 })).toBeVisible(),
		},
		{
			route: '/legal/terms',
			owner: null,
			ready: (p) => expect(p.getByRole('heading', { level: 1 })).toBeVisible(),
		},
	];
	for (const c of cases) await checkRoute(page, c);
	// The companion's own join path still opens from /play.
	await page.goto('/#/play', { waitUntil: 'domcontentloaded' });
	await page.getByRole('button', { name: 'Join a table' }).click();
	await expect(page.getByRole('dialog', { name: 'Join a table' })).toBeVisible();
	expect(hash(page)).toBe('#/play');
});

test('an alias carries router state and its query through its one replace', async ({ page }) => {
	await gotoRoute(page, '/screens');
	const homeId = await homeSceneId(page);
	const screen = await createScreen(page, 'Market brawl');
	for (const [route, final] of [
		[`/scenes${MARK}`, `#/screens${MARK}`],
		[`/board${MARK}`, `#/screen/${homeId}${MARK}`],
		[`/scene/${screen}${MARK}`, `#/screen/${screen}${MARK}&edit=1`],
	] as const) {
		await gotoRoute(page, '/characters');
		const before = await historyLength(page);
		await resetWrites(page);
		// An in-app link with router state, as the Command Center's "New widget" makes one: the
		// router's own entry shape, then the popstate it listens for.
		await page.evaluate((target) => {
			const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
			window.history.pushState(
				{ usr: { routeCompat: target }, key: 'route-compat', idx: idx + 1 },
				'',
				`#${target}`,
			);
			window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
		}, route);
		await page.waitForURL((url) => url.hash === final, { timeout: 15_000 });
		await expect
			.poll(() => page.evaluate(() => (window.history.state as { usr?: unknown } | null)?.usr))
			.toEqual({ routeCompat: route });
		expect(await historyLength(page)).toBe(before + 1);
		expect(await writes(page)).toEqual([
			{ kind: 'pushState', to: `#${route}` },
			{ kind: 'replaceState', to: final },
		]);
	}
});
