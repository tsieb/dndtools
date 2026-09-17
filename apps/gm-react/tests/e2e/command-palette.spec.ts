import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

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
	// The overlay focuses its combobox on open (its a11y contract); typing must land there. Scoped to
	// the dialog: a tile on the canvas behind it may carry a combobox of its own.
	await expect(page.getByRole('dialog', PALETTE).getByRole('combobox')).toBeFocused();
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
		await page
			.getByRole('button', { name: /Search/ })
			.first()
			.click();
		await expect(page.getByRole('dialog', PALETTE)).toBeVisible();
		await expect(page.getByRole('combobox')).toBeFocused();
	});

	test('searching a section destination and selecting it navigates there', async ({ page }) => {
		await openViaKeyboard(page, 'Meta+k');

		// "Go to" launchers are static section destinations. The GM Screen is distinctive (→ /board); its
		// name follows the system package's vocabulary, so under 5e it reads "DM screen" (RC-SYS-2.6).
		await page.getByRole('combobox').fill('DM screen');
		const option = page.getByRole('option', { name: 'DM screen' });
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

	test('a full-text hit from the core search engine deep-links the matched note', async ({
		page,
	}) => {
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
	// ── RC-KNW-2.3 — command palette v2 ──────────────────────────────────────────────────────────
	// The `>` sigil (the core's own SRCH-005 quick-switcher prefix) narrows the palette to ACTIONS:
	// a DM who typed a verb must never be handed a place instead.
	test('the > prefix lists actions only, never destinations', async ({ page }) => {
		await openViaKeyboard(page, 'Meta+k');

		// Without the sigil, section destinations are offered.
		await expect(page.getByRole('group', { name: 'Go to' })).toBeVisible();

		await page.getByRole('combobox').fill('>');
		// Actions survive: the Create launchers and the core action catalog.
		await expect(page.getByRole('option', { name: 'New note' })).toBeVisible();
		await expect(page.getByRole('group', { name: 'Actions' })).not.toHaveCount(0);
		// Destinations are gone entirely — no "Go to", no scene/character/map rows.
		await expect(page.getByRole('group', { name: 'Go to' })).toHaveCount(0);
		await expect(page.getByRole('group', { name: 'Scenes' })).toHaveCount(0);
		await expect(page.getByRole('group', { name: 'Maps' })).toHaveCount(0);

		// The residual text after the sigil still filters the actions.
		await page.getByRole('combobox').fill('>new note');
		await expect(page.getByRole('option', { name: 'New note' })).toBeVisible();
		await expect(page.getByRole('option', { name: 'New map' })).toHaveCount(0);
	});

	// Contextual actions (RC-CAN-4.3): the actions that belong to the screen the DM is on are
	// promoted to the top of the palette and offered with no query at all. On the hub — which owns
	// no action group — the section is absent rather than empty.
	test('the palette leads with the actions for the current screen', async ({ page }) => {
		await openViaKeyboard(page, 'Meta+k');
		await expect(page.getByRole('group', { name: 'On this screen' })).toHaveCount(0);
		await page.keyboard.press('Escape');

		await page.goto('/#/board', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await openViaKeyboard(page, 'Meta+k');
		const here = page.getByRole('group', { name: 'On this screen' });
		await expect(here).toBeVisible();
		// It is the FIRST group in the list, before Create and Go to. Scoped to the palette: the board
		// behind it has its own groups (Zoom, the widgets), and a page-wide `.first()` only passed while
		// the palette won the race against the board's first render (RC-ENG-4.4, React Router 7).
		const palette = page.getByRole('dialog', PALETTE);
		await expect(palette.getByRole('group').first()).toHaveAttribute(
			'aria-label',
			'On this screen',
		);
		expect(await here.getByRole('option').count()).toBeGreaterThan(0);
	});

	// ── RC-CAN-4.3 — `>board` and `>scene` canvas actions ────────────────────────────────────────
	// On the two canvas routes the palette carries the canvas's own verbs — Toggle edit, Undo, Apply
	// template, Add tile of type… — each firing what the matching toolbar control / key fires. They
	// exist ONLY there: everywhere else those rows are absent, not disabled.
	test('on the GM Screen the palette toggles edit, adds a tile, and undoes', async ({ page }) => {
		await gotoRoute(page, '/board');
		const main = page.locator('#main-content');
		await expect(main.getByRole('button', { name: 'Edit layout' })).toBeVisible();
		const homeTiles = () =>
			page.evaluate(() => {
				const rt = window.__rt!;
				const home = rt.state.commandCenter.homeSceneId!;
				return rt.state.scenes.scenes[home]!.widgets.length;
			});

		await openViaKeyboard(page, 'Meta+k');
		const here = page.getByRole('group', { name: 'On this screen' });
		await page.getByRole('dialog', PALETTE).getByRole('combobox').fill('>scene');
		await expect(page.getByRole('dialog', PALETTE).getByRole('option')).toHaveCount(0);
		await page.getByRole('dialog', PALETTE).getByRole('combobox').fill('>board');
		// Undo is offered but blocked (with its reason) until the layout has a step to take back.
		const undo = here.getByRole('option', { name: /Undo last change/ });
		await expect(undo).toHaveAttribute('aria-disabled', 'true');
		await expect(undo.getByText('Ctrl/⌘+Z')).toBeVisible();
		await here.getByRole('option', { name: /Edit layout/ }).click();
		await expect(page.getByRole('dialog', PALETTE)).toHaveCount(0);
		await expect(main.getByRole('button', { name: 'Done' })).toBeVisible();

		// The toggle's label follows the mode it would leave (the row just run is hoisted into Recent).
		await openViaKeyboard(page, 'Meta+k');
		await expect(
			page.getByRole('dialog', PALETTE).getByRole('option', { name: /Done editing layout/ }),
		).toBeVisible();

		// "Add tile of type…" — behind a query, so a whole library never floods the empty palette.
		const before = await homeTiles();
		await page.getByRole('dialog', PALETTE).getByRole('combobox').fill('>board add tile dice');
		await expect(page.getByRole('group', { name: 'Go to' })).toHaveCount(0);
		await here
			.getByRole('option', { name: /^Add tile: Dice\b/ })
			.first()
			.click();
		await expect.poll(homeTiles).toBe(before + 1);

		// Remove a tile (an undoable step), then take it back from the palette.
		const first = main.locator('[data-testid^="widget-"]').first();
		await first.focus();
		await page.keyboard.press('Delete');
		await expect.poll(homeTiles).toBe(before);
		await openViaKeyboard(page, 'Meta+k');
		const undoNow = here.getByRole('option', { name: /Undo last change/ });
		await expect(undoNow).not.toHaveAttribute('aria-disabled', 'true');
		await expect(undoNow).toContainText(/Removed/);
		await undoNow.click();
		await expect.poll(homeTiles).toBe(before + 1);
	});

	test('on a scene, Add tile targets that scene — not the GM Screen', async ({ page }) => {
		await gotoRoute(page, '/scenes');
		const sceneName = `Palette Scene ${Date.now()}`;
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
		const counts = () =>
			page.evaluate((id) => {
				const rt = window.__rt!;
				const home = rt.state.commandCenter.homeSceneId;
				return {
					scene: rt.state.scenes.scenes[id]!.widgets.length,
					home: home ? (rt.state.scenes.scenes[home]?.widgets.length ?? 0) : 0,
				};
			}, sceneId!);

		await gotoRoute(page, `/scene/${sceneId}`);
		await expect(page.getByRole('button', { name: 'Edit layout' })).toBeVisible();
		const before = await counts();
		await openViaKeyboard(page, 'Meta+k');
		const here = page.getByRole('group', { name: 'On this screen' });
		await expect(here.getByRole('option', { name: /Edit layout/ })).toBeVisible();
		await page.getByRole('combobox').fill('>add tile dice');
		await here
			.getByRole('option', { name: /^Add tile: Dice\b/ })
			.first()
			.click();
		await expect.poll(counts).toEqual({ scene: before.scene + 1, home: before.home });
		// Adding enters edit mode, as a gallery pick does.
		await expect(page.getByRole('button', { name: 'Done' })).toBeVisible();
		await openViaKeyboard(page, 'Meta+k');
		await page
			.getByRole('dialog', PALETTE)
			.getByRole('combobox')
			.fill('>scene apply template combat');
		await here.getByRole('option', { name: /^Apply template: Combat scene/ }).click();
		await expect.poll(async () => (await counts()).scene).toBeGreaterThan(before.scene + 1);
		expect((await counts()).home).toBe(before.home);
	});

	test('the canvas actions are absent off the canvas routes', async ({ page }) => {
		await openViaKeyboard(page, 'Meta+k');
		for (const prefix of ['>board', '>scene']) {
			await page.getByRole('dialog', PALETTE).getByRole('combobox').fill(prefix);
			await expect(page.getByRole('dialog', PALETTE).getByRole('option')).toHaveCount(0);
		}
		await page.getByRole('combobox').fill('>add tile');
		await expect(page.getByRole('option', { name: /^Add tile:/ })).toHaveCount(0);
		await page.getByRole('combobox').fill('>edit layout');
		await expect(page.getByRole('option', { name: /Edit layout/ })).toHaveCount(0);
		await page.getByRole('combobox').fill('>undo last');
		await expect(page.getByRole('option', { name: /Undo last change/ })).toHaveCount(0);
		await page.getByRole('combobox').fill('>apply template');
		await expect(page.getByRole('option', { name: /^Apply template:/ })).toHaveCount(0);
	});

	// A row that fires the same thing a documented key chord fires prints that chord, straight from
	// app/shortcuts/registry.ts — the palette teaches the keyboard instead of hiding it.
	test('an action row prints the keyboard shortcut that also fires it', async ({ page }) => {
		await openViaKeyboard(page, 'Meta+k');
		await page.getByRole('combobox').fill('scene card');
		const row = page.getByRole('option', { name: /Show the next scene card/ });
		await expect(row).toBeVisible();
		await expect(row.getByText('Ctrl/⌘+→')).toBeVisible();
	});

	// Recent on empty: the palette opens on what the DM keeps reaching for, so the second use of a
	// command is one keystroke rather than a re-typed query.
	test('a command that was just run comes back under Recent', async ({ page }) => {
		await openViaKeyboard(page, 'Meta+k');
		await page.getByRole('combobox').fill('New scene');
		await page.getByRole('option', { name: 'New scene' }).click();
		await page.waitForURL((url) => url.hash === '#/scenes', { timeout: 10_000 });

		await openViaKeyboard(page, 'Meta+k');
		const recent = page.getByRole('group', { name: 'Recent' });
		await expect(recent).toBeVisible();
		await expect(recent.getByRole('option', { name: 'New scene' })).toBeVisible();
	});

	// The DM's landing surface contained NO heading of any level: the 23px hero was a styled <div>
	// and the four section labels (Scenes / Create / Manage / Library) were styled <span>s, so a
	// screen-reader user could not navigate `/` by heading or rotor and the groupings were conveyed
	// by typography alone (WCAG 1.3.1 / 2.4.6). Every sibling surface already emits real headings.
	test('the hub is navigable by heading', async ({ page }) => {
		const main = page.locator('#main-content');
		// AppShell owns the route <h1>; the hub's own hero and section labels are <h2>s under it.
		await expect(main.getByRole('heading', { level: 2, name: 'Your campaign' })).toBeVisible();
		for (const label of ['Scenes', 'Create', 'Manage']) {
			await expect(main.getByRole('heading', { level: 2, name: label, exact: true })).toHaveCount(
				1,
			);
		}
	});
});
