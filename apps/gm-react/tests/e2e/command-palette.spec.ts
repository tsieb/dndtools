import { expect, test, type Page } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// COMMAND PALETTE — the ⌘K quick-switcher (app/CommandPalette.tsx on the DS CommandPalette). The
// overlay is the keyboard spine of the seven-section IA: it opens on Meta/Control+K (and from the
// top-bar search trigger), composes static "Go to"/"Create" launchers with the actor-filtered
// entity lists AND live full-text hits from the Processing Core's search engine, NAVIGATES to the
// chosen destination on select, and closes on Escape. These specs drive the real overlay (role
// locators, never test-ids) and assert the router actually moved — the palette's whole reason to
// exist. Every candidate is the actor-filtered read, so nothing dm-only can leak into it.

const PALETTE = { name: 'Command palette' } as const;

/** Open the palette via the keyboard chord and wait for the dialog to mount + take input focus. */
async function openViaKeyboard(page: Page, chord: 'Meta+k' | 'Control+k'): Promise<void> {
	await page.keyboard.press(chord);
	await expect(page.getByRole('dialog', PALETTE)).toBeVisible();
	// The overlay focuses its combobox on open (its a11y contract); typing must land there.
	await expect(page.getByRole('combobox')).toBeFocused();
}

test.describe('command palette: the ⌘K quick-switcher', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/');
		await seedFresh(page);
		await page.goto('/#/', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.locator('#main-content').waitFor({ state: 'attached' });
	});

	test('Meta+K opens the palette and Escape closes it', async ({ page }) => {
		await expect(page.getByRole('dialog', PALETTE)).toHaveCount(0);
		await openViaKeyboard(page, 'Meta+k');

		// The overlay is a real modal dialog with its search input and the footer hint bar.
		await expect(page.getByRole('combobox')).toBeVisible();
		await expect(page.getByText('navigate', { exact: false })).not.toHaveCount(0);

		// Escape (from the focused input) dismisses it and returns to the app.
		await page.keyboard.press('Escape');
		await expect(page.getByRole('dialog', PALETTE)).toHaveCount(0);
	});

	// The shell's global-hotkey handler bails out early when ANY `[aria-modal="true"]` element is
	// mounted, so that a fullscreen editor overlay owns the keyboard. The palette is itself
	// aria-modal — so the guard swallowed the very chord that should dismiss it, and the documented
	// ⌘K *toggle* could only ever open.
	test('Meta+K toggles the palette shut again', async ({ page }) => {
		await openViaKeyboard(page, 'Meta+k');
		await page.keyboard.press('Meta+k');
		await expect(page.getByRole('dialog', PALETTE)).toHaveCount(0);

		// And it still reopens afterwards (the guard must not have been left in a stuck state).
		await openViaKeyboard(page, 'Meta+k');
	});

	// The palette declares aria-modal but its input is the only focusable child, so an untrapped
	// Tab moved focus into the shell behind the scrim.
	test('Tab does not leak focus out of the modal palette', async ({ page }) => {
		await openViaKeyboard(page, 'Meta+k');
		await page.keyboard.press('Tab');
		await expect(page.getByRole('dialog', PALETTE)).toBeVisible();
		await expect(page.getByRole('combobox')).toBeFocused();
	});

	test('Control+K also opens the palette', async ({ page }) => {
		await openViaKeyboard(page, 'Control+k');
		await expect(page.getByRole('dialog', PALETTE)).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page.getByRole('dialog', PALETTE)).toHaveCount(0);
	});

	test('the top-bar search trigger opens the palette', async ({ page }) => {
		// The chrome exposes a real search affordance on every viewport (the top bar's "Search
		// everything…" button, plus the sidebar's ⌘K button on desktop) — clicking it opens the
		// same overlay, never a dead button.
		await page.getByRole('button', { name: /Search/ }).first().click();
		await expect(page.getByRole('dialog', PALETTE)).toBeVisible();
		await expect(page.getByRole('combobox')).toBeFocused();
	});

	test('searching a section destination and selecting it navigates there', async ({ page }) => {
		await openViaKeyboard(page, 'Meta+k');

		// "Go to" launchers are static section destinations. GM Screen is distinctive (→ /board).
		await page.getByRole('combobox').fill('GM Screen');
		const option = page.getByRole('option', { name: 'GM Screen' });
		await expect(option).toBeVisible();
		await option.click();

		// Selecting a result RUNS its command (navigate) and closes the overlay.
		await page.waitForURL((url) => url.hash === '#/board', { timeout: 10_000 });
		await expect(page.getByRole('dialog', PALETTE)).toHaveCount(0);
		await page.locator('#main-content').waitFor({ state: 'attached' });
	});

	test('"Build encounter" opens the encounter dialog instead of just landing on /session', async ({
		page,
	}) => {
		// Every other Create launcher hands its destination an intent the screen consumes on arrival
		// (Characters opens the wizard, Campaign opens the faction editor, Knowledge the composer).
		// This one ran a bare navigate to /session, so the palette advertised an action and performed
		// a plain jump — the DM then had to find the Build-encounter button themselves.
		await openViaKeyboard(page, 'Meta+k');
		await page.getByRole('combobox').fill('Build encounter');
		await page.getByRole('option', { name: 'Build encounter' }).click();

		await page.waitForURL((url) => url.hash === '#/session', { timeout: 10_000 });
		await expect(page.getByRole('dialog', { name: 'Build encounter' })).toBeVisible();
	});

	test('the encounter dialog explains its blocked Start, and its count field can be retyped', async ({
		page,
	}) => {
		await openViaKeyboard(page, 'Meta+k');
		await page.getByRole('combobox').fill('Build encounter');
		await page.getByRole('option', { name: 'Build encounter' }).click();
		const dialog = page.getByRole('dialog', { name: 'Build encounter' });
		await expect(dialog).toBeVisible();

		// Quick-add a monster with the HP field cleared. `Number('') || 0` is 0, so this used to add a
		// combatant with 0 max HP — already Down on arrival — while the very next field sensibly
		// falls back to AC 10.
		const start = dialog.getByRole('button', { name: 'Start combat' });
		await dialog.getByLabel('Quick add', { exact: true }).fill('Bandit');
		await dialog.getByLabel('HP', { exact: true }).fill('');
		await dialog.getByRole('button', { name: 'Add', exact: true }).click();

		const row = dialog.getByLabel('Bandit quantity');
		await expect(row).toBeVisible();
		await expect(dialog.getByText(/Bandit/).first()).toBeVisible();
		await expect(dialog.getByText('0 HP')).toHaveCount(0);

		// The count coerced on every keystroke, so clearing it snapped straight back to 1 and "12"
		// could not be typed over "1". It now holds the raw text and commits on blur.
		await row.fill('');
		await expect(row).toHaveValue('');
		await row.fill('12');
		await row.blur();
		await expect(row).toHaveValue('12');

		// With the roster emptied, the primary used hard `disabled` — which removes the tab stop AND
		// suppresses the tooltip, so the reason it was unavailable had no channel at all.
		const removals = dialog.getByRole('button', { name: /from the draft$/ });
		for (let n = await removals.count(); n > 0; n = await removals.count()) {
			await removals.first().click();
		}
		await expect(start).toHaveAttribute('aria-disabled', 'true');
		await expect(start).toHaveAttribute('title', /combatant/i);
		// Playwright's toBeDisabled() also honours aria-disabled, so assert the DOM property: the
		// point of the soft form is that the button is NOT natively disabled and keeps its tab stop.
		expect(await start.evaluate((el: HTMLButtonElement) => el.disabled)).toBe(false);
		await start.focus();
		await expect(start).toBeFocused();
	});

	test('a full-text hit from the core search engine deep-links the matched note', async ({ page }) => {
		await openViaKeyboard(page, 'Meta+k');

		// Typing runs a REAL actor-filtered search over the seeded vault. "Campaign Primer" is a
		// seeded player-visible note; "primer" occurs only in it, so it is the unambiguous hit.
		await page.getByRole('combobox').fill('Campaign Primer');
		const hit = page.getByRole('option', { name: 'Campaign Primer' });
		await expect(hit).toBeVisible({ timeout: 10_000 });
		await hit.click();

		// A note hit deep-links its own /knowledge/:id viewer (not the list).
		await page.waitForURL((url) => /#\/knowledge\/[^/]+/.test(url.hash), { timeout: 10_000 });
		await expect(page.getByRole('dialog', PALETTE)).toHaveCount(0);
		await expect(page.getByText('Campaign Primer')).not.toHaveCount(0);
	});

	test('a Create action lands on the right screen', async ({ page }) => {
		await openViaKeyboard(page, 'Meta+k');

		// The "Create" launchers open the create flow on the owning screen. "New scene" → /scenes.
		await page.getByRole('combobox').fill('New scene');
		const create = page.getByRole('option', { name: 'New scene' });
		await expect(create).toBeVisible();
		await create.click();

		await page.waitForURL((url) => url.hash === '#/scenes', { timeout: 10_000 });
		await expect(page.getByRole('dialog', PALETTE)).toHaveCount(0);
		await page.locator('#main-content').waitFor({ state: 'attached' });
	});

	test('a query that matches nothing shows the calm empty state', async ({ page }) => {
		await openViaKeyboard(page, 'Meta+k');
		await page.getByRole('combobox').fill('zzzznotarealcommandxyzzy');
		await expect(page.getByText('No matches')).toBeVisible();
	});

	// Settings and Player view live outside the three nav GROUPS (RUN / LIBRARY / PLATFORM) that the
	// "Go to" set was built from, so the jump-anywhere surface silently omitted two of the app's own
	// destinations — typing either name returned "No matches".
	test('Settings is reachable from the palette', async ({ page }) => {
		await openViaKeyboard(page, 'Meta+k');
		await page.getByRole('combobox').fill('Settings');
		const option = page.getByRole('option', { name: 'Settings' }).first();
		await expect(option).toBeVisible();
		await option.click();

		await page.waitForURL((url) => url.hash === '#/settings', { timeout: 10_000 });
		await expect(page.getByRole('dialog', PALETTE)).toHaveCount(0);
	});

	test('Player view is reachable from the palette', async ({ page }) => {
		await openViaKeyboard(page, 'Meta+k');
		await page.getByRole('combobox').fill('Player view');
		const option = page.getByRole('option', { name: 'Player view' }).first();
		await expect(option).toBeVisible();
		await option.click();

		await page.waitForURL((url) => url.hash === '#/player', { timeout: 10_000 });
		await expect(page.getByRole('dialog', PALETTE)).toHaveCount(0);
	});
});
