import { openCompanionMore, selectCompanionSection } from './_companion';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { markOnboarded } from './_helpers';

async function open(page: Page) {
	await markOnboarded(page);
	await page.goto('/#/play');
	await page.waitForFunction(() => window.__rt?.loaded === true);
	// Character and private-journal checks need a real seat; generic Player has no character.
	await page.evaluate(() =>
		window.__rt!.enterPreview({ role: 'player', playerActorId: 'actor-player' }),
	);
	await expect(page.locator('#player-main h1')).toBeVisible();
}
async function axe(page: Page) {
	await page.evaluate(async () => {
		await document.fonts.ready;
		await Promise.all(
			document
				.getAnimations()
				.filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
				.map((a) => a.finished.catch(() => {})),
		);
	});
	const scan = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
		.analyze();
	expect(
		scan.violations.map((v) => ({
			id: v.id,
			nodes: v.nodes.map((n) => ({ target: n.target, failure: n.failureSummary })),
		})),
	).toEqual([]);
}

async function checkNavigationTargets(page: Page) {
	await open(page);
	await page.evaluate(() => document.fonts.ready);
	await openCompanionMore(page);
	const navigation = page.locator(
		'.player-view-nav-row:visible, .player-view-bottom-tabs button:visible',
	);
	await expect(navigation).toHaveCount(page.viewportSize()!.width <= 640 ? 11 : 10);
	for (const android of [false, true]) {
		await page.evaluate((android) => {
			document.documentElement.toggleAttribute('data-android', android);
		}, android);
		for (const action of await navigation.all()) {
			const bounds = await action.boundingBox();
			expect(bounds).not.toBeNull();
			expect(bounds!.width).toBeGreaterThanOrEqual(android ? 48 : 44);
			expect(bounds!.height).toBeGreaterThanOrEqual(android ? 48 : 44);
		}
	}
}

test('navigation keeps web and Android touch floors', async ({ page }) => {
	await checkNavigationTargets(page);
});

test.describe('wide touch viewport', () => {
	test.use({ viewport: { width: 1280, height: 800 }, hasTouch: true, isMobile: false });
	test('navigation keeps web and Android touch floors', async ({ page }) => {
		await checkNavigationTargets(page);
		expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
	});
});

test('presence and join actions keep their touch floor in both toggle states', async ({ page }) => {
	await open(page);
	await page.evaluate(() => document.fonts.ready);
	const hand = page.getByRole('button', { name: 'Raise hand', exact: true });
	const ready = page.getByRole('button', { name: "I'm ready", exact: true });
	const join = page.getByRole('button', { name: 'Join a table', exact: true });
	const presence = page.locator('#player-main button[aria-pressed]');
	for (const android of [false, true]) {
		await page.evaluate((android) => {
			document.documentElement.toggleAttribute('data-android', android);
		}, android);
		for (const pressed of [false, true]) {
			if (pressed) {
				await hand.click();
				await ready.click();
			}
			await expect(presence).toHaveCount(2);
			for (const action of [presence.nth(0), presence.nth(1), join]) {
				const bounds = await action.boundingBox();
				expect(bounds).not.toBeNull();
				expect(bounds!.width).toBeGreaterThanOrEqual(android ? 48 : 44);
				expect(bounds!.height).toBeGreaterThanOrEqual(android ? 48 : 44);
			}
			await expect(presence.nth(0)).toHaveAttribute('aria-pressed', String(pressed));
			await expect(presence.nth(1)).toHaveAttribute('aria-pressed', String(!pressed));
		}
		await presence.nth(0).click();
		await presence.nth(1).click();
	}
	await join.click();
	await expect(page.getByRole('dialog')).toBeVisible();
});

test('all companion sections and join overlay are axe clean', async ({ page }) => {
	test.setTimeout(120_000);
	await open(page);
	await axe(page);
	for (const name of ['My character', 'Dice', 'Party', 'Handouts', 'Journal', 'Inbox']) {
		await selectCompanionSection(page, name);
		await expect(page.locator('#player-main h1')).toHaveCount(1);
		await axe(page);
	}
	await page.getByRole('button', { name: 'Join a table', exact: true }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
	await axe(page);
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('private deletion names its target, cancels with focus restored, and confirms', async ({
	page,
}) => {
	await open(page);
	await selectCompanionSection(page, 'Journal');
	await page.getByRole('button', { name: 'Write a note', exact: true }).click();
	const form = page.getByTestId('private-note-form');
	await form.getByLabel('Title', { exact: true }).fill('Gate watch');
	await form.getByLabel('Note', { exact: true }).fill('Keep the north gate closed.');
	await page.getByRole('button', { name: 'Save note', exact: true }).click();
	const row = page.getByTestId('private-note');
	await expect(row).toHaveCount(1);
	const remove = row.getByRole('button');
	await remove.focus();
	await page.keyboard.press('Enter');
	const dialog = page.getByRole('dialog', { name: 'Delete “Gate watch”?' });
	await expect(dialog).toBeVisible();
	await axe(page);
	await page.keyboard.press('Escape');
	await expect(remove).toBeFocused();
	await expect(row).toHaveCount(1);
	await remove.click();
	await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(row).toHaveCount(0);
	await expect(page.getByTestId('private-journal-status')).toHaveText('Removed from this device.');
});

test('large text and Android navigation leave scrolled presence controls reachable', async ({
	page,
}) => {
	await page.setViewportSize({ width: 360, height: 640 });
	await open(page);
	const session = await page.context().newCDPSession(page);
	for (const fontSize of [32, 16]) {
		await session.send('Page.setFontSizes', { fontSizes: { standard: fontSize } });
		for (const android of [false, true]) {
			await page.evaluate((android) => {
				document.documentElement.toggleAttribute('data-android', android);
			}, android);
			await expect
				.poll(() =>
					page.evaluate(() => {
						const height = document
							.querySelector('.player-view-sidebar')!
							.getBoundingClientRect().height;
						return Math.abs(
							parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom) - height,
						);
					}),
				)
				.toBeLessThan(1);
			const hand = page.locator('.player-presence-action').first();
			await page.evaluate(() => window.scrollTo(0, 0));
			await hand.evaluate((element) => element.scrollIntoView({ block: 'nearest' }));
			expect(
				await hand.evaluate((element) => {
					const bounds = element.getBoundingClientRect();
					return element.contains(
						document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2),
					);
				}),
			).toBe(true);
			const pressed = await hand.getAttribute('aria-pressed');
			await hand.click();
			await expect(hand).toHaveAttribute('aria-pressed', String(pressed !== 'true'));
			// Let the confirmation clear before testing another layout's hit target.
			await expect(page.locator('.player-view-toast-viewport > div')).toHaveCount(0);
		}
	}
	await page.goto('/#/join');
	await expect
		.poll(() =>
			page.evaluate(() =>
				document.documentElement.style.getPropertyValue('--player-navigation-height'),
			),
		)
		.toBe('');
});

test('200 percent layout keeps navigation and private forms reachable', async ({ page }) => {
	await open(page);
	await page.evaluate(() => {
		document.documentElement.style.zoom = '2';
	});
	await openCompanionMore(page);
	const journal = page.getByRole('button', { name: 'Journal', exact: true });
	await journal.focus();
	await page.keyboard.press('Enter');
	await page.getByRole('button', { name: 'Write a note', exact: true }).click();
	await page
		.getByTestId('private-note-form')
		.getByLabel('Title', { exact: true })
		.fill('Large text');
	await page.getByRole('button', { name: 'Save note', exact: true }).click();
	await expect(page.getByTestId('private-note')).toContainText('Large text');
	expect(
		await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
	).toBe(true);
});

test('private storage failures offer retry and preserve an unsaved draft', async ({ page }) => {
	await open(page);
	await page.evaluate(() => {
		const original = IDBDatabase.prototype.transaction;
		const flags = window as unknown as { failPrivateRead: boolean; failPrivateWrite: boolean };
		flags.failPrivateRead = true;
		flags.failPrivateWrite = false;
		IDBDatabase.prototype.transaction = function (...args) {
			if (
				(this.name.includes('private-') || this.name.includes('vault-private:')) &&
				(args[1] === 'readwrite' ? flags.failPrivateWrite : flags.failPrivateRead)
			) {
				throw new DOMException('Storage unavailable for test', 'UnknownError');
			}
			return original.apply(this, args);
		};
	});
	await selectCompanionSection(page, 'Journal');
	await expect(page.getByRole('alert')).toContainText('Could not open your private journal');
	await axe(page);
	await page.evaluate(() => {
		(window as unknown as { failPrivateRead: boolean }).failPrivateRead = false;
	});
	await page.getByRole('button', { name: 'Try again', exact: true }).click();
	await page.getByRole('button', { name: 'Write a note', exact: true }).click();
	const form = page.getByTestId('private-note-form');
	await form.getByLabel('Title', { exact: true }).fill('Still here');
	await form.getByLabel('Note', { exact: true }).fill('Do not lose this draft.');
	await page.evaluate(() => {
		(window as unknown as { failPrivateWrite: boolean }).failPrivateWrite = true;
	});
	await page.getByRole('button', { name: 'Save note', exact: true }).click();
	await expect(page.getByRole('alert')).toContainText('Could not save the change');
	await expect(form.getByLabel('Note', { exact: true })).toHaveValue('Do not lose this draft.');
	await axe(page);
	await page.evaluate(() => {
		(window as unknown as { failPrivateWrite: boolean }).failPrivateWrite = false;
	});
	await page.getByRole('button', { name: 'Save note', exact: true }).click();
	await expect(page.getByTestId('private-note')).toContainText('Do not lose this draft.');
});

test('stage and journal clear axe in every theme', async ({ page }) => {
	test.setTimeout(120_000);
	await open(page);
	for (const theme of ['tavern', 'parchment', 'scholar', 'dungeon', 'high-contrast']) {
		await page.evaluate(
			(theme) => document.documentElement.setAttribute('data-theme', theme),
			theme,
		);
		await selectCompanionSection(page, 'Now playing');
		await axe(page);
		await selectCompanionSection(page, 'Journal');
		await axe(page);
	}
});

test('Co-DM sections are axe clean without changing actor visibility', async ({ page }) => {
	await open(page);
	await page.evaluate(() => window.__rt!.enterPreview({ role: 'co-dm' }));
	await page.waitForFunction(() => window.__rt?.preview?.role === 'co-dm');
	for (const name of ['Maps', 'Bestiary', 'Combat assist']) {
		await selectCompanionSection(page, name);
		await axe(page);
	}
});
