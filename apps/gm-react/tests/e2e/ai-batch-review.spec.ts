import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// RC-AI-2.4 — BATCH REVIEW WITH GROUPING AND FILTERS. The staged-writes panel groups pending proposals
// by the agent that staged them and adds an agent filter over that grouping, plus a checkbox selection
// that batches approve/reject as a SEQUENCE of the same `mcp.approve-proposal` / `mcp.reject-proposal`
// commands the single-row buttons already dispatch — no new command, no new write path. These specs
// stage several `note.create` proposals (which never conflict — each creates a fresh item) from two
// agents and drive the real grouping, filtering, and batch controls.

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

/** Two agents, each staging note-create proposals — three from "prep-assistant", one from "scout-bot". */
async function seedBatch(page: Page): Promise<void> {
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

	await ok({ type: 'mcp.set-enabled', actorId, payload: { enabled: true } });
	for (const [agentId, label] of [
		['prep-assistant', 'Prep'],
		['scout-bot', 'Scout'],
	] as const) {
		await ok({
			type: 'mcp.set-agent-binding',
			actorId,
			payload: { agentId, actorId, label },
		});
		await ok({
			type: 'mcp.set-agent-policy',
			actorId,
			payload: { agentId, mode: 'strict_review', allowedToolIds: ['note.create'] },
		});
	}

	for (const title of ['Rumor: bandits on the pass', 'Rumor: a sealed well']) {
		const staged = await invokeAgentTool(page, {
			agentId: 'prep-assistant',
			toolId: 'note.create',
			input: { title, kind: 'note' },
		});
		expect(staged.status).toBe('staged');
	}
	const scoutStaged = await invokeAgentTool(page, {
		agentId: 'scout-bot',
		toolId: 'note.create',
		input: { title: 'Sighting: patrol route', kind: 'note' },
	});
	expect(scoutStaged.status).toBe('staged');

	await page.goto('/#/settings?tab=ai', { waitUntil: 'domcontentloaded' });
	await waitReady(page);
	await page.locator('#main-content').waitFor({ state: 'attached' });
}

function stagedPanel(page: Page) {
	return page
		.locator('section')
		.filter({ has: page.getByRole('heading', { name: 'Staged writes awaiting review' }) });
}

test.describe('ai batch review: grouping and filters (RC-AI-2.4)', () => {
	test('groups pending proposals by agent and filters by agent', async ({ page }) => {
		await seedBatch(page);
		const panel = stagedPanel(page);

		await expect(panel.getByText('Prep · 2')).not.toHaveCount(0);
		await expect(panel.getByText('Scout · 1')).not.toHaveCount(0);

		await panel.getByLabel('Filter staged writes by agent').selectOption('scout-bot');
		await expect(panel.getByText('Sighting: patrol route')).not.toHaveCount(0);
		await expect(panel.getByText('Prep · 2')).toHaveCount(0);
	});

	test('filters to nothing when no proposal matches the risk filter', async ({ page }) => {
		await seedBatch(page);
		const panel = stagedPanel(page);

		// Every baseline write tool is `durable`, so narrowing to low-risk leaves nothing.
		await panel.getByRole('radio', { name: 'Low risk', exact: true }).click();
		await expect(panel.getByText('No staged writes match these filters.')).not.toHaveCount(0);

		await panel.getByRole('radio', { name: 'Durable', exact: true }).click();
		await expect(panel.getByText('Rumor: bandits on the pass')).not.toHaveCount(0);
	});

	test('approves a batch selection in one action and leaves the rest pending', async ({ page }) => {
		await seedBatch(page);
		const panel = stagedPanel(page);

		await panel
			.getByRole('checkbox', { name: 'Select the note.create proposal from Prep' })
			.first()
			.click();
		await expect(panel.getByText('1 selected')).not.toHaveCount(0);

		await panel.getByRole('button', { name: 'Approve selected' }).click();

		await expect(page.getByText(/1 proposals? approved and committed\./)).not.toHaveCount(0);
		// Two proposals remain: one Prep note-create, and Scout's.
		await expect(panel.getByText('Prep · 1')).not.toHaveCount(0);
		await expect(panel.getByText('Scout · 1')).not.toHaveCount(0);

		const notes = await page.evaluate(() => {
			const content = window.__rt!.state.content as { items: Record<string, { title: string }> };
			return Object.values(content.items).map((i) => i.title);
		});
		expect(notes).toContain('Rumor: bandits on the pass');
	});

	test('rejects a batch selection in one action', async ({ page }) => {
		await seedBatch(page);
		const panel = stagedPanel(page);

		await panel.getByRole('checkbox', { name: 'Select all staged by Prep' }).click();
		await expect(panel.getByText('2 selected')).not.toHaveCount(0);

		await panel.getByRole('button', { name: 'Reject selected' }).click();

		await expect(page.getByText('2 proposals rejected.')).not.toHaveCount(0);
		// One proposal remains — too few to earn a group heading or batch toolbar (see
		// `showBatchControls` in AiBatchReview.tsx), but the row itself is still there.
		await expect(panel.getByText('Prep · 2')).toHaveCount(0);
		await expect(panel.getByText('scout-bot')).not.toHaveCount(0);

		const notes = await page.evaluate(() => {
			const content = window.__rt!.state.content as { items: Record<string, { title: string }> };
			return Object.values(content.items).map((i) => i.title);
		});
		expect(notes).not.toContain('Rumor: bandits on the pass');
		expect(notes).not.toContain('Rumor: a sealed well');
	});
});
