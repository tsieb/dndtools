import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// RC-UX-3.2 — FEATURE SPOTLIGHTS. A spotlight waits for an idle moment (the DM interacted, then
// stopped for 8s with nothing modal open), shows at most once per vault, and never repeats: it is
// recorded as seen in the device-preferences slice the moment it appears. The page clock is faked
// so the idle and cooldown windows (`app/help/Spotlight.tsx`) cost no real time.

const IDLE_MS = 8_000;
const COOLDOWN_MS = 5 * 60_000;
const SEEN_KEY = 'dndtools:react:seen-spotlights';

/** Onboarded, empty vault (no demo content, so the graph signal starts at zero links). */
async function openEmptyVault(page: Page): Promise<void> {
	await page.clock.install();
	await markOnboarded(page);
	await page.addInitScript(() => {
		try {
			window.localStorage.setItem('dndtools:react:vault-choice', 'fresh');
		} catch {
			/* best-effort, like markOnboarded */
		}
	});
	await gotoRoute(page, '/');
	await seedFresh(page);
}

/** One real keystroke (Shift alone does nothing in the app), then no input for `quietMs`. */
async function pauseAfterActivity(page: Page, quietMs: number): Promise<void> {
	await page.keyboard.press('Shift');
	await page.clock.fastForward(quietMs);
}

/** Negative checks need the render that would follow a fired timer to have had its chance. React
 * commits on a real (unfaked) scheduler tick, so a short real wait is that chance. */
async function settle(page: Page): Promise<void> {
	await page.waitForTimeout(300);
}

async function seenIds(page: Page): Promise<string[]> {
	const raw = await page.evaluate((key) => window.localStorage.getItem(key), SEEN_KEY);
	const record = JSON.parse(raw ?? '{}') as Record<string, string[]>;
	return Object.values(record).flat();
}

const anySpotlight = (page: Page) => page.locator('[data-spotlight-id]');
const spotlightCard = (page: Page, id: string) => page.locator(`[data-spotlight-id="${id}"]`);

async function linkThreeNotes(page: Page): Promise<void> {
	const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
	for (let n = 0; n < 3; n++) {
		const result = await dispatch(page, {
			type: 'content.create-item',
			actorId,
			payload: { kind: 'note', title: `Rumor ${n}`, body: `See [[Target ${n}]].` },
		});
		expect(result.status).toBe('accepted');
	}
}

test.describe('feature spotlights', () => {
	test.beforeEach(async ({ page }) => {
		await openEmptyVault(page);
	});

	test('another vault’s history does not suppress this vault or get overwritten', async ({
		page,
	}) => {
		await page.evaluate((key) => {
			window.localStorage.setItem(key, JSON.stringify({ 'another-vault': ['graph'] }));
		}, SEEN_KEY);
		await linkThreeNotes(page);
		await pauseAfterActivity(page, IDLE_MS + 1_000);
		await expect(spotlightCard(page, 'graph')).toBeVisible();
		const history = await page.evaluate((key) => {
			return JSON.parse(window.localStorage.getItem(key) ?? '{}') as Record<string, string[]>;
		}, SEEN_KEY);
		expect(history['another-vault']).toEqual(['graph']);
		expect(Object.keys(history)).toHaveLength(2);
		expect(Object.values(history)).toEqual([['graph'], ['graph']]);
		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await pauseAfterActivity(page, COOLDOWN_MS + IDLE_MS);
		await settle(page);
		await expect(spotlightCard(page, 'graph')).toHaveCount(0);
	});

	test('reloading an undismissed spotlight never shows it again', async ({ page }) => {
		await linkThreeNotes(page);
		await pauseAfterActivity(page, IDLE_MS + 1_000);
		await expect(spotlightCard(page, 'graph')).toBeVisible();
		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await pauseAfterActivity(page, COOLDOWN_MS + IDLE_MS);
		await settle(page);
		await expect(spotlightCard(page, 'graph')).toHaveCount(0);
		expect((await seenIds(page)).filter((id) => id === 'graph')).toEqual(['graph']);
	});

	test('defers spotlights when their seen record cannot be persisted', async ({ page }) => {
		await page.evaluate((key) => {
			const original = Storage.prototype.setItem;
			Storage.prototype.setItem = function (name, value) {
				if (name === key) throw new DOMException('Storage full', 'QuotaExceededError');
				original.call(this, name, value);
			};
		}, SEEN_KEY);
		await linkThreeNotes(page);
		await pauseAfterActivity(page, IDLE_MS + 1_000);
		await settle(page);
		await expect(anySpotlight(page)).toHaveCount(0);
		expect(await seenIds(page)).toEqual([]);
	});

	test('an earned spotlight waits for an idle moment, shows once, and never repeats', async ({
		page,
	}) => {
		await linkThreeNotes(page);
		const graph = spotlightCard(page, 'graph');

		// Activity followed by a short pause is not an idle moment.
		await pauseAfterActivity(page, IDLE_MS / 2);
		await settle(page);
		await expect(anySpotlight(page)).toHaveCount(0);

		// Staying quiet past the idle window is. The earned surface is first in the queue.
		await page.clock.fastForward(IDLE_MS);
		await expect(graph).toBeVisible();
		await expect(graph).toContainText('Your notes are connected');
		await expect(anySpotlight(page)).toHaveCount(1);
		// Recorded the moment it appeared, before any dismissal.
		expect(await seenIds(page)).toEqual(['graph']);

		await graph.getByRole('button', { name: 'Open the graph' }).click();
		await page.waitForURL(/#\/graph/);
		await waitReady(page);
		await expect(graph).toHaveCount(0);

		// A new launch, plenty of idle moments: the graph spotlight never comes back.
		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitReady(page);
		for (let round = 0; round < 3; round++) {
			await pauseAfterActivity(page, COOLDOWN_MS + IDLE_MS);
			await settle(page);
			await expect(graph).toHaveCount(0);
			// Keyboard tips may take their turn on a desktop; clear each so the queue keeps moving.
			if ((await anySpotlight(page).count()) > 0) {
				await anySpotlight(page).getByRole('button', { name: 'Dismiss tip' }).click();
			}
		}
		expect((await seenIds(page)).filter((id) => id === 'graph')).toEqual(['graph']);
	});

	test('keyboard tips wait out open dialogs, show one per cooldown, then never again', async ({
		page,
	}, testInfo) => {
		if (testInfo.project.name === 'mobile-chromium') {
			// A touch-only device is never taught keyboard shortcuts.
			await pauseAfterActivity(page, COOLDOWN_MS + IDLE_MS);
			await settle(page);
			await expect(anySpotlight(page)).toHaveCount(0);
			expect(await seenIds(page)).toEqual([]);
			return;
		}

		// An open dialog (the command palette is aria-modal) means the DM is mid-task.
		await page.keyboard.press('Meta+k');
		const palette = page.getByRole('dialog', { name: 'Command palette' });
		await expect(palette).toBeVisible();
		await page.clock.fastForward(IDLE_MS * 2);
		await settle(page);
		await expect(anySpotlight(page)).toHaveCount(0);

		// Closing it is activity; the next quiet stretch is an idle moment.
		await page.keyboard.press('Escape');
		await expect(palette).toHaveCount(0);
		await page.clock.fastForward(IDLE_MS + 1_000);
		const paletteTip = spotlightCard(page, 'command-palette');
		await expect(paletteTip).toBeVisible();
		await expect(paletteTip).toContainText('Ctrl/⌘+K');
		await expect(paletteTip).toHaveAttribute('role', 'complementary');
		await paletteTip.getByRole('button', { name: 'Dismiss tip' }).click();
		await expect(paletteTip).toHaveCount(0);

		// Another idle moment inside the cooldown shows nothing.
		await pauseAfterActivity(page, IDLE_MS + 1_000);
		await settle(page);
		await expect(anySpotlight(page)).toHaveCount(0);

		// After the cooldown the next tip in the queue takes its turn; Escape dismisses it.
		await page.clock.fastForward(COOLDOWN_MS);
		const shortcutsTip = spotlightCard(page, 'shortcuts');
		await expect(shortcutsTip).toBeVisible();
		await shortcutsTip.getByRole('button', { name: 'Dismiss tip' }).focus();
		await page.keyboard.press('Escape');
		await expect(shortcutsTip).toHaveCount(0);
		expect(await seenIds(page)).toEqual(['command-palette', 'shortcuts']);

		// Everything this vault can be shown has been shown: a new launch stays quiet.
		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await pauseAfterActivity(page, COOLDOWN_MS + IDLE_MS);
		await settle(page);
		await expect(anySpotlight(page)).toHaveCount(0);
	});
});
