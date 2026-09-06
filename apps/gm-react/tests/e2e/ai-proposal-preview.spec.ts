import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// RC-AI-2.1 — SEMANTIC DIFF PREVIEW FOR PROPOSALS. A staged write used to read as
// "content.update-item · note.update · durable", which tells a DM nothing about what approving it
// would do. These specs drive a REAL staged proposal through the Core agent pipeline and assert the
// review panel now states the change in plain language: what it updates, how many lines move, the
// before/after values, and which wikilinks the rewrite adds or drops. The preview is read-only —
// approving remains an explicit, separate click (AI proposes, never disposes).

const NOTE_TITLE = 'Ashfall Keep';
const ORIGINAL_BODY = '# Ashfall\nThe keep still stands.\nIt is guarded by [[Sera Vance]].';
const PROPOSED_BODY = '# Ashfall\nThe keep is a ruin.\nIt is held by [[Iron Pact]].';

/** Run one agent tool call through the DEV runtime seam (the same path the assistant panel uses). */
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

/** Seed a note, turn on agent access, and stage a rewrite of that note as a pending proposal. */
async function stageNoteRewrite(page: Page): Promise<void> {
	await markOnboarded(page);
	await page.addInitScript(() => {
		localStorage.setItem('dndtools.ai.usage-preference', 'complete');
	});
	await gotoRoute(page, '/settings?tab=ai');
	await seedFresh(page);
	await waitReady(page);

	const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
	expect(
		(
			await dispatch(page, {
				type: 'content.create-item',
				actorId,
				payload: { kind: 'note', title: NOTE_TITLE, body: ORIGINAL_BODY, visibility: 'dm-only' },
			})
		).status,
	).toBe('accepted');
	expect(
		(await dispatch(page, { type: 'mcp.set-enabled', actorId, payload: { enabled: true } })).status,
	).toBe('accepted');
	expect(
		(
			await dispatch(page, {
				type: 'mcp.set-agent-binding',
				actorId,
				payload: { agentId: 'prep-assistant', actorId, label: 'Prep' },
			})
		).status,
	).toBe('accepted');
	expect(
		(
			await dispatch(page, {
				type: 'mcp.set-agent-policy',
				actorId,
				payload: {
					agentId: 'prep-assistant',
					mode: 'strict_review',
					allowedToolIds: ['note.update'],
				},
			})
		).status,
	).toBe('accepted');

	const item = await page.evaluate((title) => {
		const content = window.__rt!.state.content as {
			items: Record<string, { id: string; title: string; revision: number }>;
		};
		return Object.values(content.items).find((i) => i.title === title)!;
	}, NOTE_TITLE);

	const result = await invokeAgentTool(page, {
		agentId: 'prep-assistant',
		toolId: 'note.update',
		input: { itemId: item.id, baseRevision: item.revision, body: PROPOSED_BODY },
	});
	expect(result.status).toBe('staged');

	// Land on the AI tab with the proposal already pending.
	await page.goto('/#/settings?tab=ai', { waitUntil: 'domcontentloaded' });
	await waitReady(page);
	await page.locator('#main-content').waitFor({ state: 'attached' });
}

test.describe('ai proposals: semantic diff preview (RC-AI-2.1)', () => {
	test('a staged rewrite states what it changes and how many lines move', async ({ page }) => {
		await stageNoteRewrite(page);

		// The review row leads with the change in plain language, not the command type alone.
		await expect(page.getByText(`Updates ${NOTE_TITLE}.`, { exact: true })).not.toHaveCount(0);
		// Two lines swapped for two: the delta counts the change, not the whole note.
		await expect(page.getByText('2 lines added, 2 removed', { exact: true })).not.toHaveCount(0);
		// Nothing committed — the proposal is still pending its explicit approval.
		await expect(page.getByRole('button', { name: 'Approve' })).not.toHaveCount(0);
		expect(
			await page.evaluate(() => {
				const mcp = window.__rt!.state.mcp as {
					proposals: Record<string, { status: string }>;
				};
				return Object.values(mcp.proposals).every((p) => p.status === 'pending');
			}),
		).toBe(true);
	});

	test('the detail discloses the before/after body and the wikilinks the rewrite moves', async ({
		page,
	}) => {
		await stageNoteRewrite(page);

		// The detail is collapsed by default so the approve/reject controls stay reachable.
		await expect(page.getByText('Links added', { exact: true })).toHaveCount(0);
		const disclosure = page.getByRole('button', { name: 'Show changes' }).first();
		await expect(disclosure).toHaveAttribute('aria-expanded', 'false');

		await disclosure.click();

		await expect(page.getByText(/Now: .*The keep still stands\./)).not.toHaveCount(0);
		await expect(page.getByText(/Proposed: .*The keep is a ruin\./)).not.toHaveCount(0);
		await expect(page.getByText('Links added', { exact: true })).not.toHaveCount(0);
		await expect(page.getByText('Iron Pact', { exact: true })).not.toHaveCount(0);
		await expect(page.getByText('Links removed', { exact: true })).not.toHaveCount(0);
		await expect(page.getByText('Sera Vance', { exact: true })).not.toHaveCount(0);
	});

	test('the disclosure works from the keyboard alone', async ({ page }) => {
		await stageNoteRewrite(page);

		const disclosure = page.getByRole('button', { name: 'Show changes' }).first();
		await disclosure.focus();
		await page.keyboard.press('Enter');

		await expect(page.getByRole('button', { name: 'Hide changes' }).first()).toHaveAttribute(
			'aria-expanded',
			'true',
		);
		await expect(page.getByText('Links added', { exact: true })).not.toHaveCount(0);
	});
});
