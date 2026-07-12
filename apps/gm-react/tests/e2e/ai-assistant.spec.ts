import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, ops, seedFresh, waitReady } from './_helpers';

// AI ASSISTANT — the client-side, BYO-key provider transport (ADR-021, closing the ADR-014 deferral),
// driven through Settings → AI & tools. The provider key is the USER'S OWN, held device-local (memory
// + sessionStorage; OS-encrypted store on desktop) and NEVER written to the vault, the op-log, or
// cloud sync. The whole AI surface is fail-closed TWICE over: no key ⇒ every AI surface is off, and
// MCP is a durable master switch that starts OFF. These specs assert PRE-SEND GATING ONLY — they set
// a fake key and drive the prerequisite chain, but never click "Ask", and a route guard proves no
// request ever reaches a provider endpoint (the e2e server is fail-closed, but we assert it too).

/** Every provider endpoint either transport could ever call — aborted AND counted so a spec can
 *  prove offline behaviour (a real send would hit /v1/messages or /chat/completions). */
async function guardProviderNetwork(page: Page): Promise<() => number> {
	let hits = 0;
	await page.route(/api\.anthropic\.com|\/v1\/messages|\/chat\/completions/, (route) => {
		hits += 1;
		return route.abort();
	});
	return () => hits;
}

/** Navigate to the AI & tools settings subpage (deep-linked via `?tab=ai`). */
async function gotoAiTab(page: Page): Promise<void> {
	await markOnboarded(page);
	await gotoRoute(page, '/settings?tab=ai');
	await seedFresh(page);
	await page.goto('/#/settings?tab=ai', { waitUntil: 'domcontentloaded' });
	await waitReady(page);
	await page.locator('#main-content').waitFor({ state: 'attached' });
}

const FAKE_KEY = 'sk-e2e-fake-not-a-real-key-000';

test.describe('ai assistant: client-side BYO-key provider (ADR-021)', () => {
	test('with no key configured the assistant is fail-closed — no dead send affordance', async ({ page }) => {
		const hits = await guardProviderNetwork(page);
		await gotoAiTab(page);

		// The provider panel is honestly "Not configured" out of the box (this build ships no key).
		await expect(page.getByText('Not configured', { exact: true })).not.toHaveCount(0);
		await expect(page.getByText('Configured', { exact: true })).toHaveCount(0);

		// The assistant states the FIRST unmet prerequisite plainly instead of offering a control.
		await expect(page.getByText('Add a provider API key above to turn the assistant on.')).not.toHaveCount(0);

		// Fail closed: with no key there is NO ask box and NO send button that could hit the network.
		await expect(page.getByRole('textbox', { name: 'Ask the assistant' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Ask' })).toHaveCount(0);

		// Nothing reached out (the surface is off before any transport could be constructed).
		expect(hits()).toBe(0);
	});

	test('entering a key reflects a device-local "key set" state with no network request', async ({ page }) => {
		const hits = await guardProviderNetwork(page);
		await gotoAiTab(page);

		const beforeOps = await ops(page);

		// Real UI: paste a key into the provider panel and save it.
		await page.getByLabel('Provider API key').fill(FAKE_KEY);
		await page.getByRole('button', { name: 'Save key' }).click();

		// The panel flips to "Configured" and the assistant's blocker advances PAST the key gate to the
		// next honest prerequisite (MCP is still the durable master switch, and it starts OFF).
		await expect(page.getByText('Configured', { exact: true })).not.toHaveCount(0);
		await expect(page.getByText('Add a provider API key above to turn the assistant on.')).toHaveCount(0);
		await expect(page.getByText('Enable MCP above — the master switch gates every agent capability.')).not.toHaveCount(0);

		// KEY CUSTODY: the key lives in sessionStorage (device-local, tab-scoped) — NOT in localStorage
		// settings, NOT in the durable op-log, NOT anywhere in Core state (SEC: never syncs off-device).
		const sessionKey = await page.evaluate(() => sessionStorage.getItem('dndtools.ai.provider-key'));
		expect(sessionKey).toBe(FAKE_KEY);
		const settingsRaw = await page.evaluate(() => localStorage.getItem('dndtools.ai.provider-settings') ?? '');
		expect(settingsRaw).not.toContain(FAKE_KEY);
		const stateHasKey = await page.evaluate((k) => JSON.stringify(window.__rt!.state).includes(k), FAKE_KEY);
		expect(stateHasKey).toBe(false);
		// Saving a key is NOT a Core command — the durable op-log did not grow.
		expect(await ops(page)).toBe(beforeOps);

		// Absolutely no provider call was made — configuring a key is pure pre-send state.
		expect(hits()).toBe(0);

		// Device-local custody survives a reload (sessionStorage persists within the tab) without ever
		// going to the network — the assistant is still configured, still fail-closed on MCP.
		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await expect(page.getByText('Configured', { exact: true })).not.toHaveCount(0);
		expect(hits()).toBe(0);
	});

	test('the assistant activates only when every prerequisite is real, and staged review is honestly empty', async ({ page }) => {
		const hits = await guardProviderNetwork(page);
		await gotoAiTab(page);

		const actorId = await page.evaluate(() => window.__rt!.defaultActorId);

		// The staged-write review panel is honestly empty — nothing an agent does commits without the DM.
		await expect(page.getByText(/Nothing staged\./)).not.toHaveCount(0);
		// And the MCP page is honest that no transport "connects" — it is the real durable policy registry.
		await expect(page.getByText(/no AI provider or agent transport ships in this build/)).not.toHaveCount(0);

		// Turn on the two Core-side prerequisites the assistant gates on (durable, owner-only writes):
		// the MCP master switch, and one registered agent binding (names WHICH actor the agent speaks as).
		const bindingActorId = await page.evaluate(() => {
			const actors = window.__rt!.actors;
			return (actors.find((a) => a.role === 'player') ?? actors[0]).id;
		});
		expect((await dispatch(page, { type: 'mcp.set-enabled', actorId, payload: { enabled: true } })).status).toBe('accepted');
		expect(
			(
				await dispatch(page, {
					type: 'mcp.set-agent-binding',
					actorId,
					payload: { agentId: 'prep-assistant', actorId: bindingActorId, label: 'Prep' },
				})
			).status,
		).toBe('accepted');

		// The last prerequisite is the provider key — set it through the real UI.
		await page.getByLabel('Provider API key').fill(FAKE_KEY);
		await page.getByRole('button', { name: 'Save key' }).click();
		await expect(page.getByText('Configured', { exact: true })).not.toHaveCount(0);

		// Now every prerequisite is real, so the assistant EXPOSES its ask box + send button — no blocker.
		await expect(page.getByText('Add a provider API key above to turn the assistant on.')).toHaveCount(0);
		await expect(page.getByText('Enable MCP above — the master switch gates every agent capability.')).toHaveCount(0);
		await expect(page.getByRole('textbox', { name: 'Ask the assistant' })).not.toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Ask' })).not.toHaveCount(0);

		// We deliberately do NOT click Ask (that would call the provider). Assert pre-send gating held:
		// enabling the whole surface reached out to nothing.
		expect(hits()).toBe(0);
	});
});
