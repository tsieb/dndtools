import { expect, test, type Locator, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded } from './_helpers';

// RC-ENG-15.2 — IA_REVIEW "Four unlabeled icons". From 1440px the top bar shows Host table,
// Preview as player, Start / End session (and Account, when the cloud is configured — held in
// `TableControls.test.tsx`, since e2e never configures it) with visible labels. Every narrower
// tier shows one labelled Table controls button whose sheet lists the same controls as named rows.

const WIDE = [1600, 1440];
const CONSTRAINED = [1280, 1100, 834, 641, 393];

const header = (page: Page) => page.locator('header').first();
const tableControlsTrigger = (page: Page) =>
	header(page).getByRole('button', { name: 'Table controls', exact: true });
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Table controls' });

/** The three always-present controls, by accessible name, inside `scope`. */
function controls(scope: Locator) {
	return {
		host: scope.getByRole('button', { name: /^Host table/ }),
		preview: scope.getByRole('button', { name: 'Preview as player', exact: true }),
		start: scope.getByRole('button', { name: /^Start session/ }),
	};
}

/** Each control's glyph markup: distinct glyphs are the reinforcement the IA review asks for. */
async function glyphs(locators: Locator[]): Promise<string[]> {
	return Promise.all(locators.map((l) => l.locator('svg').first().innerHTML()));
}

async function at(page: Page, width: number, route = '/screens') {
	await page.setViewportSize({ width, height: 1000 });
	await gotoRoute(page, route);
}

test.beforeEach(async ({ page }) => {
	await markOnboarded(page);
});

for (const width of WIDE) {
	test(`${width}px: the table controls are labelled in the top bar`, async ({ page }) => {
		await at(page, width);
		const { host, preview, start } = controls(header(page));
		await expect(host).toHaveText('Host table');
		await expect(preview).toContainText('Preview as player');
		await expect(start).toHaveText('Start session');
		await expect(tableControlsTrigger(page)).toHaveCount(0);
		await expect(header(page).getByRole('button', { name: 'Help', exact: true })).toBeVisible();
		expect(new Set(await glyphs([host, preview, start])).size).toBe(3);
		// The page title still reads in full beside them.
		const title = header(page).locator('h1');
		expect(await title.evaluate((h) => h.scrollWidth <= h.clientWidth + 1)).toBe(true);
	});
}

for (const width of CONSTRAINED) {
	test(`${width}px: one labelled Table controls sheet with named rows`, async ({ page }) => {
		await at(page, width);
		const top = controls(header(page));
		for (const control of Object.values(top)) await expect(control).toHaveCount(0);
		const trigger = tableControlsTrigger(page);
		await expect(trigger).toBeVisible();
		await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
		// From the rail up the trigger says what it is; a 375px phone bar keeps the named glyph.
		if (width > 640) await expect(trigger).toHaveText('Table controls');
		await expect(header(page).getByRole('button', { name: 'Help', exact: true })).toHaveCount(
			width > 640 ? 1 : 0,
		);

		await trigger.click();
		await expect(sheet(page)).toBeVisible();
		// The open sheet makes the top bar inert, so read the opener's state off the DOM.
		await expect(
			header(page).locator('button[aria-haspopup="dialog"][aria-expanded="true"]'),
		).toHaveCount(1);
		const rows = controls(sheet(page));
		await expect(rows.host).toHaveText('Host table');
		await expect(rows.preview).toContainText('Preview as player');
		await expect(rows.start).toHaveText('Start session');
		expect(new Set(await glyphs([rows.host, rows.preview, rows.start])).size).toBe(3);
		// Rows, not a wrapped cluster of chips: the named controls span the sheet, one under another.
		// Measured in one frame — a phone's bottom sheet is still sliding up when it opens.
		const layout = await sheet(page)
			.locator('.table-controls-sheet')
			.evaluate((list) => {
				const [host, preview] = [...list.querySelectorAll('button')].map((b) =>
					b.getBoundingClientRect(),
				);
				return {
					list: list.getBoundingClientRect().width,
					widths: [host!.width, preview!.width],
					stacked: preview!.top >= host!.bottom - 1,
				};
			});
		for (const width of layout.widths) expect(width).toBeGreaterThan(layout.list - 2);
		expect(layout.stacked).toBe(true);

		await page.keyboard.press('Escape');
		await expect(sheet(page)).toBeHidden();
		await expect(trigger).toBeFocused();
	});
}

/** Open Preview as player from wherever this width keeps it, and pick `role`. */
async function previewAs(page: Page, role: string) {
	if (await tableControlsTrigger(page).isVisible()) await tableControlsTrigger(page).click();
	await page.getByRole('button', { name: 'Preview as player', exact: true }).click();
	await page.getByRole('menuitemradio', { name: role, exact: true }).click();
}

for (const [width, exit] of [
	[1600, 'banner'],
	[1280, 'escape'],
	[834, 'banner'],
	[393, 'escape'],
] as const) {
	test(`${width}px: preview rejects writes and ${exit} exit returns focus to its control`, async ({
		page,
	}) => {
		await at(page, width);
		await previewAs(page, 'Any player');
		await expect(page).toHaveURL(/#\/play$/);
		await expect(page.getByTestId('companion-preview-banner')).toBeVisible();

		// Read-only: the runtime refuses a mutation while previewing, and nothing lands.
		const write = await dispatch(page, {
			type: 'scene.create',
			actorId: await page.evaluate(() => window.__rt!.defaultActorId),
			payload: { name: 'Written during preview', visibility: 'dm-only' },
		});
		expect(write.status).toBe('rejected');
		const landed = await page.evaluate(() =>
			Object.values(window.__rt!.state.scenes.scenes).some(
				(scene) => (scene as { name: string }).name === 'Written during preview',
			),
		);
		expect(landed).toBe(false);

		if (exit === 'banner')
			await page
				.getByTestId('companion-preview-banner')
				.getByRole('button', { name: 'Exit preview' })
				.click();
		else await page.keyboard.press('Escape');
		await expect.poll(() => page.evaluate(() => window.__rt!.preview)).toBeNull();
		await expect(page).toHaveURL(/#\/screens$/);
		// Focus returns to the control the preview was started from, not the top of the document.
		const started =
			width >= 1440
				? header(page).getByRole('button', { name: 'Preview as player', exact: true })
				: tableControlsTrigger(page);
		await expect(started).toBeFocused();
	});
}

test('1280px: a co-DM preview stays in the sheet and blocks Start session', async ({ page }) => {
	await at(page, 1280);
	await previewAs(page, 'Co-DM');
	await expect(page).toHaveURL(/#\/screens$/);
	const rows = sheet(page);
	await expect(rows).toBeVisible();
	const trigger = rows.getByRole('button', { name: 'Previewing as Co-DM' });
	await expect(trigger).toBeFocused();
	const start = rows.getByRole('button', {
		name: 'Start session (unavailable — exit player preview first)',
	});
	await expect(start).toHaveAttribute('aria-disabled', 'true');
	// aria-disabled keeps it focusable with its reason; a press still does nothing.
	await start.click({ force: true });
	expect(await page.evaluate(() => window.__rt!.state.session.workflow)).toBe('idle');
	const write = await dispatch(page, {
		type: 'session.set-workflow',
		actorId: await page.evaluate(() => window.__rt!.defaultActorId),
		payload: { workflow: 'prep' },
	});
	expect(write.status).toBe('rejected');

	// Back to the DM view from the same menu; focus returns to its trigger.
	await trigger.click();
	await rows.getByRole('menuitemradio', { name: 'DM view', exact: true }).click();
	await expect.poll(() => page.evaluate(() => window.__rt!.preview)).toBeNull();
	await expect(rows.getByRole('button', { name: 'Preview as player', exact: true })).toBeFocused();
	await expect(rows.getByRole('button', { name: /^Start session/ })).not.toHaveAttribute(
		'aria-disabled',
		'true',
	);
});

test('1600px: End session is labelled and still asks first', async ({ page }) => {
	await at(page, 1600);
	await controls(header(page)).start.click();
	const end = header(page).getByRole('button', { name: 'End session (live)' });
	await expect(end).toHaveText('End session');
	expect(await page.evaluate(() => window.__rt!.state.session.workflow)).toBe('active');
	await end.click();
	const confirm = page.getByRole('dialog', { name: 'End the live session?' });
	await confirm.getByRole('button', { name: 'Stay live' }).click();
	expect(await page.evaluate(() => window.__rt!.state.session.workflow)).toBe('active');
});

test.describe('table controls in Spanish', () => {
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(() => localStorage.setItem('dndtools:locale', 'es'));
	});

	test('1600px labels and the 1280px sheet', async ({ page }) => {
		await at(page, 1600);
		await expect(page.locator('html')).toHaveAttribute('lang', 'es');
		await expect(header(page).getByRole('button', { name: 'Organizar mesa' })).toHaveText(
			'Organizar mesa',
		);
		await expect(
			header(page).getByRole('button', { name: 'Vista previa como jugador', exact: true }),
		).toBeVisible();
		await expect(header(page).getByRole('button', { name: /^Empezar la sesión/ })).toHaveText(
			'Empezar la sesión',
		);

		await page.setViewportSize({ width: 1280, height: 1000 });
		const trigger = header(page).getByRole('button', { name: 'Controles de la mesa' });
		await trigger.click();
		const sheetEs = page.getByRole('dialog', { name: 'Controles de la mesa' });
		await expect(sheetEs.getByRole('button', { name: 'Organizar mesa' })).toBeVisible();
		await expect(
			sheetEs.getByRole('button', { name: 'Vista previa como jugador', exact: true }),
		).toBeVisible();
		await expect(sheetEs.getByRole('button', { name: /^Empezar la sesión/ })).toBeVisible();
	});
});

test('both GM vocabularies: the preview menu and screen shortcuts follow the active system', async ({
	page,
}) => {
	await at(page, 1600);
	const menu = async () => {
		await header(page).getByRole('button', { name: 'Preview as player', exact: true }).click();
		const items = await page.getByRole('menuitemradio').allTextContents();
		await page.keyboard.press('Escape');
		return items.map((item) => item.trim());
	};
	expect(await menu()).toEqual(expect.arrayContaining(['DM view', 'Co-DM', 'Any player']));
	await expect(page.getByRole('button', { name: /^DM screen/ }).first()).toBeVisible();

	const selected = await dispatch(page, {
		type: 'system.select',
		actorId: await page.evaluate(() => window.__rt!.defaultActorId),
		payload: { packageId: 'builtin:generic', acknowledgeLoss: true },
	});
	expect(selected.status).toBe('accepted');
	await expect.poll(menu).toEqual(expect.arrayContaining(['GM view', 'Co-GM', 'Any player']));
	await expect(page.getByRole('button', { name: /^GM screen/ }).first()).toBeVisible();
	// The label stays the system's word for a participant, never "another role".
	await expect(
		header(page).getByRole('button', { name: 'Preview as player', exact: true }),
	).toBeVisible();
});

test('section vocabulary: Story names its own local navigation', async ({ page }) => {
	await at(page, 1600, '/campaign');
	await expect(page.getByRole('tablist', { name: 'Story sections' })).toBeVisible();
	await expect(page.getByRole('tablist', { name: 'Campaign sections' })).toHaveCount(0);
});

test.describe('section vocabulary: Settings › Vault points at Notes → Sources', () => {
	for (const [locale, title, sources, stale] of [
		['en', 'No sources connected', 'Notes → Sources', 'Knowledge'],
		['es', 'No hay fuentes conectadas', 'Notas → Fuentes', 'Conocimiento'],
	] as const) {
		test(locale, async ({ page }) => {
			if (locale === 'es') {
				await page.addInitScript(() => localStorage.setItem('dndtools:locale', 'es'));
			}
			await at(page, 1600, '/settings?tab=vault');
			await expect(page.locator('html')).toHaveAttribute('lang', locale);
			const main = page.locator('#main-content');
			await expect(main.getByText(sources)).toBeVisible({ timeout: 20_000 });
			await expect(main.getByText(title, { exact: true })).toBeVisible();
			await expect(main.getByText(stale)).toHaveCount(0);
		});
	}
});
