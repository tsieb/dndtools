import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { enterPreview, gotoRoute, markOnboarded, seedFresh } from './_helpers';

// The release gate's own ruleset (a11y-axe-gate.spec.ts), applied to the ONE state that gate cannot
// reach: `/play` opens on the stage, so the private journal's three forms are never scanned there.
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

// RC-CHR-4.1 — PLAYER-PRIVATE NOTES on `/play`. The store is a separate, per-character Dexie
// database (`dndtools-private-<characterId>`, ADR-035) that the sync, backup and MCP paths never
// open, so the checks here are the ones a unit test cannot make: the records really do survive a
// reload in a real browser, and the CORE state the host replicates carries none of their text.

// A line no seeded fixture would ever contain, so finding it in core state proves a leak.
const SECRET = 'zz-private-the-steward-opened-the-gate';
const NPC = 'zz-private-warden-harrow';

/**
 * Open `/play` and its Journal section.
 *
 * `preview` drives the two REAL device postures this screen has. In DM preview the Core is
 * deliberately read-only (`actor-not-authorized`: "Preview mode is read-only"), which is right for
 * table state but means no share can be accepted; without preview the device runs as the seated
 * player actor, which is the solo posture, and a share the player owns is authorised for real.
 */
async function openPrivateJournal(page: Page, opts: { preview: boolean }): Promise<void> {
	await markOnboarded(page);
	await gotoRoute(page, '/session');
	await seedFresh(page);
	await page.goto('/#/play', { waitUntil: 'domcontentloaded' });
	await page.waitForFunction(() => !!window.__rt && window.__rt.loaded === true, null, {
		timeout: 20_000,
	});
	if (opts.preview) await enterPreview(page, 'player');
	await page.getByRole('main').first().waitFor({ timeout: 20_000 });
	await page.getByRole('button', { name: 'Journal', exact: true }).click();
	await expect(page.getByTestId('private-journal')).toBeVisible();
}

/** Whether any string anywhere in the replicated core state contains `needle`. */
function coreStateContains(page: Page, needle: string): Promise<boolean> {
	return page.evaluate((text) => JSON.stringify(window.__rt!.state).includes(text), needle);
}

test.describe('player-private notes', () => {
	test('a private note is written to the device, survives a reload, and never reaches core state', async ({
		page,
	}) => {
		await openPrivateJournal(page, { preview: true });

		const form = page.getByTestId('private-note-form');
		await form.getByLabel('Title', { exact: true }).fill('What I actually think');
		await form.getByLabel('Note', { exact: true }).fill(SECRET);
		await page.getByRole('button', { name: 'Save note', exact: true }).click();

		const notes = page.getByTestId('private-note');
		await expect(notes).toHaveCount(1);
		await expect(notes.first()).toContainText(SECRET);

		// THE LEAK CHECK. `__rt.state` is the CoreStateSlice — the same object that is persisted,
		// folded into a backup, read by MCP, and projected into the snapshot the host replicates to
		// joined devices. A private note appearing anywhere in it is the failure this story exists
		// to prevent.
		expect(
			await coreStateContains(page, SECRET),
			'a private note must never appear in the core state the host replicates',
		).toBe(false);
		expect(await page.evaluate(() => window.__rt!.state.sync.operations.length)).toBeGreaterThan(
			-1,
		);
		expect(
			await page.evaluate(
				(text) => JSON.stringify(window.__rt!.state.sync.operations).includes(text),
				SECRET,
			),
			'a private note must never be journalled into the operation log',
		).toBe(false);

		// It is durable, not merely in React state: reload the whole app and read it back.
		await page.reload({ waitUntil: 'domcontentloaded' });
		await page.waitForFunction(() => !!window.__rt && window.__rt.loaded === true, null, {
			timeout: 20_000,
		});
		await enterPreview(page, 'player');
		await page.getByRole('button', { name: 'Journal', exact: true }).click();
		await expect(page.getByTestId('private-note').first()).toContainText(SECRET);
	});

	test('sharing one impression sends exactly that entry to the table and leaves the rest private', async ({
		page,
	}) => {
		await openPrivateJournal(page, { preview: false });

		// One private note that must stay private, and one impression the player chooses to share.
		const noteForm = page.getByTestId('private-note-form');
		await noteForm.getByLabel('Title', { exact: true }).fill('Kept back');
		await noteForm.getByLabel('Note', { exact: true }).fill(SECRET);
		await page.getByRole('button', { name: 'Save note', exact: true }).click();
		await expect(page.getByTestId('private-note')).toHaveCount(1);

		const impressionForm = page.getByTestId('private-impression-form');
		await impressionForm.getByLabel('Who', { exact: true }).fill(NPC);
		await impressionForm
			.getByLabel('What your character makes of them', { exact: true })
			.fill('Counts the coins twice.');
		await page.getByRole('button', { name: 'Save impression', exact: true }).click();

		const impressions = page.getByTestId('private-impression');
		await expect(impressions).toHaveCount(1);
		// Unshared until the player says so: no "Shared with the DM" badge yet.
		await expect(impressions.first()).not.toContainText('Shared with the DM');
		expect(await coreStateContains(page, NPC)).toBe(false);

		await page.getByRole('button', { name: `Share your impression of ${NPC} with the DM` }).click();

		// The one shared impression IS now table state — a real `character.add-journal-entry`.
		await expect.poll(() => coreStateContains(page, NPC), { timeout: 10_000 }).toBe(true);
		const entry = await page.evaluate((name) => {
			const journals =
				(
					window.__rt!.state as unknown as {
						characters: {
							journals?: {
								journals?: Record<
									string,
									{ entries?: { kind: string; title: string; body: string }[] }
								>;
							};
						};
					}
				).characters.journals?.journals ?? {};
			for (const journal of Object.values(journals)) {
				for (const row of journal.entries ?? []) {
					if (row.title === name) return row;
				}
			}
			return null;
		}, NPC);
		expect(entry, 'the shared impression must land as a real journal entry').not.toBeNull();
		expect(entry!.kind).toBe('npc-impression');

		// The screen says so, and the private note beside it still did not cross.
		await expect(impressions.first()).toContainText('Shared with the DM');
		expect(
			await coreStateContains(page, SECRET),
			'sharing one impression must not carry the rest of the private journal with it',
		).toBe(false);
	});

	test('a share the table refuses says so instead of claiming the DM has it', async ({ page }) => {
		// DM preview is read-only in the Core, so this share CANNOT be accepted. Guardrail 9: the
		// screen must report the refusal rather than paint a shared badge nobody earned.
		await openPrivateJournal(page, { preview: true });

		const impressionForm = page.getByTestId('private-impression-form');
		await impressionForm.getByLabel('Who', { exact: true }).fill(NPC);
		await impressionForm
			.getByLabel('What your character makes of them', { exact: true })
			.fill('Counts the coins twice.');
		await page.getByRole('button', { name: 'Save impression', exact: true }).click();
		await expect(page.getByTestId('private-impression')).toHaveCount(1);

		await page.getByRole('button', { name: `Share your impression of ${NPC} with the DM` }).click();

		await expect(page.getByTestId('private-journal-status')).toContainText(
			'The table declined the share',
		);
		await expect(page.getByTestId('private-impression').first()).not.toContainText(
			'Shared with the DM',
		);
		expect(await coreStateContains(page, NPC)).toBe(false);
	});

	test('the private journal clears the release axe gate with records on screen', async ({
		page,
	}) => {
		await openPrivateJournal(page, { preview: true });

		const form = page.getByTestId('private-note-form');
		await form.getByLabel('Title', { exact: true }).fill('A note');
		await form.getByLabel('Note', { exact: true }).fill(SECRET);
		await page.getByRole('button', { name: 'Save note', exact: true }).click();
		await expect(page.getByTestId('private-note')).toHaveCount(1);

		const results = await new AxeBuilder({ page })
			.include('[data-testid="private-journal"]')
			.withTags(AXE_TAGS)
			.analyze();
		const blocking = results.violations.filter(
			(violation) => violation.impact === 'critical' || violation.impact === 'serious',
		);
		expect(
			blocking.map((violation) => `${violation.id}: ${violation.help}`),
			'the private journal must clear the same axe bar as every durable surface',
		).toEqual([]);
	});
});
