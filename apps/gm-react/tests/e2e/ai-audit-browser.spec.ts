import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// RC-AI-2.3 — AUDIT BROWSER + EXPORT. `McpAuditEntry` (MCP-011 AC2) already records every committed
// agent write attempt — staged for review, or committed direct — decision metadata only, never
// mutated content (a policy DENIAL leaves durable state, including the audit trail, untouched — see
// `agentDenied` in agent-dispatch.ts, so it never appears here). These specs drive one staged and one
// direct write through the real Core agent pipeline from two different agents, then assert the browser
// filters them by outcome and agent, and that "Export audit trail" fires a real download of the FULL
// trail (not a filtered slice) via the same `exportFile`-backed flow every other export in the app uses.

function invokeAgentTool(
	page: Page,
	invocation: { agentId: string; toolId: string; input: unknown; forceStageWrites?: boolean },
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

/** One STAGED write from "prep-assistant" (strict_review) and one committed DIRECT write from
 *  "scout-bot" (trusted_direct) — two audit entries across two agents and two outcomes. */
async function seedAuditTrail(page: Page): Promise<void> {
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
	await ok({
		type: 'mcp.set-agent-binding',
		actorId,
		payload: { agentId: 'prep-assistant', actorId, label: 'Prep' },
	});
	await ok({
		type: 'mcp.set-agent-policy',
		actorId,
		payload: { agentId: 'prep-assistant', mode: 'strict_review', allowedToolIds: ['note.create'] },
	});
	await ok({
		type: 'mcp.set-agent-binding',
		actorId,
		payload: { agentId: 'scout-bot', actorId, label: 'Scout' },
	});
	await ok({
		type: 'mcp.set-agent-policy',
		actorId,
		payload: { agentId: 'scout-bot', mode: 'trusted_direct', allowedToolIds: ['note.create'] },
	});

	const staged = await invokeAgentTool(page, {
		agentId: 'prep-assistant',
		toolId: 'note.create',
		input: { title: 'Rumor: bandits on the pass', kind: 'note' },
	});
	expect(staged.status).toBe('staged');

	// `trusted_direct` and allowlisted, with `forceStageWrites` left unset: commits immediately.
	const direct = await invokeAgentTool(page, {
		agentId: 'scout-bot',
		toolId: 'note.create',
		input: { title: 'Sighting: patrol route', kind: 'note' },
	});
	expect(direct.status).toBe('write');

	await page.goto('/#/settings?tab=ai', { waitUntil: 'domcontentloaded' });
	await waitReady(page);
	await page.locator('#main-content').waitFor({ state: 'attached' });
}

/** The audit browser's own `<section>` — the pending proposal ALSO shows a "note.create" tool id in
 *  the (separate) staged-writes panel above it, so every assertion below scopes to this panel. */
function auditPanel(page: Page) {
	return page
		.locator('section')
		.filter({ has: page.getByRole('heading', { name: 'Audit trail' }) });
}

test.describe('ai audit trail: browser + export (RC-AI-2.3)', () => {
	test('lists both outcomes and filters to one by outcome', async ({ page }) => {
		await seedAuditTrail(page);
		const panel = auditPanel(page);

		await expect(panel.getByText('Staged', { exact: true })).not.toHaveCount(0);
		await expect(panel.getByText('Committed', { exact: true })).not.toHaveCount(0);
		await expect(panel.getByText('Prep ·')).not.toHaveCount(0);
		await expect(panel.getByText('Scout ·')).not.toHaveCount(0);

		await panel.getByRole('radio', { name: 'Committed', exact: true }).click();
		await expect(panel.getByText('Prep ·')).toHaveCount(0);
		await expect(panel.getByText('Scout ·')).not.toHaveCount(0);
	});

	test('filters by agent', async ({ page }) => {
		await seedAuditTrail(page);
		const panel = auditPanel(page);

		await panel.getByLabel('Filter audit trail by agent').selectOption('prep-assistant');
		await expect(panel.getByText('Prep ·')).not.toHaveCount(0);
		// The second agent's entry is excluded once the filter narrows to the first.
		await expect(panel.getByText('Scout ·')).toHaveCount(0);
	});

	test('exporting fires a real download of the full trail, independent of the active filter', async ({
		page,
	}) => {
		await seedAuditTrail(page);
		const panel = auditPanel(page);

		// Narrow the view to one outcome before exporting.
		await panel.getByRole('radio', { name: 'Committed', exact: true }).click();
		await expect(panel.getByText('Prep ·')).toHaveCount(0);

		const downloadPromise = page.waitForEvent('download');
		await panel.getByRole('button', { name: 'Export audit trail' }).click();
		const download = await downloadPromise;

		expect(download.suggestedFilename()).toMatch(/^dndtools-ai-audit-\d{4}-\d{2}-\d{2}\.json$/);
		const path = await download.path();
		expect(path).not.toBeNull();
		const fs = await import('node:fs/promises');
		const raw = JSON.parse(await fs.readFile(path!, 'utf8')) as {
			entryCount: number;
			entries: { toolId: string; mode: string; agentId: string }[];
		};
		// The export is the WHOLE trail — both entries — even though the browser's own filter above
		// was narrowed to "Committed" only.
		expect(raw.entryCount).toBe(2);
		expect(raw.entries.map((e) => e.agentId).sort()).toEqual(['prep-assistant', 'scout-bot']);
		expect(raw.entries.map((e) => e.mode).sort()).toEqual(['direct', 'staged']);

		await expect(page.getByText('Audit trail exported.')).not.toHaveCount(0);
	});
});
