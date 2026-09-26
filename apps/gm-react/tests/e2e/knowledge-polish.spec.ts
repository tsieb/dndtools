import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { dispatch, enterPreview, gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// RC-POL-1.11 — the Notes (Knowledge) polish pass. Strict axe (every WCAG 2.2 AA rule plus best
// practice, nothing excluded) over the route and each overlay it opens, on both profiles; the
// keyboard path through the primary task; 200% text; the named confirms; one failure path; and the
// player projection read through a real preview actor.

const SEEDED_VISIBLE = 'Campaign Primer';
const SEEDED_DM_ONLY = 'The Sunken Crypt — DM notes';

async function axe(page: Page, label: string) {
	// Toasts fade and dialogs animate in; scan the settled page, not a half-drawn frame.
	await page.waitForTimeout(250);
	const result = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
		.analyze();
	expect(
		result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
		label,
	).toEqual([]);
}

async function createNote(page: Page, title: string, body: string, visibility = 'dm-only') {
	const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
	const result = await dispatch(page, {
		type: 'content.create-item',
		actorId,
		payload: { kind: 'note', title, body, visibility },
	});
	expect(result.status).toBe('accepted');
	const created = (result.events ?? []).find((e) => e.kind === 'content.item-changed');
	return created!.itemId as string;
}

/** Make the next dispatch of `type` throw, as a failed persist does; later calls go through. */
async function failNext(page: Page, type: string) {
	await page.evaluate((failing) => {
		const rt = window.__rt!;
		const original = rt.dispatch.bind(rt);
		rt.dispatch = async (...args: Parameters<typeof rt.dispatch>) => {
			if (args[0].type === failing) {
				rt.dispatch = original;
				throw new Error('Simulated storage failure');
			}
			return original(...args);
		};
	}, type);
}

test.beforeEach(async ({ page }) => {
	await markOnboarded(page);
	await gotoRoute(page, '/knowledge');
	await seedFresh(page);
	await page.goto('/#/knowledge', { waitUntil: 'domcontentloaded' });
	await waitReady(page);
	await page.locator('#main-content').waitFor({ state: 'attached' });
});

test('knowledge polish: axe clean for the list and every disclosure it opens', async ({ page }) => {
	await expect(page.getByRole('heading', { level: 2, name: /\d+ notes/ })).toBeVisible();
	await axe(page, 'note list');

	await page.getByTestId('knowledge-filters-toggle').click();
	await expect(page.getByTestId('filters-results')).toBeVisible();
	await axe(page, 'filters with results');
	await page.getByTestId('filters-query').fill('zzzz-no-such-words');
	await expect(page.getByTestId('filters-no-results')).toBeVisible();
	await expect(page.getByTestId('filters-count')).toHaveText('0 matches');
	await axe(page, 'filters with no results');

	await page.getByTestId('knowledge-templates-toggle').click();
	for (const tab of ['New from template', 'Your templates', 'Snippets']) {
		await page.getByRole('tab', { name: tab }).click();
		await axe(page, `templates: ${tab}`);
	}

	await page.getByRole('button', { name: 'Import vault', exact: true }).click();
	await page.getByLabel('Markdown or JSON to import').fill('===== Pier.md =====\nPlanks.');
	await page.getByLabel('When a note already exists').selectOption('overwrite');
	await page.getByRole('button', { name: 'Import', exact: true }).click();
	await expect(page.getByRole('dialog', { name: 'Overwrite existing notes?' })).toBeVisible();
	await axe(page, 'overwrite confirm');
	await page.getByRole('button', { name: 'Cancel', exact: true }).click();

	await page.getByRole('button', { name: 'New note', exact: true }).first().click();
	await expect(page.getByLabel('New note title')).toBeFocused();
	await axe(page, 'composer');
});

test('knowledge polish: axe clean for the open note, its editor, history and reveal confirm', async ({
	page,
}) => {
	const id = await createNote(
		page,
		'Polish Ledger',
		'# Harbor\n\n> [!Lore] Tides\n> The clock stopped.\n\n| Ship | Berth |\n| --- | --- |\n| Gull | 3 |\n\nRoll [[roll:1d20+2]].',
	);
	await gotoRoute(page, `/knowledge/${id}`);
	await expect(page.getByRole('heading', { level: 2, name: 'Polish Ledger' })).toBeVisible();
	await axe(page, 'note viewer');

	await page.getByRole('button', { name: 'Edit', exact: true }).click();
	await page.locator('textarea').fill('Edited once.');
	await page.getByRole('button', { name: 'Save note', exact: true }).click();
	await page.getByRole('button', { name: 'Show history', exact: true }).click();
	await expect(page.getByRole('list', { name: 'History', exact: true })).toBeVisible();
	await expect(page.getByText(/Revision \d+ · current/)).toBeVisible();
	await axe(page, 'history open');

	await page.getByRole('button', { name: 'Edit', exact: true }).click();
	await expect(page.getByRole('toolbar', { name: 'Formatting' })).toBeVisible();
	await axe(page, 'editor');
	await page.getByRole('button', { name: 'Cancel', exact: true }).click();

	await page.getByRole('button', { name: 'Push to players', exact: true }).last().click();
	await expect(page.getByRole('dialog', { name: /Polish Ledger/ })).toBeVisible();
	await axe(page, 'reveal confirm');
});

test('knowledge polish: history rows name the author and a failed restore stays retryable', async ({
	page,
}) => {
	const id = await createNote(page, 'Restore Ledger', 'Original text.');
	await gotoRoute(page, `/knowledge/${id}`);
	await page.getByRole('button', { name: 'Edit', exact: true }).click();
	await page.locator('textarea').fill('Second text.');
	await page.getByRole('button', { name: 'Save note', exact: true }).click();
	await page.getByRole('button', { name: 'Show history', exact: true }).click();

	const history = page.getByRole('list', { name: 'History', exact: true });
	const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
	const name = await page.evaluate(
		(a) => window.__rt!.state.permissions.actors[a]?.displayName ?? '',
		actorId,
	);
	expect(name).not.toBe('');
	await expect(history).toContainText(name);
	// The raw actor id is an internal key, not something a reader should see.
	if (name !== actorId) await expect(history).not.toContainText(actorId);

	const restore = history.getByRole('button', { name: /^Restore revision \d+$/ }).first();
	await failNext(page, 'content.update-item');
	await restore.click();
	await expect(history.getByRole('alert')).toContainText('Simulated storage failure');
	await expect(restore).toBeEnabled();
	await axe(page, 'failed restore');

	await restore.click();
	await expect(page.getByText(/^Restored revision \d+\.$/)).toBeVisible();
	await expect
		.poll(() => page.evaluate((i) => window.__rt!.state.content.items[i]!.body, id))
		.toBe('Original text.');
});

test('knowledge polish: keyboard alone creates a note, and focus is always visible', async ({
	page,
}) => {
	const newNote = page.getByRole('button', { name: 'New note', exact: true }).first();
	await newNote.focus();
	await expect(newNote).toBeFocused();
	const ring = await newNote.evaluate((el) => {
		const style = getComputedStyle(el);
		return style.outlineStyle !== 'none' || style.boxShadow !== 'none';
	});
	expect(ring, 'the focused New note button draws no focus indicator').toBe(true);
	await page.keyboard.press('Enter');
	const title = page.getByLabel('New note title');
	await expect(title).toBeFocused();
	await page.keyboard.type('Keyboard Ledger');
	await page.keyboard.press('Enter');
	await expect(page.getByRole('heading', { level: 2, name: 'Keyboard Ledger' })).toBeVisible();

	// Into the editor and back out through the toolbar, all from the keyboard.
	const edit = page.getByRole('button', { name: 'Edit', exact: true });
	await edit.focus();
	await page.keyboard.press('Enter');
	const toolbar = page.getByRole('toolbar', { name: 'Formatting' });
	await toolbar.getByRole('button', { name: 'Bold' }).focus();
	await page.keyboard.press('ArrowRight');
	await expect(toolbar.getByRole('button', { name: 'Italic' })).toBeFocused();
	// Tab leaves the toolbar as one stop. On a phone the Write/Preview switch comes next, then the
	// body; on desktop the body is next.
	const body = page.locator('textarea');
	for (let i = 0; i < 4 && !(await body.evaluate((el) => el === document.activeElement)); i++) {
		await page.keyboard.press('Tab');
	}
	await expect(body).toBeFocused();
	await page.keyboard.type('Typed by keyboard.');
	await page.getByRole('button', { name: 'Save note', exact: true }).focus();
	await page.keyboard.press('Enter');
	await expect(page.locator('.knowledge-prose')).toContainText('Typed by keyboard.');
});

test('knowledge polish: 200% text leaves the list, the note and its editor unclipped', async ({
	page,
}) => {
	const id = await createNote(page, 'A deliberately long note title that has to wrap', 'Body.');
	await page.locator('html').evaluate((el) => (el.style.fontSize = '200%'));
	const overflow = () =>
		page.locator('#main-content').evaluate((el) => el.scrollWidth - el.clientWidth);
	expect(await overflow(), 'the note list scrolls sideways at 200%').toBeLessThanOrEqual(1);
	await page.getByRole('button', { name: 'New note', exact: true }).first().click();
	const create = page.getByRole('button', { name: 'Create', exact: true });
	await create.scrollIntoViewIfNeeded();
	await expect(create).toBeInViewport();

	await gotoRoute(page, `/knowledge/${id}`);
	await page.locator('html').evaluate((el) => (el.style.fontSize = '200%'));
	expect(await overflow(), 'the open note scrolls sideways at 200%').toBeLessThanOrEqual(1);
	await page.getByRole('button', { name: 'Edit', exact: true }).click();
	expect(await overflow(), 'the editor scrolls sideways at 200%').toBeLessThanOrEqual(1);
	const save = page.getByRole('button', { name: 'Save note', exact: true });
	await save.scrollIntoViewIfNeeded();
	await expect(save).toBeInViewport();

	// The toolbar's own buttons meet the density touch target, whatever density the profile runs.
	const target = await page.evaluate(() =>
		Number.parseFloat(
			getComputedStyle(document.documentElement).getPropertyValue('--density-touch-target'),
		),
	);
	const box = await page
		.getByRole('toolbar', { name: 'Formatting' })
		.getByRole('button', { name: 'Bold' })
		.boundingBox();
	// The token is in rem, so compare against the root size it resolves at.
	const rootPx = await page.evaluate(() =>
		Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
	);
	expect(box!.height).toBeGreaterThanOrEqual(target * rootPx - 1);
});

test('knowledge polish: player preview reads only shared notes and offers no writes', async ({
	page,
}) => {
	await enterPreview(page, 'player');
	await expect(page.getByText(SEEDED_VISIBLE).first()).toBeVisible();
	await expect(page.getByText(SEEDED_DM_ONLY)).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'New note', exact: true })).toHaveCount(0);
	await expect(page.getByTestId('knowledge-templates-toggle')).toHaveCount(0);
	await axe(page, 'player list');

	await page.getByText(SEEDED_VISIBLE).first().click();
	await expect(page.getByRole('heading', { level: 2, name: SEEDED_VISIBLE })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Push to players' })).toHaveCount(0);
	await axe(page, 'player note');

	const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
	const result = await dispatch(page, {
		type: 'content.create-item',
		actorId,
		payload: { kind: 'note', title: 'Blocked preview write', body: 'Must not persist' },
	});
	expect(result.status).toBe('rejected');
});

test('knowledge polish: an empty vault shows the illustrated empty state', async ({ page }) => {
	await page.evaluate(async () => {
		const rt = window.__rt!;
		const items = Object.values(
			(rt.state.content as { items: Record<string, { id: string; deletedAt: string | null }> })
				.items,
		).filter((item) => item.deletedAt === null);
		for (const item of items) {
			await rt.dispatch({
				type: 'content.remove-item',
				actorId: rt.defaultActorId,
				payload: { itemId: item.id },
			});
		}
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
	await expect(page.getByRole('heading', { name: 'Nothing written down' })).toBeVisible();
	await expect(page.locator('[data-illustration="knowledge-empty"]')).toBeVisible();
	await axe(page, 'empty vault');
});
