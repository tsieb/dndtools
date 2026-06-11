import { expect, test, type Page } from '@playwright/test';

/**
 * UX-SESSION-lifecycle-recovery-and-hotpath-combat-shell — the focused Session route:
 *
 * - UX-SES-001: lifecycle affordances on the session tools (Pause in the tracker header, the
 *   inline state-gate message + Command Center link, the auto-recap Prep/Recap mode + CTA).
 * - UX-SES-002: restart-during-live-session recovery — full-restore confirmation vs. the MODAL
 *   partial-restore prompt that names the missing item(s) and locks the tools.
 * - UX-SES-003: combatant row anatomy / glanceability, defeated treatment + ordering, and the
 *   hidden-combatant NO-LEAK guarantee on a player client.
 * - UX-SES-004: unmistakable current-turn emphasis (3+ dimensions, aria-current, scroll-into-view)
 *   including the placeholder-only treatment for a hidden active combatant on a player client.
 * - UX-SES-006: 1-action turn advance/revert (buttons + Space / Shift+Space / N / P), round-wrap
 *   toast, touch-target sizing.
 * - UX-SES-017: the async action model — HP undo toast (inverse command) and roll-failure Retry.
 *
 * Several scenarios hand-craft persisted session state through IndexedDB (the same storage the
 * runtime restores from) because they exercise RESTART semantics (recovery, hidden combatants):
 * the app is then reloaded so the state flows through the real load path.
 */

const MARKER = 'DMSECRETSES9X';

async function resetApp(page: Page): Promise<void> {
	await page.goto('/session/');
	await page.getByTestId('session-view').waitFor({ state: 'visible' });
	await page.evaluate(async () => {
		await indexedDB.deleteDatabase('dndtools-v2');
	});
	await page.reload();
	await page.getByTestId('session-view').waitFor({ state: 'visible' });
}

/** Poll the persisted session document until `predicate` holds (avoids racing the durable write). */
async function waitForPersistedSession(
	page: Page,
	predicateBody: string,
): Promise<void> {
	await page.waitForFunction(async (body) => {
		const doc = await new Promise<{ doc?: Record<string, unknown> } | undefined>((resolve) => {
			const open = indexedDB.open('dndtools-v2');
			open.onsuccess = () => {
				try {
					const tx = open.result.transaction('documents', 'readonly');
					const get = tx.objectStore('documents').get('session-state');
					get.onsuccess = () => resolve(get.result);
					get.onerror = () => resolve(undefined);
				} catch {
					resolve(undefined);
				}
			};
			open.onerror = () => resolve(undefined);
		});
		if (!doc?.doc) return false;
		 
		return new Function('doc', `return (${body});`)(doc.doc) === true;
	}, predicateBody);
}

/** Apply a mutation to the persisted session-state document (restart-scenario state surgery). */
async function mutatePersistedSession(page: Page, mutatorBody: string): Promise<void> {
	await page.evaluate(async (body) => {
		await new Promise<void>((resolve, reject) => {
			const open = indexedDB.open('dndtools-v2');
			open.onsuccess = () => {
				const db = open.result;
				const tx = db.transaction('documents', 'readwrite');
				const store = tx.objectStore('documents');
				const get = store.get('session-state');
				get.onsuccess = () => {
					const record = get.result as { key: string; doc: Record<string, unknown> };
					 
					new Function('doc', body)(record.doc);
					store.put(record);
				};
				tx.oncomplete = () => resolve();
				tx.onerror = () => reject(tx.error);
			};
			open.onerror = () => reject(open.error);
		});
	}, mutatorBody);
}

/** Start an active session from the home workflow toolbar and land on /session. */
async function startActiveSession(page: Page): Promise<void> {
	await page.goto('/');
	await page.getByTestId('command-center').waitFor({ state: 'visible' });
	await page.getByTestId('session-workflow-active').click();
	await expect(page.getByTestId('session-workflow-status')).toContainText('active');
	await waitForPersistedSession(page, `doc.workflow === 'active'`);
	await page.goto('/session/');
	await page.getByTestId('session-view').waitFor({ state: 'visible' });
}

/** Dismiss the (non-blocking) full-restore confirmation if it is showing. */
async function dismissRestoredBanner(page: Page): Promise<void> {
	const banner = page.getByTestId('ses-recovery-restored');
	if ((await banner.count()) > 0 && (await banner.isVisible())) {
		await page.getByTestId('ses-recovery-continue').click();
		await expect(banner).toHaveCount(0);
	}
}

async function clickInView(page: Page, testId: string): Promise<void> {
	const locator = page.getByTestId(testId);
	await locator.scrollIntoViewIfNeeded();
	await locator.click();
}

/** Build an encounter of named monsters (name, hp) and start combat from it. */
async function startCombat(
	page: Page,
	title: string,
	monsters: Array<{ name: string; hp: number; qty?: number }>,
): Promise<void> {
	await page.getByTestId('encounter-title').fill(title);
	for (const monster of monsters) {
		await page.getByTestId('combatant-name-input').fill(monster.name);
		await page.getByTestId('combatant-cr-input').fill('0.25');
		await page.getByTestId('combatant-qty-input').fill(String(monster.qty ?? 1));
		await page.getByTestId('combatant-hp-input').fill(String(monster.hp));
		await clickInView(page, 'add-combatant');
	}
	await clickInView(page, 'build-encounter');
	await expect(page.getByTestId('encounter-list')).toContainText(title);
	await page.getByTestId('start-encounter-select').selectOption({ index: 1 });
	await clickInView(page, 'start-combat');
	await expect(page.getByTestId('combat-round')).toContainText('Round 1');
	await waitForPersistedSession(page, `doc.combat && doc.combat.status === 'running'`);
}

test.describe('UX-SES lifecycle, recovery, and hot-path combat shell', () => {
	test.beforeEach(async ({ page }) => {
		await resetApp(page);
	});

	test('UX-SES-001 — state-gated tools link to the Command Center; Pause lives in the tracker header', async ({
		page,
	}) => {
		// Idle session: the dice panel shows the inline state-gate message with a DIRECT link (AC2).
		const diceGate = page.getByTestId('dice-needs-active-session');
		await expect(diceGate).toBeVisible();
		await expect(diceGate).toContainText('Available when the session is active');
		await expect(page.getByTestId('dice-needs-active-session-link')).toHaveAttribute('href', '/');
		// The combat tool carries the same gate.
		await expect(page.getByTestId('combat-needs-active-session')).toBeVisible();

		// Active session: the gates clear and "Pause session" is visible in the tracker header
		// WITHOUT scrolling (AC1) — even before combat starts.
		await startActiveSession(page);
		await dismissRestoredBanner(page);
		await expect(page.getByTestId('dice-needs-active-session')).toHaveCount(0);
		const pause = page.getByTestId('combat-pause-session');
		await expect(pause).toBeVisible();
		await expect(pause).toHaveAttribute('aria-label', 'Pause session');

		// Pausing from the tracker header re-gates the session tools (same core command as the
		// Command Center phase controls).
		await pause.click();
		await expect(page.getByTestId('dice-needs-active-session')).toBeVisible();
		await expect(page.getByTestId('roll-dice')).toBeDisabled();
	});

	test('UX-SES-001 AC3 — reaching recap auto-switches the Prep/Recap panel and surfaces the CTA', async ({
		page,
	}) => {
		// Walk the lifecycle to recap from the home toolbar: active → ending → recap.
		await page.goto('/');
		await page.getByTestId('command-center').waitFor({ state: 'visible' });
		await page.getByTestId('session-workflow-active').click();
		await page.getByTestId('session-workflow-ending').click();
		await page.getByTestId('session-workflow-recap').click();
		await expect(page.getByTestId('session-workflow-status')).toContainText('recap');
		await waitForPersistedSession(page, `doc.workflow === 'recap'`);

		await page.goto('/session/');
		await page.getByTestId('session-view').waitFor({ state: 'visible' });
		// The digest mode switched to recap automatically and the CTA is visible.
		await expect(page.getByTestId('digest-mode-select')).toHaveValue('recap');
		const cta = page.getByTestId('create-recap-notes');
		await cta.scrollIntoViewIfNeeded();
		await expect(cta).toBeVisible();
		await cta.click();
		await expect(page.getByTestId('recap-notes-created')).toBeVisible();
	});

	test('UX-SES-002 — full restore: a restart during an active session confirms within the load, non-blocking', async ({
		page,
	}) => {
		await startActiveSession(page);
		await dismissRestoredBanner(page);
		await startCombat(page, 'Restorable', [
			{ name: 'Goblin', hp: 7 },
			{ name: 'Ogre', hp: 30 },
		]);

		// "App restart": a hard reload re-hydrates from storage (AC1 — restored within load).
		await page.reload();
		await page.getByTestId('session-view').waitFor({ state: 'visible' });
		const banner = page.getByTestId('ses-recovery-restored');
		await expect(banner).toBeVisible();
		await expect(page.getByTestId('ses-recovery-summary')).toContainText('Round 1');
		// Full restore is non-blocking: the dice tool stays interactive (AC1 either/or arm).
		await expect(page.getByTestId('roll-dice')).toBeEnabled();
		// Details list the restored state; Continue dismisses for this launch.
		await page.getByTestId('ses-recovery-details-trigger').click();
		await expect(page.getByTestId('ses-recovery-restored-items')).toContainText('Combat — round 1');
		await page.getByTestId('ses-recovery-continue').click();
		await expect(banner).toHaveCount(0);
	});

	test('UX-SES-002 AC2/AC3 — partial restore locks the tools and names the missing item', async ({
		page,
	}) => {
		await startActiveSession(page);
		await dismissRestoredBanner(page);
		await startCombat(page, 'Fragile', [
			{ name: 'Goblin', hp: 7 },
			{ name: 'Ogre', hp: 30 },
		]);

		// Corrupt the persisted state: the first combatant record in the order goes missing.
		await mutatePersistedSession(
			page,
			`const id = doc.combat.order[0]; delete doc.combat.combatants[id];`,
		);
		await page.reload();
		await page.getByTestId('session-view').waitFor({ state: 'visible' });

		// The MODAL recovery prompt appears (within the load — well under 3 s) and names the item.
		const dialog = page.getByTestId('ses-recovery-partial');
		await expect(dialog).toBeVisible();
		await expect(dialog).toHaveAttribute('aria-modal', 'true');
		await expect(page.getByTestId('ses-recovery-missing-items')).toContainText(
			'Combat order (1 combatant record missing)',
		);

		// AC2 — a dice tool is NOT interactive while the banner is up (the backdrop intercepts).
		let blocked = false;
		try {
			await page.getByTestId('roll-dice').click({ timeout: 1500 });
		} catch {
			blocked = true;
		}
		expect(blocked).toBe(true);

		// Continue with partial state → tools are interactive again.
		await page.getByTestId('ses-recovery-continue-partial').click();
		await expect(dialog).toHaveCount(0);
		await expect(page.getByTestId('roll-dice')).toBeEnabled();
	});

	test('UX-SES-003 — row anatomy is visible without horizontal scrolling; defeated rows sink below', async ({
		page,
	}) => {
		await startActiveSession(page);
		await dismissRestoredBanner(page);
		await startCombat(page, 'Glance test', [
			{ name: 'Goblin', hp: 7, qty: 6 },
			{ name: 'Ogre', hp: 30 },
		]);

		// AC1 — seven combatants, every row shows initiative + name + HP without horizontal scroll.
		const rows = page.getByTestId('initiative-order').locator('li');
		await expect(rows).toHaveCount(7);
		await expect(page.getByTestId('combatant-initiative')).toHaveCount(7);
		await expect(page.getByTestId('combatant-hp')).toHaveCount(7);
		const noHScroll = await page
			.getByTestId('initiative-order')
			.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
		expect(noHScroll).toBe(true);

		// AC3 — drop the FIRST combatant (a 7 HP goblin) to 0 through the UX-SES-005 inline stepper
		// and confirm "Yes — defeated": defeated treatment + sorted last.
		const firstRowId = await rows.first().getAttribute('data-combatant-id');
		await clickInView(page, `hp-edit-${firstRowId}`);
		const hpInput = page.getByTestId(`hp-input-${firstRowId}`);
		await hpInput.fill('0');
		await page.getByTestId(`apply-hp-${firstRowId}`).click();
		await page.getByTestId(`defeat-yes-${firstRowId}`).click();
		await expect(
			page.getByTestId(`combatant-${firstRowId}`).getByTestId('defeated-badge'),
		).toBeVisible();
		// The defeated row is now positioned below all non-defeated combatants.
		const lastRowId = await rows.last().getAttribute('data-combatant-id');
		expect(lastRowId).toBe(firstRowId);
	});

	test('UX-SES-003 AC2 / UX-SES-004 AC3 — a hidden combatant never reaches a player DOM; active shows the placeholder', async ({
		page,
	}) => {
		await startActiveSession(page);
		await dismissRestoredBanner(page);
		// The marker combatant is added FIRST so it acts first (deterministic tie-break) — it will be
		// the ACTIVE combatant when the player views the tracker.
		await startCombat(page, 'Ambush', [
			{ name: MARKER, hp: 66 },
			{ name: 'Goblin', hp: 7 },
		]);

		// Hide the marker combatant with a DM-approved placeholder (restart-path state surgery, then
		// a reload so the state flows through the real load path).
		await mutatePersistedSession(
			page,
			`for (const c of Object.values(doc.combat.combatants)) {
				if (c.name === '${MARKER}') { c.hidden = true; c.placeholder = 'Unknown creature'; }
			}`,
		);
		await page.reload();
		await page.getByTestId('session-view').waitFor({ state: 'visible' });
		await dismissRestoredBanner(page);

		// DM still sees the real name plus the hidden count.
		await expect(page.getByTestId('initiative-order')).toContainText(MARKER);
		await expect(page.getByTestId('combat-hidden-count')).toContainText('1 hidden');

		// Player client: the row is the placeholder with em-dash stats and the active chip; the real
		// name appears NOWHERE in the rendered page (AC2 — not in any DOM node).
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId('initiative-order')).toContainText('Unknown creature');
		await expect(page.getByTestId('combatant-hidden').first()).toContainText('HP — / —');
		const activeRow = page.getByTestId('initiative-order').locator('li[aria-current="true"]');
		await expect(activeRow).toContainText('Unknown creature');
		await expect(activeRow.getByTestId('active-badge')).toContainText('Active');
		const pageHtml = await page.content();
		expect(pageHtml).not.toContain(MARKER);
	});

	test('UX-SES-004 AC1/AC2 — current-turn emphasis is multi-dimensional and stays in view on advance', async ({
		page,
	}) => {
		await startActiveSession(page);
		await dismissRestoredBanner(page);
		await startCombat(page, 'Emphasis', [
			{ name: 'Goblin', hp: 7, qty: 7 },
			{ name: 'Ogre', hp: 30 },
		]);

		const rows = page.getByTestId('initiative-order').locator('li');
		await expect(rows).toHaveCount(8);

		// AC1 — the active row differs from an inactive row on ≥3 dimensions:
		// left border, background, and typography (bold name) — plus the chip + aria-current.
		const activeRow = page.locator('li[aria-current="true"]');
		await expect(activeRow).toHaveCount(1);
		await expect(activeRow.getByTestId('active-badge')).toBeVisible();
		const readRowStyles = (el: Element) => {
			const row = getComputedStyle(el);
			const name = getComputedStyle(el.querySelector('.name')!);
			return {
				borderLeftColor: row.borderLeftColor,
				background: row.backgroundColor,
				nameWeight: name.fontWeight,
			};
		};
		const activeStyles = await activeRow.evaluate(readRowStyles);
		const inactiveStyles = await rows.nth(1).evaluate(readRowStyles);
		// Dimension 1: the live left-border accent (color, not just width).
		expect(activeStyles.borderLeftColor).not.toBe(inactiveStyles.borderLeftColor);
		// Dimension 2: the elevated background.
		expect(activeStyles.background).not.toBe(inactiveStyles.background);
		// Dimension 3: typography — the bold name.
		expect(Number(activeStyles.nameWeight)).toBeGreaterThan(Number(inactiveStyles.nameWeight));

		// AC2 — advance repeatedly: the new current-turn row is scrolled into view each time.
		for (let i = 0; i < 5; i += 1) {
			await page.getByTestId('advance-turn').click();
		}
		await expect(page.locator('li[aria-current="true"]')).toBeInViewport();
	});

	test('UX-SES-006 — Space advances with a live announcement, Prev reverts, round wrap toasts', async ({
		page,
	}) => {
		await startActiveSession(page);
		await dismissRestoredBanner(page);
		await startCombat(page, 'Hot path', [
			{ name: 'Goblin', hp: 7 },
			{ name: 'Ogre', hp: 30 },
		]);

		// AC2 — the Next button is a generous, one-thumb target (≥44 px tall, ≥80 px wide).
		const next = page.getByTestId('advance-turn');
		const box = (await next.boundingBox())!;
		expect(box.height).toBeGreaterThanOrEqual(44);
		expect(box.width).toBeGreaterThanOrEqual(80);

		// AC1 — focus the tracker and press Space: the turn advances and the assertive live region
		// announces the new active combatant.
		await page.getByTestId('combat-tracker').focus();
		await page.keyboard.press('Space');
		await expect(page.getByTestId('live-assertive')).toContainText(/It is now .*'s turn, round 1/);
		const activeAfterSpace = await page
			.locator('li[aria-current="true"]')
			.getAttribute('data-combatant-id');

		// AC3 — Prev reverts the accidental advance and announces it.
		await page.getByTestId('previous-turn').click();
		const activeAfterPrev = await page
			.locator('li[aria-current="true"]')
			.getAttribute('data-combatant-id');
		expect(activeAfterPrev).not.toBe(activeAfterSpace);
		await expect(page.getByTestId('live-assertive')).toContainText("'s turn, round 1");
		await expect(page.getByTestId('encounter-log')).toContainText('Returned to');

		// AC4 — advancing past the last combatant increments the round and toasts "Round 2 begins".
		// The toast is asserted FIRST (it auto-dismisses after 2 s).
		await next.click();
		await next.click();
		await expect(page.getByTestId('ses-toast-message').first()).toContainText('Round 2 begins');
		await expect(page.getByTestId('combat-round')).toContainText('Round 2');
	});

	test('UX-SES-017 — HP change raises an undo toast whose Undo restores via the inverse command', async ({
		page,
	}) => {
		await startActiveSession(page);
		await dismissRestoredBanner(page);
		await startCombat(page, 'Undoable', [{ name: 'Ogre', hp: 30 }]);

		const rowId = await page
			.getByTestId('initiative-order')
			.locator('li')
			.first()
			.getAttribute('data-combatant-id');
		// UX-SES-005 — the HP number opens the inline stepper; the typed value is the absolute target.
		await clickInView(page, `hp-edit-${rowId}`);
		const hpInput = page.getByTestId(`hp-input-${rowId}`);
		await hpInput.fill('18');
		await page.getByTestId(`apply-hp-${rowId}`).click();

		// AC1 — the optimistic update lands and the undo toast reads "[Name] HP: 30 → 18. Undo?".
		await expect(page.getByTestId(`combatant-${rowId}`).getByTestId('combatant-hp')).toContainText(
			'18',
		);
		const toast = page.getByTestId('ses-toast').first();
		await expect(toast).toContainText('Ogre HP: 30 → 18. Undo?');

		// AC2 — Undo dispatches the inverse command: the undo is confirmed (the 2 s milestone toast
		// is asserted first) and HP returns to 30.
		await toast.getByTestId('ses-toast-action').click();
		await expect(page.getByTestId('ses-toast-message').first()).toContainText('HP change undone.');
		await expect(page.getByTestId(`combatant-${rowId}`).getByTestId('combatant-hp')).toContainText(
			'30',
		);
	});

	test('UX-SES-017 AC3 — a failed roll raises an error toast whose Retry re-dispatches the command', async ({
		page,
	}) => {
		await startActiveSession(page);
		await dismissRestoredBanner(page);

		// An invalid expression makes the core reject the roll (a deterministic failure path).
		await page.getByTestId('dice-expression').fill('not-a-dice-expression');
		await clickInView(page, 'roll-dice');

		const toast = page.getByTestId('ses-toast').first();
		await expect(toast).toContainText('Roll failed.');
		const retry = toast.getByTestId('ses-toast-action');
		await expect(retry).toContainText('Retry');

		// Retry re-dispatches the SAME command — it fails identically, raising a fresh toast.
		await retry.click();
		await expect(page.getByTestId('ses-toast').first()).toContainText('Roll failed.');
	});
});
