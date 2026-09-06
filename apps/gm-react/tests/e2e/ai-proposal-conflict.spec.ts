import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// RC-AI-2.2 — THREE-WAY CONFLICT UI. A staged rewrite is written against the revision the assistant
// read. When the DM edits that note first, approving the proposal as staged writes NOTHING while the
// panel reports success. These specs drive a REAL divergence through the Core agent pipeline and
// assert the review panel now states all three sides, withholds the approve control that could not
// land, and settles the conflict with one validated command per choice.

const NOTE_TITLE = 'Ashfall Keep';
// Four lines, with a line neither side touches between the two edits: that unchanged line is what
// separates the assistant's rewrite of line 2 from the DM's rewrite of line 4 into a clean merge.
const GUARD_LINE = 'It is guarded by the watch.';
const BASE_BODY = [
	'# Ashfall',
	'The keep still stands.',
	GUARD_LINE,
	'The cellars are flooded.',
].join('\n');
const AI_BODY = ['# Ashfall', 'The keep is a ruin.', GUARD_LINE, 'The cellars are flooded.'].join(
	'\n',
);
const HUMAN_BODY = [
	'# Ashfall',
	'The keep still stands.',
	GUARD_LINE,
	'The cellars are dry again.',
].join('\n');
const MERGED_BODY = [
	'# Ashfall',
	'The keep is a ruin.',
	GUARD_LINE,
	'The cellars are dry again.',
].join('\n');
// The DM rewrites the SAME line the assistant did: no merge can pick between them.
const HUMAN_SAME_LINE = [
	'# Ashfall',
	'The keep is besieged.',
	GUARD_LINE,
	'The cellars are flooded.',
].join('\n');

function invokeAgentTool(
	page: Page,
	invocation: { agentId: string; toolId: string; input: unknown },
): Promise<{ status: string }> {
	return page.evaluate(
		(inv) =>
			(
				window.__rt as unknown as {
					invokeAgentTool: (i: unknown) => Promise<{ status: string }>;
				}
			).invokeAgentTool(inv),
		invocation,
	);
}

/** Read one note's current body straight out of Core state. */
function noteBody(page: Page, title: string): Promise<string> {
	return page.evaluate((wanted) => {
		const content = window.__rt!.state.content as {
			items: Record<string, { title: string; body: string }>;
		};
		return Object.values(content.items).find((i) => i.title === wanted)!.body;
	}, title);
}

/** Stage a rewrite of a note, then land a human edit on top so the staged base goes stale. */
async function seedConflict(page: Page, humanBody: string): Promise<void> {
	await markOnboarded(page);
	await page.addInitScript(() => {
		localStorage.setItem('dndtools.ai.usage-preference', 'complete');
	});
	await gotoRoute(page, '/settings?tab=ai');
	await seedFresh(page);
	await waitReady(page);

	const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
	const ok = async (command: Parameters<typeof dispatch>[1]) =>
		expect((await dispatch(page, command)).status).toBe('accepted');

	await ok({
		type: 'content.create-item',
		actorId,
		payload: { kind: 'note', title: NOTE_TITLE, body: BASE_BODY, visibility: 'dm-only' },
	});
	await ok({ type: 'mcp.set-enabled', actorId, payload: { enabled: true } });
	await ok({
		type: 'mcp.set-agent-binding',
		actorId,
		payload: { agentId: 'prep-assistant', actorId, label: 'Prep' },
	});
	await ok({
		type: 'mcp.set-agent-policy',
		actorId,
		payload: { agentId: 'prep-assistant', mode: 'strict_review', allowedToolIds: ['note.update'] },
	});

	const item = await page.evaluate((title) => {
		const content = window.__rt!.state.content as {
			items: Record<string, { id: string; title: string; revision: number }>;
		};
		return Object.values(content.items).find((i) => i.title === title)!;
	}, NOTE_TITLE);

	const staged = await invokeAgentTool(page, {
		agentId: 'prep-assistant',
		toolId: 'note.update',
		input: { itemId: item.id, baseRevision: item.revision, body: AI_BODY },
	});
	expect(staged.status).toBe('staged');

	// The DM edits the same note before reviewing: the staged base is now one revision behind.
	await ok({
		type: 'content.update-item',
		actorId,
		payload: { itemId: item.id, body: humanBody },
	});

	await page.goto('/#/settings?tab=ai', { waitUntil: 'domcontentloaded' });
	await waitReady(page);
	await page.locator('#main-content').waitFor({ state: 'attached' });
}

test.describe('ai proposals: three-way conflict (RC-AI-2.2)', () => {
	test('a diverged rewrite offers the three-way choice instead of an approve that cannot land', async ({
		page,
	}) => {
		await seedConflict(page, HUMAN_BODY);

		await expect(
			page.getByText('This note changed after the assistant read it', { exact: true }),
		).not.toHaveCount(0);
		// Approving as staged would write nothing, so that control is not offered at all.
		await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: "Keep the assistant's version" })).toHaveCount(1);
		await expect(page.getByRole('button', { name: 'Keep the note as it is' })).toHaveCount(1);
		// The two edits touch different lines, so a clean merge exists and is offered.
		await expect(page.getByRole('button', { name: 'Merge both' })).toHaveCount(1);
	});

	test('the detail names all three sides and who changed each passage', async ({ page }) => {
		await seedConflict(page, HUMAN_BODY);

		const disclosure = page.getByRole('button', { name: 'Show both versions' });
		await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
		await disclosure.focus();
		await page.keyboard.press('Enter');

		await expect(page.getByRole('button', { name: 'Hide both versions' })).toHaveAttribute(
			'aria-expanded',
			'true',
		);
		await expect(page.getByText('Read by the assistant').first()).toBeVisible();
		await expect(page.getByText('Only the assistant changed this')).not.toHaveCount(0);
		await expect(page.getByText('Only you changed this')).not.toHaveCount(0);
		await expect(page.getByText('The keep is a ruin.').first()).toBeVisible();
		await expect(page.getByText('The cellars are dry again.').first()).toBeVisible();
	});

	test('merging keeps both edits and closes the proposal', async ({ page }) => {
		await seedConflict(page, HUMAN_BODY);

		await page.getByRole('button', { name: 'Merge both' }).click();

		await expect.poll(() => noteBody(page, NOTE_TITLE)).toBe(MERGED_BODY);
		await expect(page.getByText(/^Nothing staged\./)).not.toHaveCount(0);
	});

	test('keeping the note as it is discards the rewrite and writes nothing', async ({ page }) => {
		await seedConflict(page, HUMAN_BODY);

		const keepMine = page.getByRole('button', { name: 'Keep the note as it is' });
		await keepMine.focus();
		await page.keyboard.press('Enter');

		await expect
			.poll(() =>
				page.evaluate(() => {
					const mcp = window.__rt!.state.mcp as { proposals: Record<string, { status: string }> };
					return Object.values(mcp.proposals).every((p) => p.status !== 'pending');
				}),
			)
			.toBe(true);
		expect(await noteBody(page, NOTE_TITLE)).toBe(HUMAN_BODY);
	});

	test('overlapping edits say so and offer no merge to take', async ({ page }) => {
		await seedConflict(page, HUMAN_SAME_LINE);

		await expect(
			page.getByText(
				'The assistant and the note changed the same lines, so there is no merge to offer.',
			),
		).not.toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Merge both' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: "Keep the assistant's version" })).toHaveCount(1);
	});
});
