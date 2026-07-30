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
import { promises as fs } from 'node:fs';

// KNOWLEDGE — the /knowledge/:id? notes/handouts workbench against the live Processing Core.
// Notes are authored/edited/deleted through the REAL UI (composer, editor, Sharing controls,
// import paste box); prerequisite state is seeded through the dispatch choke point. Visibility is
// verified through `enterPreview` (the same actor-filtered read a real participant gets), the
// import commits through `content.commit-import`, export leaves through the app's single download
// seam (Community → Export drives the core `content.export`), and the connected-sources panel is
// asserted in its honest fail-closed/unconfigured state (no cloud env on this server).

/** Titles seeded by demo-seed.ts — one player-visible, one dm-only (the leak canary). */
const SEEDED_VISIBLE = 'Campaign Primer';
const SEEDED_DM_ONLY = 'The Sunken Crypt — DM notes';

/** Loose content-item shape read off `__rt.state.content.items` (raw, NOT actor-filtered). */
interface ItemLite {
	id: string;
	kind: string;
	title: string;
	body: string;
	visibility: string;
}

function findItem(page: Page, title: string): Promise<ItemLite | null> {
	return page.evaluate((t) => {
		const items = (window.__rt!.state.content as { items: Record<string, ItemLite> }).items;
		return Object.values(items).find((i) => i.title === t) ?? null;
	}, title);
}

/** The new item id off an accepted content dispatch (`content.item-changed` event). */
function itemIdFrom(result: { events?: Array<Record<string, unknown>> }): string | null {
	for (const e of result.events ?? []) {
		if (e.kind === 'content.item-changed' && typeof e.itemId === 'string') return e.itemId;
	}
	return null;
}

async function createNoteViaCore(
	page: Page,
	title: string,
	body: string,
	visibility: string,
): Promise<string> {
	const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
	const result = await dispatch(page, {
		type: 'content.create-item',
		actorId,
		payload: { kind: 'note', title, body, visibility },
	});
	expect(result.status).toBe('accepted');
	const id = itemIdFrom(result);
	expect(id).toBeTruthy();
	return id!;
}

test.describe('knowledge: notes workbench', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/knowledge');
		await seedFresh(page);
		await page.goto('/#/knowledge', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.locator('#main-content').waitFor({ state: 'attached' });
	});

	test('the composer authors a real note and it survives reload', async ({ page }) => {
		// The seeded vault renders its notes (proves the list reads the live content model).
		await expect(page.getByText(SEEDED_VISIBLE)).not.toHaveCount(0);

		const title = `Harbor Ledger ${Date.now()}`;
		const before = await ops(page);

		// Real UI: New note → composer → Create. An accepted create navigates to /knowledge/:id.
		await page.getByRole('button', { name: 'New note' }).first().click();
		await page.getByPlaceholder('New note title…').fill(title);
		await page.getByRole('button', { name: 'Create', exact: true }).click();

		await page.waitForFunction(
			(t) =>
				Object.values(
					(window.__rt!.state.content as { items: Record<string, { title: string }> }).items,
				).some((i) => i.title === t),
			title,
			{ timeout: 10_000 },
		);
		const item = await findItem(page, title);
		expect(item?.kind).toBe('note');
		// New notes fail closed to dm-only.
		expect(item?.visibility).toBe('dm-only');
		expect(await ops(page)).toBeGreaterThan(before);

		// The create-navigation landed on the note's own URL and the viewer shows it. Wait for the
		// router hash to settle (the redirect trails the state write, and is slower on mobile).
		await page.waitForURL((url) => url.hash.includes(`/knowledge/${item!.id}`), {
			timeout: 10_000,
		});
		await expect(page.getByText(title)).not.toHaveCount(0);

		// Reload-persistence: the durable op-log round-trips through IndexedDB.
		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitReady(page);
		expect((await findItem(page, title))?.id).toBe(item!.id);
		await expect(page.getByText(title)).not.toHaveCount(0);
	});

	test('the editor updates title and body through content.update-item', async ({ page }) => {
		const stamp = Date.now();
		const noteId = await createNoteViaCore(
			page,
			`Tide Journal ${stamp}`,
			'First entry.',
			'dm-only',
		);

		await gotoRoute(page, `/knowledge/${noteId}`);
		await page.getByRole('button', { name: 'Edit', exact: true }).click();

		const newTitle = `Tide Journal (revised) ${stamp}`;
		const newBody = 'The tide returns at dusk and the pier goes quiet.';
		await page.getByPlaceholder('Note title').fill(newTitle);
		await page.locator('textarea').fill(newBody);
		await page.getByRole('button', { name: 'Save note' }).click();

		// The save closed the editor and the persisted item carries the new title+body.
		await page.waitForFunction(
			(arg) => {
				const items = (
					window.__rt!.state.content as {
						items: Record<string, { id: string; title: string; body: string }>;
					}
				).items;
				const item = items[arg.id];
				return !!item && item.title === arg.title && item.body === arg.body;
			},
			{ id: noteId, title: newTitle, body: newBody },
			{ timeout: 10_000 },
		);
		await expect(page.getByText(newTitle)).not.toHaveCount(0);
		await expect(
			page.getByText('The tide returns at dusk and the pier goes quiet.'),
		).not.toHaveCount(0);

		// Reload-persistence for the edit.
		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitReady(page);
		const persisted = await findItem(page, newTitle);
		expect(persisted?.body).toBe(newBody);
	});

	test('visibility set from the Sharing panel governs the player preview', async ({ page }) => {
		const title = `Sealed Reliquary ${Date.now()}`;
		const noteId = await createNoteViaCore(page, title, 'Behind the broken seal.', 'dm-only');

		// dm-only: absent from a player preview (and the seeded dm-only note never leaks either).
		await enterPreview(page, 'player');
		await expect(page.getByText(title)).toHaveCount(0);
		await expect(page.getByText(SEEDED_DM_ONLY)).toHaveCount(0);
		await expect(page.getByText(SEEDED_VISIBLE)).not.toHaveCount(0);
		await exitPreview(page);

		// Real UI: open the note and flip the Sharing segment to Players. Widening DM-only content
		// confirms first — players can read it the moment it lands.
		await gotoRoute(page, `/knowledge/${noteId}`);
		await page.getByRole('radio', { name: 'Players' }).click();
		const reveal = page.getByRole('dialog', { name: /Show .* to players/ });
		await expect(reveal).toBeVisible();
		await reveal.getByRole('button', { name: 'Push to players' }).click();
		await page.waitForFunction(
			(id) =>
				(window.__rt!.state.content as { items: Record<string, { visibility: string }> }).items[id]
					?.visibility === 'player-visible',
			noteId,
			{ timeout: 10_000 },
		);
		// The redundant "Push to players" affordance disappears once the note is already shared.
		await expect(page.getByRole('button', { name: 'Push to players' })).toHaveCount(0);

		// Now the player preview's filtered list contains it.
		await page.goto('/#/knowledge', { waitUntil: 'domcontentloaded' });
		await page.locator('#main-content').waitFor({ state: 'attached' });
		await enterPreview(page, 'player');
		await expect(page.getByText(title)).not.toHaveCount(0);
		await exitPreview(page);
	});

	test('delete removes the note and the toast Undo restores it durably', async ({ page }) => {
		const title = `Disposable Rumor ${Date.now()}`;
		const noteId = await createNoteViaCore(page, title, 'A rumor best forgotten.', 'dm-only');

		await gotoRoute(page, `/knowledge/${noteId}`);
		await page.getByRole('button', { name: 'Edit', exact: true }).click();
		await page.getByRole('button', { name: 'Delete', exact: true }).click();

		// Soft-delete: back on the list, the note is gone from the actor-filtered read.
		await expect(page.getByRole('status').filter({ hasText: 'deleted' })).not.toHaveCount(0);
		await expect(page.locator('#main-content').getByText(title)).toHaveCount(0);

		// Undo dispatches the counterpart content.restore-item.
		await page.getByRole('button', { name: 'Undo' }).click();
		await expect(page.getByRole('status').filter({ hasText: 'restored' })).not.toHaveCount(0);
		await expect(page.locator('#main-content').getByText(title)).not.toHaveCount(0);

		// The restore is durable, not display state.
		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await expect(page.locator('#main-content').getByText(title)).not.toHaveCount(0);
	});

	test('declining the reveal confirm leaves the note DM-only', async ({ page }) => {
		// The exposure is one-way in practice: you cannot un-read what a player already saw. All three
		// entry points (the Seg, the send icon, the Push button) funnel through the same guard.
		const title = `Unspoken Pact ${Date.now()}`;
		const noteId = await createNoteViaCore(page, title, 'Not for the table yet.', 'dm-only');
		await gotoRoute(page, `/knowledge/${noteId}`);
		const before = await ops(page);

		const reveal = page.getByRole('dialog', { name: /Show .* to players/ });
		// The viewer offers the reveal twice — a header icon button and the Sharing panel's own button.
		const pushButtons = page.getByRole('button', { name: 'Push to players' });

		for (const entry of [pushButtons.first(), pushButtons.last()]) {
			await entry.click();
			await expect(reveal).toBeVisible();
			await reveal.getByRole('button', { name: 'Keep DM only' }).click();
			await expect(reveal).toHaveCount(0);
			expect((await findItem(page, title))?.visibility).toBe('dm-only');
		}

		// The third entry point is the visibility segment, which shares the same guard.
		await page.getByRole('radio', { name: 'Players' }).click();
		await expect(reveal).toBeVisible();
		await reveal.getByRole('button', { name: 'Keep DM only' }).click();
		await expect(reveal).toHaveCount(0);

		// Nothing was ever dispatched, so the note is untouched.
		expect(await ops(page)).toBe(before);
		expect((await findItem(page, title))?.visibility).toBe('dm-only');
	});

	test('a [[wikilink]] in a note body navigates to the linked note', async ({ page }) => {
		// The links rendered accent-coloured but were inert spans — a dead deep link inside the DM's
		// own vault. They resolve through the core's ACTOR-FILTERED index, so an unreachable target
		// must stay non-interactive rather than advertising a note you cannot open.
		const stamp = Date.now();
		const targetTitle = `Harbor Bell ${stamp}`;
		const targetId = await createNoteViaCore(page, targetTitle, 'It rings at dusk.', 'dm-only');
		const sourceId = await createNoteViaCore(
			page,
			`Dock Rumors ${stamp}`,
			`Ask about the [[${targetTitle}]] and the [[Nonexistent Note ${stamp}]].`,
			'dm-only',
		);

		await gotoRoute(page, `/knowledge/${sourceId}`);
		const link = page.getByRole('button', { name: targetTitle, exact: true });
		await expect(link).toHaveCount(1);
		await link.click();

		// It opened the target note, not merely re-rendered the source.
		await page.waitForURL((url) => url.hash.includes(`/knowledge/${targetId}`), { timeout: 10_000 });
		await expect(page.getByText('It rings at dusk.')).not.toHaveCount(0);

		// The unresolvable link is NOT a button — it never pretends to be clickable.
		await gotoRoute(page, `/knowledge/${sourceId}`);
		await expect(
			page.getByRole('button', { name: `Nonexistent Note ${stamp}`, exact: true }),
		).toHaveCount(0);
		await expect(page.getByText(`Nonexistent Note ${stamp}`)).not.toHaveCount(0);
	});

	test('markdown bullets render as a real list, not orphaned <li> elements', async ({ page }) => {
		// The renderer returned bare <li>s straight into a <div>: invalid HTML, and a screen reader
		// announced each bullet as a loose line instead of "list, 3 items" (WCAG 1.3.1).
		const noteId = await createNoteViaCore(
			page,
			`Provisions ${Date.now()}`,
			'Pack list:\n- Rope, 50 ft\n- Tinderbox\n- Rations, 3 days\n\nThen leave.',
			'dm-only',
		);
		await gotoRoute(page, `/knowledge/${noteId}`);

		const list = page.locator('#main-content ul').filter({ hasText: 'Tinderbox' });
		await expect(list).toHaveCount(1);
		await expect(list.locator('li')).toHaveCount(3);
		// Every rendered bullet has a list parent — none are orphaned.
		expect(
			await page
				.locator('#main-content li')
				.evaluateAll((els) => els.every((el) => el.parentElement?.tagName === 'UL')),
		).toBe(true);
	});

	test('a pasted markdown archive commits through content.commit-import', async ({ page }) => {
		const before = await ops(page);
		await page.getByRole('button', { name: 'Import vault' }).click();

		// Two-file inline fixture using the `===== path.md =====` header convention.
		const archive = [
			'===== Imports/Tide Chart.md =====',
			'# Tide Chart',
			'The tide rises at dusk and falls before the third bell.',
			'',
			'===== Imports/Harbor Rumors.md =====',
			'# Harbor Rumors',
			'They say the ferryman rows without oars.',
		].join('\n');
		await page.locator('textarea').fill(archive);
		await page.getByRole('button', { name: 'Import', exact: true }).click();

		// The panel reports the committed transaction and both notes land in the vault.
		await expect(page.getByText('Imported 2 new.')).not.toHaveCount(0);
		expect((await findItem(page, 'Tide Chart'))?.kind).toBe('note');
		expect((await findItem(page, 'Harbor Rumors'))?.kind).toBe('note');
		expect(await ops(page)).toBeGreaterThan(before);

		await page.getByRole('button', { name: 'Close', exact: true }).click();
		await expect(page.getByText('Tide Chart')).not.toHaveCount(0);

		// Reload-persistence: the import was a durable transaction.
		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitReady(page);
		expect(await findItem(page, 'Harbor Rumors')).not.toBeNull();
	});

	test('exporting notes fires a real download with a sane portable bundle', async ({ page }) => {
		// Note export lives on Community → Export (the app's single content.export surface); the
		// resulting .json bundle round-trips through the Knowledge import.
		await gotoRoute(page, '/community');
		await page.getByRole('tab', { name: 'Export' }).click();

		const downloadPromise = page.waitForEvent('download');
		await page.getByRole('button', { name: 'Export & download' }).click();
		const download = await downloadPromise;

		// Multiple items ⇒ a JSON bundle named by mode+date (portable is the default: secrets redacted).
		expect(download.suggestedFilename()).toMatch(
			/^dndtools-export-portable-\d{4}-\d{2}-\d{2}\.json$/,
		);
		const path = await download.path();
		const bundle = JSON.parse(await fs.readFile(path!, 'utf8')) as {
			format: string;
			mode: string;
			files: Array<{ path: string; markdown: string }>;
		};
		expect(bundle.format).toBe('dndtools-content-export');
		expect(bundle.mode).toBe('portable');
		expect(bundle.files.length).toBeGreaterThan(0);
		const corpus = bundle.files.map((f) => `${f.path}\n${f.markdown}`).join('\n');
		// Player-visible content is in; the dm-only note is redacted from a portable export.
		expect(corpus).toContain(SEEDED_VISIBLE);
		expect(corpus).not.toContain(SEEDED_DM_ONLY);

		// The surface confirms what actually left the browser.
		await expect(page.getByText(/Downloaded/)).not.toHaveCount(0);
	});

	test('connected sources render the honest not-connected state', async ({ page }) => {
		await page.getByRole('button', { name: 'Sources' }).click();
		await expect(page.getByText('Connected sources')).not.toHaveCount(0);

		// Google Docs is fail-closed: no OAuth client id on this server, so the panel says so and
		// offers NO sign-in affordance (never a dead button).
		await expect(
			page.getByText(/Google Docs connections are not available in this release/),
		).not.toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Sign in with Google' })).toHaveCount(0);

		// Folder sources: either the File System Access API is present (Chromium) and no folder is
		// connected yet, or the API is missing and the panel states that honestly. Exactly one holds.
		const noneConnected = page.getByText(/No folders connected yet/);
		const unsupported = page.getByText(/this browser doesn’t support it/);
		expect((await noneConnected.count()) + (await unsupported.count())).toBeGreaterThan(0);

		// No source rows exist, so no Pull/Push transport affordances leak into the panel.
		await expect(page.getByRole('button', { name: 'Pull', exact: true })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Push', exact: true })).toHaveCount(0);
	});
});
