import { expect, test, type Page } from '@playwright/test';
import {
	dispatch,
	enterPreview,
	exitPreview,
	gotoRoute,
	markOnboarded,
	ops,
	seedFresh,
	waitReady,
} from './_helpers';

// SCENE CARDS — I11 S11.2 atmosphere scene cards against the live Processing Core. The DM authoring
// surface (SceneCardsPanel, embedded in ScenesCreator at `/scenes`) creates/queues/activates cards
// through the `scene-card.*` command choke point; visibility is decided in the DATA LAYER
// (`listSceneCardsForActor` / `getActiveSceneCardForActor`), so the player-facing reads fail closed —
// a `dm-only` card never reaches the player banner (`/play`) or the chrome-less display (`/display`).
// Prerequisite cards are seeded through the dispatch choke point; the behavior under test (author,
// push, queue-advance, preview-filter) is driven through the REAL UI and asserted against `__rt.state`
// AND what a real participant sees.

/** Loose scene-card shape read off `__rt.state.session.sceneCards.cards` (raw, NOT actor-filtered). */
interface SceneCardLite {
	id: string;
	title: string;
	visibility: string;
	mood: string;
	flavorText: string;
	deletedAt: string | null;
}

function findCard(page: Page, title: string): Promise<SceneCardLite | null> {
	return page.evaluate((t) => {
		const cards = (
			window.__rt!.state.session as { sceneCards: { cards: Record<string, SceneCardLite> } }
		).sceneCards.cards;
		return Object.values(cards).find((c) => c.title === t) ?? null;
	}, title);
}

/** The active card id off the raw slice (what `/display` and the DM control surface project). */
function activeCardId(page: Page): Promise<string | null> {
	return page.evaluate(
		() =>
			(window.__rt!.state.session as { sceneCards: { activeCardId: string | null } }).sceneCards
				.activeCardId,
	);
}

/** The durable push history, oldest→newest, as card ids (the S11.2.4 push record order). */
function pushHistoryCardIds(page: Page): Promise<string[]> {
	return page.evaluate(() =>
		(
			window.__rt!.state.session as { sceneCards: { pushHistory: Array<{ cardId: string }> } }
		).sceneCards.pushHistory.map((r) => r.cardId),
	);
}

/** The DM-facing queue, in play order, as card ids. */
function queueCardIds(page: Page): Promise<string[]> {
	return page.evaluate(
		() => (window.__rt!.state.session as { sceneCards: { queue: string[] } }).sceneCards.queue,
	);
}

/** Seed a prerequisite scene card through the command choke point; returns its id (post-persist). */
async function createCardViaCore(
	page: Page,
	opts: {
		title: string;
		visibility: 'dm-only' | 'player-visible';
		mood?: string;
		flavorText?: string;
	},
): Promise<string> {
	const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
	const result = await dispatch(page, {
		type: 'scene-card.create',
		actorId,
		payload: {
			title: opts.title,
			mood: opts.mood ?? 'exploration',
			flavorText: opts.flavorText ?? '',
			visibility: opts.visibility,
			heroImage: null,
		},
	});
	expect(result.status).toBe('accepted');
	const created = (result.events ?? []).find((e) => e.kind === 'scene-card.created');
	const id = created?.cardId;
	expect(typeof id).toBe('string');
	return id as string;
}

/** Activate a card onto the display (a player-visible activation records a push) — post-persist. */
async function activateViaCore(page: Page, cardId: string | null): Promise<void> {
	const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
	const result = await dispatch(page, {
		type: 'scene-card.activate',
		actorId,
		payload: { cardId },
	});
	expect(result.status).toBe('accepted');
}

/** `/play` and `/display` are chrome-less (mount OUTSIDE the DM AppShell → no `#main-content`), so the
 *  shared `waitReady` cannot gate on that landmark. Wait on the DEV runtime seam + a route-local signal. */
async function waitRuntime(page: Page): Promise<void> {
	await page.waitForFunction(() => !!window.__rt && window.__rt.loaded === true, null, {
		timeout: 20_000,
	});
}

test.describe('scene cards: atmosphere authoring, push, and display', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/scenes');
		await seedFresh(page);
		await page.goto('/#/scenes', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.locator('#main-content').waitFor({ state: 'attached' });
	});

	test('the in-window scene display behaves as a keyboard modal and restores its launcher focus', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 360, height: 360 });
		const launcher = page.getByRole('button', { name: /Search/ }).first();
		await launcher.focus();
		await expect(launcher).toBeFocused();

		await page.keyboard.press('Control+Shift+S');
		const display = page.getByRole('dialog', { name: 'Scene display' });
		await expect(display).toBeVisible();
		await expect
			.poll(() => display.evaluate((overlay) => overlay.contains(document.activeElement)))
			.toBe(true);

		// At this short, keyboard-like viewport height Tab must cycle through only the display's
		// controls, never reaching the obscured shell behind it.
		for (let index = 0; index < 6; index += 1) {
			await page.keyboard.press('Tab');
			await expect
				.poll(() => display.evaluate((overlay) => overlay.contains(document.activeElement)))
				.toBe(true);
		}
		await page.keyboard.press('Shift+Tab');
		await expect
			.poll(() => display.evaluate((overlay) => overlay.contains(document.activeElement)))
			.toBe(true);

		await page.keyboard.press('Escape');
		await expect(display).toBeHidden();
		await expect(launcher).toBeFocused();
	});

	test('the composer authors a player-visible scene card that survives reload', async ({
		page,
	}) => {
		// A fresh vault seeds no scene cards.
		await expect(
			page.getByText('No scene cards yet. Create one to set the scene at the table.'),
		).not.toHaveCount(0);

		const title = `The Gates of Barovia ${Date.now()}`;
		const before = await ops(page);

		// Real UI: fill the New scene card form and set it player-visible (the visibility select is
		// scoped by its own control id — the page also carries a New scene form with a "Visibility" label).
		await page.getByLabel('Title', { exact: true }).fill(title);
		await page
			.getByLabel('Flavor text')
			.fill('Mist coils between the iron spikes of the outer gate.');
		await page.locator('#card-visibility').selectOption('player-visible');
		await page.getByRole('button', { name: 'Create scene card' }).click();

		// The create handler AWAITS the dispatch (which resolves only after persistFullState) before it
		// clears the form — the emptied title input is the post-persist barrier, safe to reload against.
		await expect(page.getByLabel('Title', { exact: true })).toHaveValue('', { timeout: 10_000 });

		const card = await findCard(page, title);
		expect(card?.visibility).toBe('player-visible');
		expect(card?.deletedAt).toBeNull();
		expect(await ops(page)).toBeGreaterThan(before);

		// The card renders in the DM's Cards list with its player-visible badge.
		await expect(page.getByText(title)).not.toHaveCount(0);
		await expect(page.getByText('Cards · 1')).not.toHaveCount(0);
		await expect(page.getByText('Players', { exact: true })).not.toHaveCount(0);

		// Reload-persistence: the create was a durable op-log transaction.
		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitReady(page);
		expect((await findCard(page, title))?.id).toBe(card!.id);
		await expect(page.getByText(title)).not.toHaveCount(0);
	});

	test('the queue plays cards onto the display in order as the DM advances', async ({ page }) => {
		const stamp = Date.now();
		const first = `Harbor at Dusk ${stamp}`;
		const second = `The Drowned Vault ${stamp}`;
		const firstId = await createCardViaCore(page, { title: first, visibility: 'player-visible' });
		const secondId = await createCardViaCore(page, { title: second, visibility: 'player-visible' });

		// Real UI: queue both cards (the row's Queue affordance is labelled per card).
		await page.getByRole('button', { name: `Queue ${first}` }).click();
		await page.getByRole('button', { name: `Queue ${second}` }).click();
		await expect(page.getByText('Queue · 2')).not.toHaveCount(0);
		expect(await queueCardIds(page)).toEqual([firstId, secondId]);

		// Next card plays the queue head onto the display, then the next — in order.
		await page.getByRole('button', { name: 'Next card' }).click();
		await page.waitForFunction(
			(id) =>
				(window.__rt!.state.session as { sceneCards: { activeCardId: string | null } }).sceneCards
					.activeCardId === id,
			firstId,
			{ timeout: 10_000 },
		);
		await expect(page.getByText('On display')).not.toHaveCount(0);
		expect(await queueCardIds(page)).toEqual([secondId]);

		await page.getByRole('button', { name: 'Next card' }).click();
		await page.waitForFunction(
			(id) =>
				(window.__rt!.state.session as { sceneCards: { activeCardId: string | null } }).sceneCards
					.activeCardId === id,
			secondId,
			{ timeout: 10_000 },
		);
		expect(await queueCardIds(page)).toEqual([]);
		expect(await activeCardId(page)).toBe(secondId);

		// `scene-card.advance` POPS the queue head, so playing the LAST queued card empties the queue —
		// and "Next card" used to hard-`disable` itself at exactly that moment, under the finger of the
		// DM who had just pressed it. Focus fell to <body> and the next Tab restarted at the skip link,
		// on the control a DM presses most during play. Soft-disabled: still a tab stop, still named,
		// still explains itself, and the press is swallowed rather than dispatching a doomed command.
		const next = page.getByRole('button', { name: 'Next card' });
		await expect(next).toHaveAttribute('aria-disabled', 'true');
		await expect(next).toHaveAttribute('title', /Queue a scene card first/i);
		expect(await next.evaluate((el: HTMLButtonElement) => el.disabled)).toBe(false);
		// Playwright refuses to .click() an aria-disabled target, so drive the DOM event directly to
		// prove the handler really is swallowed rather than merely unreachable.
		await next.dispatchEvent('click');
		await page.waitForTimeout(200);
		expect(await activeCardId(page)).toBe(secondId);
		// ⚠️ The state assertion above passes for BOTH a swallowed press and a REJECTED dispatch — a
		// refusal also leaves `activeCardId` alone. It did in fact dispatch: `aria-disabled` on a DS
		// Button only swallows `aria-disabled={true}`, and this call site passed a bare
		// `onClick={onAdvance}`, so a deliberate press on a control that says it is unavailable
		// answered with `scene-card.advance`'s "The scene queue is empty." in a red toast. The
		// handler is now guarded; this is the assertion that can tell the two apart.
		await expect(page.getByText('The scene queue is empty.')).toHaveCount(0);
	});

	test('a queued card’s Queue button is inert, not a source of raw-id error toasts', async ({
		page,
	}) => {
		const title = `Cellar Door ${Date.now()}`;
		const id = await createCardViaCore(page, { title, visibility: 'player-visible' });

		// Queue it once through the real UI.
		await page.getByRole('button', { name: `Queue ${title}` }).click();
		await expect
			.poll(async () => (await queueCardIds(page)).includes(id), { timeout: 10_000 })
			.toBe(true);

		// The control now names the state instead of the action and soft-disables — it stays a tab
		// stop so its explanation is reachable, which is the whole point of the soft form.
		const queued = page.getByRole('button', { name: `${title} is queued` });
		await expect(queued).toHaveAttribute('aria-disabled', 'true');
		expect(await queued.evaluate((el: HTMLButtonElement) => el.disabled)).toBe(false);

		// A press must be swallowed. Unguarded it reached `scene-card.enqueue`, which rejects with the
		// literal `Scene card <uuid> is already queued.` — a raw internal id rendered into a
		// user-facing error toast, on a button whose own name already says it is queued.
		await queued.dispatchEvent('click');
		await page.waitForTimeout(200);
		await expect(page.getByText(/is already queued\./)).toHaveCount(0);
		await expect(page.getByText(id, { exact: false })).toHaveCount(0);
		expect((await queueCardIds(page)).filter((q) => q === id)).toHaveLength(1);
	});

	test('preview-as-player filters dm-only cards out of the scene-card list', async ({ page }) => {
		const stamp = Date.now();
		const shared = `Torchlit Approach ${stamp}`;
		const secret = `The Turncoat’s Signal ${stamp}`;
		await createCardViaCore(page, { title: shared, visibility: 'player-visible' });
		await createCardViaCore(page, { title: secret, visibility: 'dm-only' });

		// The DM sees both cards (the authoring surface is unfiltered for the owner).
		await expect(page.getByText(shared)).not.toHaveCount(0);
		await expect(page.getByText(secret)).not.toHaveCount(0);

		// A player preview reads the SAME actor-filtered list a participant gets: only the player-visible
		// card survives; the dm-only card is indistinguishable from one that does not exist (no leak).
		await enterPreview(page, 'player');
		await expect(page.locator('#main-content').getByText(shared)).not.toHaveCount(0);
		await expect(page.locator('#main-content').getByText(secret)).toHaveCount(0);
		await exitPreview(page);

		// Back to the DM's own view, the dm-only card returns.
		await expect(page.getByText(secret)).not.toHaveCount(0);
	});

	test('the Show button pushes a player-visible card and records a durable push', async ({
		page,
	}) => {
		const title = `Whispers in the Crypt ${Date.now()}`;
		const cardId = await createCardViaCore(page, { title, visibility: 'player-visible' });
		expect(await pushHistoryCardIds(page)).toEqual([]);

		// Real UI: activating a player-visible card onto the display records a push (S11.2.4).
		await page.getByRole('button', { name: 'Show', exact: true }).click();
		await page.waitForFunction(
			(id) =>
				(window.__rt!.state.session as { sceneCards: { activeCardId: string | null } }).sceneCards
					.activeCardId === id,
			cardId,
			{ timeout: 10_000 },
		);

		expect(await activeCardId(page)).toBe(cardId);
		expect(await pushHistoryCardIds(page)).toEqual([cardId]);
		await expect(page.getByText('On display')).not.toHaveCount(0);
	});

	test('the player banner shows the active player-visible card and never a dm-only card', async ({
		page,
	}) => {
		const stamp = Date.now();
		const shared = `The Beacon Fires ${stamp}`;
		const secret = `The Assassin Waits ${stamp}`;
		const sharedId = await createCardViaCore(page, { title: shared, visibility: 'player-visible' });
		const secretId = await createCardViaCore(page, { title: secret, visibility: 'dm-only' });

		// The `/play` player device renders the actor-filtered view-model (buildPlayerData for the player
		// actor), so its scene banner IS the S11.2.4 push a real player receives — the same runtime.
		await page.goto('/#/play', { waitUntil: 'domcontentloaded' });
		await waitRuntime(page);
		await expect(page.getByRole('heading', { name: 'Now playing' })).toBeVisible();

		// Push the player-visible card: the hero banner announces it (aria-live, "Now on scene").
		await activateViaCore(page, sharedId);
		await expect(page.getByText(/Now on scene/)).toBeVisible({ timeout: 10_000 });
		await expect(page.getByText(shared)).not.toHaveCount(0);

		// Now put a DM-ONLY card on the display: the player's actor-filtered read returns null, so the
		// banner disappears entirely — a dm-only card never reaches the player device.
		await activateViaCore(page, secretId);
		await expect(page.getByText(/Now on scene/)).toHaveCount(0);
		await expect(page.getByText(secret)).toHaveCount(0);
	});

	// The push banner auto-dismisses after 5s. With no way to hold it open that is a WCAG 2.2.1
	// time limit on reading, and because the Dismiss button lives INSIDE the region that unmounts,
	// a player who tabbed to it and paused to read had the banner vanish and focus fall to <body>.
	test('the scene push banner holds while it is hovered or focused, then resumes', async ({
		page,
	}) => {
		const title = `The Tide Turns ${Date.now()}`;
		const cardId = await createCardViaCore(page, { title, visibility: 'player-visible' });

		await page.goto('/#/play', { waitUntil: 'domcontentloaded' });
		await waitRuntime(page);
		await expect(page.getByRole('heading', { name: 'Now playing' })).toBeVisible();

		const banner = page.getByTestId('scene-banner');
		await activateViaCore(page, cardId);
		await expect(banner).toBeVisible({ timeout: 10_000 });

		// Hovering holds it well past the 5s auto-dismiss.
		await banner.hover();
		await page.waitForTimeout(6_000);
		await expect(banner).toBeVisible();

		// Keyboard focus holds it too — and the Dismiss button keeps focus instead of being yanked
		// out from under the player.
		const dismiss = page.getByRole('button', { name: 'Dismiss scene banner' });
		await dismiss.focus();
		await page.mouse.move(0, 0);
		await page.waitForTimeout(6_000);
		await expect(banner).toBeVisible();
		await expect(dismiss).toBeFocused();

		// Releasing both restarts the countdown and the banner retires on its own.
		await page.locator('#player-main').click({ position: { x: 5, y: 5 } });
		await expect(banner).toHaveCount(0, { timeout: 10_000 });
	});

	test('the chrome-less /display route mounts and shows the active card, then idles when cleared', async ({
		page,
	}) => {
		const title = `The Ninth Bell Tolls ${Date.now()}`;
		const flavor = 'A cold wind carries the sound of a bell that no longer hangs.';
		const cardId = await createCardViaCore(page, {
			title,
			visibility: 'player-visible',
			flavorText: flavor,
		});
		await activateViaCore(page, cardId);

		// The second-screen display is chrome-less; it falls back to this window's loaded runtime state.
		await page.goto('/#/display', { waitUntil: 'domcontentloaded' });
		await waitRuntime(page);
		await page.locator('.scene-display').first().waitFor({ state: 'attached', timeout: 20_000 });

		// The active card fills the surface: title (as the display heading) + flavor.
		await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 10_000 });
		await expect(page.getByText(flavor)).toBeVisible();

		// Clearing the display (activate null) returns the surface to its honest idle state.
		await activateViaCore(page, null);
		await expect(page.getByText('No scene on display')).toBeVisible({ timeout: 10_000 });
	});

	test('scene history preserves push order across multiple pushes', async ({ page }) => {
		const stamp = Date.now();
		const a = `Landfall ${stamp}`;
		const b = `The Sunken Stair ${stamp}`;
		const c = `The Hollow Throne ${stamp}`;
		const idA = await createCardViaCore(page, { title: a, visibility: 'player-visible' });
		const idB = await createCardViaCore(page, { title: b, visibility: 'player-visible' });
		const idC = await createCardViaCore(page, { title: c, visibility: 'player-visible' });

		// Push in order A → B → C. Each player-visible activation appends one durable push record.
		await activateViaCore(page, idA);
		await activateViaCore(page, idB);
		await activateViaCore(page, idC);
		expect(await pushHistoryCardIds(page)).toEqual([idA, idB, idC]);

		// The player's reviewable Scene history lists every push newest-first.
		await page.goto('/#/play', { waitUntil: 'domcontentloaded' });
		await waitRuntime(page);
		await expect(page.getByRole('heading', { name: 'Now playing' })).toBeVisible();
		await page.getByRole('button', { name: 'Journal' }).click();
		await expect(page.getByText('Scene history (3)')).toBeVisible({ timeout: 10_000 });

		// Rendered order is newest → oldest (the panel reverses the oldest-first history): C above B above A.
		// Scope to <main>: the active card (C) also appears in the live banner (role=status) above it.
		const main = page.getByRole('main');
		const yC = (await main.getByText(c, { exact: true }).boundingBox())!.y;
		const yB = (await main.getByText(b, { exact: true }).boundingBox())!.y;
		const yA = (await main.getByText(a, { exact: true }).boundingBox())!.y;
		expect(yC).toBeLessThan(yB);
		expect(yB).toBeLessThan(yA);
	});
	test('queue reorder buttons disable at the list boundaries instead of dead-clicking', async ({
		page,
	}) => {
		const stamp = Date.now();
		const first = `Windward Keep ${stamp}`;
		const second = `The Old Mill ${stamp}`;
		await createCardViaCore(page, { title: first, visibility: 'player-visible' });
		await createCardViaCore(page, { title: second, visibility: 'player-visible' });
		await page.getByRole('button', { name: `Queue ${first}` }).click();
		await page.getByRole('button', { name: `Queue ${second}` }).click();
		await expect(page.getByText('Queue · 2')).not.toHaveCount(0);

		// The head can only move down, the tail can only move up — the no-op directions are
		// disabled affordances, not silent dead clicks.
		await expect(page.getByRole('button', { name: `Move ${first} up` })).toBeDisabled();
		await expect(page.getByRole('button', { name: `Move ${first} down` })).toBeEnabled();
		await expect(page.getByRole('button', { name: `Move ${second} up` })).toBeEnabled();
		await expect(page.getByRole('button', { name: `Move ${second} down` })).toBeDisabled();

		// The enabled direction still reorders, and the disabled edges follow the new order.
		await page.getByRole('button', { name: `Move ${second} up` }).click();
		await expect(page.getByRole('button', { name: `Move ${second} up` })).toBeDisabled();
		await expect(page.getByRole('button', { name: `Move ${first} down` })).toBeDisabled();

		// …and having just disabled the button under the keyboard, focus must land on the surviving
		// arrow of the SAME card rather than falling to <body> (WCAG 2.4.3). Before this, a keyboard
		// DM lost their place in the queue on every move that reached an end of the list.
		await expect(page.getByRole('button', { name: `Move ${second} down` })).toBeFocused();
	});

	test('reordering a card mid-queue keeps focus on the arrow that was pressed', async ({
		page,
	}) => {
		const stamp = Date.now();
		const titles = [`Aerie ${stamp}`, `Bramble ${stamp}`, `Cellar ${stamp}`];
		for (const title of titles) {
			await createCardViaCore(page, { title, visibility: 'player-visible' });
			await page.getByRole('button', { name: `Queue ${title}` }).click();
		}
		await expect(page.getByText('Queue · 3')).not.toHaveCount(0);

		// The tail moves up into the middle, where BOTH arrows stay enabled — so focus should stay on
		// the very same "up" arrow, ready for a second press.
		const up = page.getByRole('button', { name: `Move ${titles[2]} up` });
		await up.click();
		await expect(up).toBeFocused();
		// Pressing again is what the restored focus buys: it walks to the head of the queue.
		await page.keyboard.press('Enter');
		await expect(page.getByRole('button', { name: `Move ${titles[2]} up` })).toBeDisabled();
		await expect(page.getByRole('button', { name: `Move ${titles[2]} down` })).toBeFocused();
	});
});
