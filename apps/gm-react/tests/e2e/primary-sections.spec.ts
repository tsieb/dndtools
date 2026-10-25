import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded } from './_helpers';

// RC-ENG-15.1 — IA-1 (docs/planning/IA_REVIEW.md, ADR-013 as amended). The configured count lives
// in nav.test.ts; these check what each tier actually renders, and that Screens stays one tap away
// on a phone whatever the pins and the session are doing.

const SECTIONS = ['Screens', 'Characters', 'Maps', 'Story', 'Notes', 'Tools'];

/** Unpin everything, then pin `count` new screens; returns the new screens' ids in pin order. */
async function setPins(page: Page, count: number): Promise<string[]> {
	const pinned = await page.evaluate(() =>
		Object.values(window.__rt!.state.scenes.scenes)
			.filter((scene) => (scene as { screen?: { pinned?: boolean } }).screen?.pinned)
			.map((scene) => (scene as { id: string }).id),
	);
	for (const sceneId of pinned) {
		const result = await dispatch(page, {
			type: 'scene.set-pinned',
			actorId: await page.evaluate(() => window.__rt!.defaultActorId),
			payload: { sceneId, pinned: false },
		});
		expect(result.status).toBe('accepted');
	}
	return page.evaluate(async (n) => {
		const rt = window.__rt!;
		const ids: string[] = [];
		for (let i = 1; i <= n; i += 1) {
			const created = await rt.dispatch({
				type: 'scene.create',
				actorId: rt.defaultActorId,
				payload: { name: `Pin ${String(i).padStart(2, '0')}`, visibility: 'dm-only' },
			});
			if (created.status !== 'accepted') throw new Error(JSON.stringify(created));
			const id = created.events!.find((event) => event.kind === 'scene.created')!.sceneId as string;
			const pinnedResult = await rt.dispatch({
				type: 'scene.set-pinned',
				actorId: rt.defaultActorId,
				payload: { sceneId: id, pinned: true },
			});
			if (pinnedResult.status !== 'accepted') throw new Error(JSON.stringify(pinnedResult));
			ids.push(id);
		}
		return ids;
	}, count);
}

async function setLive(page: Page, sceneId: string | null) {
	const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
	const result = await dispatch(page, {
		type: 'session.set-workflow',
		actorId,
		payload: sceneId ? { workflow: 'active', activeSceneId: sceneId } : { workflow: 'idle' },
	});
	expect(result.status).toBe('accepted');
}

for (const [tier, width] of [
	['desktop', 1440],
	['rail', 900],
] as const) {
	test(`${tier}: Primary renders the six sections and nothing else`, async ({ page }) => {
		await page.setViewportSize({ width, height: 1000 });
		await markOnboarded(page);
		await gotoRoute(page, '/characters');
		const primary = page.getByRole('navigation', { name: 'Primary', exact: true });
		const buttons = primary.getByRole('button');
		await expect(buttons).toHaveCount(6);
		const names = await buttons.evaluateAll((all) =>
			all.map((button) => button.getAttribute('aria-label') ?? button.textContent ?? ''),
		);
		names.forEach((name, index) => expect(name.startsWith(SECTIONS[index]!)).toBe(true));
		const current = primary.locator('[aria-current="page"]');
		await expect(current).toHaveCount(1);
		expect(
			await current.evaluate(
				(button) => button.getAttribute('aria-label') ?? button.textContent ?? '',
			),
		).toMatch(/^Characters/);
		// The default run screens are shortcuts in their own region, not primary sections.
		const shortcuts = page.getByRole('navigation', { name: 'Screen shortcuts' });
		await expect(shortcuts.getByRole('button')).toHaveCount(3);
		// Tools opens its additive landing; the tools keep their own routes.
		await primary.getByRole('button', { name: /^Tools/ }).click();
		await page.waitForURL((url) => url.hash === '#/tools');
		await expect(page.getByRole('heading', { level: 1, name: 'Tools' })).toBeAttached();
		await page.getByRole('button', { name: 'Open Audio' }).click();
		await page.waitForURL((url) => url.hash === '#/audio');
		await expect(primary.locator('[aria-current="page"]')).toHaveCount(1);
		const axe = await new AxeBuilder({ page }).withRules(['landmark-unique']).analyze();
		expect(axe.violations).toEqual([]);
	});
}

test.describe('phone: Screens is one tap away', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await markOnboarded(page);
		await gotoRoute(page, '/knowledge');
	});

	test('tabs are Screens, Characters, Maps, More; More holds Story, Notes, Tools', async ({
		page,
	}) => {
		const tabs = page.getByRole('navigation', { name: 'Primary' }).filter({ visible: true });
		expect(
			await tabs
				.getByRole('button')
				.evaluateAll((all) => all.map((button) => button.textContent?.trim())),
		).toEqual(['Screens', 'Characters', 'Maps', 'More']);
		await expect(tabs.getByRole('button', { name: 'More' })).toHaveAttribute(
			'aria-current',
			'page',
		);
		await tabs.getByRole('button', { name: 'More' }).click();
		const more = page.getByRole('dialog', { name: 'All sections' });
		for (const name of ['Story', 'Notes', 'Tools', 'Settings'])
			await expect(more.getByRole('button', { name: new RegExp(`^${name}`) })).toBeVisible();
		await expect(more.getByRole('button', { name: /^Notes/ })).toHaveAttribute(
			'aria-current',
			'page',
		);
		await page.keyboard.press('Escape');
		await expect(more).toBeHidden();
	});

	test('with no pins the chooser still reaches every run screen', async ({ page }) => {
		await setPins(page, 0);
		const tab = page.getByRole('button', { name: 'Screens', exact: true });
		await expect(tab).toHaveAttribute('aria-haspopup', 'dialog');
		await tab.click();
		const chooser = page.getByRole('dialog', { name: 'Open a screen' });
		await expect(tab).toHaveAttribute('aria-expanded', 'true');
		for (const name of [/^Command Center/, /screen/, /^Session/, /^All screens/])
			await expect(chooser.getByRole('button', { name }).first()).toBeVisible();
		await expect(chooser.getByTestId('pinned-screens')).toHaveCount(0);
		const axe = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
		expect(axe.violations).toEqual([]);
		await chooser.getByRole('button', { name: /^Session/ }).click();
		await expect(chooser).toBeHidden();
		await page.waitForURL((url) => /^#\/(session|screen\/)/.test(url.hash));
		await expect(tab).toHaveAttribute('aria-current', 'page');
	});

	test('with a long pin list the tab stays put and the last pin is reachable', async ({ page }) => {
		const ids = await setPins(page, 24);
		const tab = page.getByRole('button', { name: 'Screens', exact: true });
		const before = await tab.boundingBox();
		await tab.click();
		const chooser = page.getByRole('dialog', { name: 'Open a screen' });
		const last = chooser.getByRole('button', { name: /^Pin 24/ });
		await last.scrollIntoViewIfNeeded();
		await expect(last).toBeInViewport();
		await last.click();
		await page.waitForURL((url) => url.hash === `#/screen/${ids[23]}`);
		expect(await tab.boundingBox()).toEqual(before);
		// More lists the same pins first (ADR-041).
		await page.getByRole('button', { name: 'More', exact: true }).click();
		const more = page.getByRole('dialog', { name: 'All sections' });
		await expect(more.getByTestId('pinned-screens').locator('[data-screen-pin]')).toHaveCount(24);
		await page.keyboard.press('Escape');
	});

	test('a live session marks the tab and leads the chooser without navigating', async ({
		page,
	}) => {
		const [id] = await setPins(page, 2);
		await setLive(page, id!);
		await expect(page).toHaveURL(/#\/knowledge$/);
		const tab = page.getByRole('button', { name: 'Screens', exact: true });
		// The tab carries the live dot (the status strip above the bar says it in words).
		await expect(page.getByTestId('phone-session-strip')).toBeVisible();
		const dots = (name: string) =>
			page.getByRole('button', { name, exact: true }).locator('span[aria-hidden="true"]').count();
		expect(await dots('Screens')).toBe((await dots('Characters')) + 1);
		await tab.click();
		const chooser = page.getByRole('dialog', { name: 'Open a screen' });
		const live = chooser.getByTestId('screens-sheet-live');
		await expect(live.getByRole('button', { name: /Pin 01.*Live/ })).toBeVisible();
		const liveBox = (await live.boundingBox())!;
		const sessionBox = (await chooser.getByRole('button', { name: /^Session/ }).boundingBox())!;
		expect(liveBox.y).toBeLessThan(sessionBox.y);
		await live.getByRole('button').click();
		await page.waitForURL((url) => url.hash === `#/screen/${id}`);
		await setLive(page, null);
	});
});
