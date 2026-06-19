import { expect, test, type Page } from '@playwright/test';

// SES-009 / SES-012 — the Session section's PREP / RECAP + CAMPAIGN CALENDAR CONTINUITY surface.
//
// - SES-012: the DM maintains the campaign CALENDAR + current date (custom-time state) and LINKS dates to
//   notes BY REFERENCE. The current date + a linked note render in a STABLE canonical format (CONTENT-011
//   formatter), and a link to a now-hidden note degrades to "unavailable" for a player (no leak), proven
//   through the "view as" control.
// - SES-009: the DM runs the PREP workflow that GATHERS unresolved threads (an open-thread pin), recent
//   changes (op-log), handout outcomes (delivery history), combat summaries (encounter log), and
//   continuity prompts — a PURE DERIVATION over the existing sources, computed with NO AI. The digest is
//   DM-only: a player sees the fail-closed empty state (hard no-leak).
//
// The same stacked surfaces render on desktop and compact profiles, so this runs on BOTH Playwright
// projects (desktop-chromium AND mobile-chromium).

test.describe('SES prep/recap and calendar continuity', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/session/');
		await page.getByTestId('session-view').waitFor({ state: 'visible' });
		await page.evaluate(async () => {
			await indexedDB.deleteDatabase('dndtools-v2');
		});
		await page.reload();
		await page.getByTestId('session-view').waitFor({ state: 'visible' });
	});

	// Define the campaign calendar + create a DM-only dated note on the Knowledge surface, then return its
	// presence for the session-route forms (which reference notes by id through the actor-filtered read).
	async function seedCalendarAndNote(page: Page, title: string): Promise<void> {
		await page.goto('/knowledge/');
		await page.getByTestId('knowledge-view').waitFor({ state: 'visible' });
		await page.getByTestId('content-define-calendar').click();
		await expect(page.getByTestId('content-calendar-name')).toContainText('Calendar of Harptos');

		const titleInput = page.getByTestId('content-title');
		await titleInput.fill(title);
		await page.getByTestId('content-visibility').selectOption('dm-only');
		await page.getByTestId('content-date-month').fill('1');
		await page.getByTestId('content-date-day').fill('5');
		await page.getByTestId('content-date-year').fill('1372');
		await page.getByTestId('content-submit').click();
		await expect(page.getByTestId('content-items').getByText(title)).toBeVisible();
	}

	async function startActiveSession(page: Page): Promise<void> {
		await page.goto('/board/');
		await page.getByTestId('command-center').waitFor({ state: 'visible' });
		await page.getByTestId('session-workflow-active').click();
		await expect(page.getByTestId('session-workflow-status')).toContainText('active');
		await page.waitForFunction(async () => {
			const doc = await new Promise<{ doc?: { workflow?: string } } | undefined>((resolve) => {
				const open = indexedDB.open('dndtools-v2');
				open.onsuccess = () => {
					const dbInstance = open.result;
					try {
						const tx = dbInstance.transaction('documents', 'readonly');
						const get = tx.objectStore('documents').get('session-state');
						get.onsuccess = () => resolve(get.result);
						get.onerror = () => resolve(undefined);
					} catch {
						resolve(undefined);
					}
				};
				open.onerror = () => resolve(undefined);
			});
			return doc?.doc?.workflow === 'active';
		});
	}

	async function gotoSession(page: Page): Promise<void> {
		await page.goto('/session/');
		await page.getByTestId('session-view').waitFor({ state: 'visible' });
		await page.getByTestId('prep-recap').waitFor({ state: 'visible' });
	}

	test('SES-012: a campaign date and a linked note render in a stable canonical format', async ({
		page,
	}) => {
		await seedCalendarAndNote(page, 'The Burning of Highmoor');
		await gotoSession(page);

		// Set the campaign current date in calendar terms.
		await page.getByTestId('campaign-date-month').fill('2');
		await page.getByTestId('campaign-date-day').fill('14');
		await page.getByTestId('campaign-date-year').fill('1372');
		await page.getByTestId('set-campaign-date').click();
		// Stable canonical rendering (CONTENT-011 formatter — locale/clock independent).
		await expect(page.getByTestId('campaign-current-date')).toContainText('14 Alturiak 1372 DR');

		// Link the DM note to a date BY REFERENCE.
		await page.getByTestId('link-target-select').selectOption({ label: 'The Burning of Highmoor' });
		await page.getByTestId('link-label').fill('Highmoor fire');
		await page.getByTestId('link-month').fill('1');
		await page.getByTestId('link-day').fill('5');
		await page.getByTestId('link-year').fill('1372');
		await page.getByTestId('link-calendar-date').click();

		// The DM sees the resolved live title + the stable date.
		const links = page.getByTestId('calendar-links');
		await expect(links).toContainText('Highmoor fire');
		await expect(links).toContainText('The Burning of Highmoor');
		await expect(links).toContainText('5 Hammer 1372 DR');
	});

	test('SES-012: a link to a DM-only note degrades to unavailable for a player (no leak)', async ({
		page,
	}) => {
		await seedCalendarAndNote(page, 'Secret cabal');
		await gotoSession(page);

		await page.getByTestId('link-target-select').selectOption({ label: 'Secret cabal' });
		await page.getByTestId('link-label').fill('Cabal');
		await page.getByTestId('link-calendar-date').click();
		await expect(page.getByTestId('calendar-links')).toContainText('Secret cabal');

		// View as a player: the link label + date still render, but the dm-only title NEVER leaks.
		await page.getByTestId('view-as-select').selectOption('actor-player');
		const links = page.getByTestId('calendar-links');
		await expect(links).toContainText('Cabal');
		await expect(page.getByTestId('calendar-link-unavailable').first()).toBeVisible();
		await expect(links).not.toContainText('Secret cabal');
	});

	test('SES-009: the prep digest gathers threads, handouts, combat, and changes; DM-only', async ({
		page,
	}) => {
		await seedCalendarAndNote(page, 'Who poisoned the duke?');
		await startActiveSession(page);
		await gotoSession(page);

		// SES-007 — pin the note as an OPEN THREAD (the prep-digest thread source).
		await page.getByTestId('qr-kind-select').selectOption('open-thread');
		await page.getByTestId('qr-target-select').selectOption({ label: 'Who poisoned the duke?' });
		await page.getByTestId('qr-label').fill('Poison mystery');
		await page.getByTestId('pin-quick-reference').click();
		await expect(page.getByTestId('quick-reference-panels')).toContainText('Poison mystery');

		// SES-004 — deliver a handout to a player (the handout-outcome source).
		await page.getByTestId('handout-title').fill('The cryptic letter');
		await page.getByTestId('handout-recipient-actor-player').check();
		await page.getByTestId('deliver-handout').click();
		await expect(page.getByTestId('handout-error')).toHaveCount(0);

		// The DM prep digest gathers each source + synthesizes continuity prompts (no AI). It derives the
		// open thread (SES-007), the handout outcome (SES-004), the op-log recent changes, and the prompts.
		await expect(page.getByTestId('digest-content')).toBeVisible();
		await expect(page.getByTestId('digest-threads')).toContainText('Poison mystery');
		await expect(page.getByTestId('digest-handouts')).toContainText('The cryptic letter');
		await expect(page.getByTestId('digest-recent-changes')).toContainText('session.deliver-handout');
		await expect(page.getByTestId('digest-prompts')).toContainText('Unresolved thread');

		// DM-only no-leak: a player sees the fail-closed empty digest, never the dm-only thread title.
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId('digest-empty')).toBeVisible();
		await expect(page.getByTestId('digest-content')).toHaveCount(0);
		await expect(page.getByTestId('prep-recap')).not.toContainText('Who poisoned the duke?');
	});
});
