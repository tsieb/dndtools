import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// RC-AUD-3.2 — SFX EVENTS. A table moment (a natural 20, a natural 1, a death save, a map reveal, a
// delivered handout) fires the DM's armed audio automation as a one-shot sound effect, and each event
// has its own durable switch. Driven through the REAL app: a real declared source, a rule created
// through the core, a real recorded roll, and the Audio screen's own readout. Nothing here asserts that
// audio actually SOUNDS — the e2e browser plays no bytes; it asserts what the app says it did.

/** A declared web-stream source a `play` rule can name without importing any bytes. */
async function declareSource(page: Page): Promise<string> {
	const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
	const configured = await dispatch(page, {
		type: 'audio.configure-source',
		actorId,
		payload: {
			type: 'web-stream',
			displayName: 'E2E cue stream',
			url: 'https://stream.example.com/cue.mp3',
			cacheBehavior: 'cache-required',
		},
	});
	expect(configured.status, configured.rejection?.message ?? '').toBe('accepted');
	const sourceId = (configured.events ?? []).find((e) => e.kind === 'audio.source-configured')
		?.sourceId as string | undefined;
	expect(sourceId).toBeTruthy();
	return sourceId!;
}

/** Arm a `play` rule on one SFX event. */
async function armRule(page: Page, trigger: string, sourceId: string): Promise<void> {
	const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
	const created = await dispatch(page, {
		type: 'audio.configure-automation',
		actorId,
		payload: { label: `Cue on ${trigger}`, trigger, action: 'play', sourceId, assetId: null },
	});
	expect(created.status, created.rejection?.message ?? '').toBe('accepted');
}

/** Take the session live so dice can be rolled, as the DM would. */
async function goLive(page: Page): Promise<void> {
	const result = await page.evaluate(async () => {
		const rt = window.__rt!;
		const state = rt.state as unknown as {
			session: { activeSceneId: string | null };
			commandCenter: { homeSceneId: string | null };
			scenes: { scenes: Record<string, { id: string; isTemplate?: boolean }> };
		};
		const sceneId =
			state.session.activeSceneId ??
			state.commandCenter.homeSceneId ??
			Object.values(state.scenes.scenes).find((s) => !s.isTemplate)?.id;
		return rt.dispatch({
			type: 'session.set-workflow',
			actorId: rt.defaultActorId,
			payload: { workflow: 'active', activeSceneId: sceneId },
		});
	});
	expect(result.status, result.rejection?.message ?? '').toBe('accepted');
}

/** Open the Audio screen's Automation tab. */
async function openAutomationTab(page: Page): Promise<void> {
	await page.goto('/#/audio', { waitUntil: 'domcontentloaded' });
	await waitReady(page);
	await page.getByRole('tab', { name: 'Automation' }).click();
	await expect(page.getByRole('heading', { name: 'Sound effects', exact: true })).toBeVisible({
		timeout: 10_000,
	});
}

test.describe('SFX events: a table moment fires its cue', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/session');
		await seedFresh(page);
		await gotoRoute(page, '/session');
		await goLive(page);
	});

	test('a natural 20 fires the armed cue, and the Audio screen says it played', async ({
		page,
	}) => {
		const sourceId = await declareSource(page);
		await armRule(page, 'roll-critical-success', sourceId);

		// Seed chosen offline against `rollExpression` so a bare `1d20` lands a natural 20 — the same
		// deterministic seed dice-tray.spec.ts uses, so this never depends on chance.
		const nat20 = await dispatch(page, {
			type: 'dice.roll',
			actorId: 'dm-1',
			payload: { expression: '1d20', seed: 'seed-12' },
		});
		expect(nat20.status, nat20.rejection?.message ?? '').toBe('accepted');
		await expect(page.getByText('Natural 20', { exact: false }).first()).toBeVisible();

		await openAutomationTab(page);
		const recent = page.getByTestId('sfx-recent');
		await expect(recent).toContainText('Natural 20');
		await expect(recent).toContainText('Played');
	});

	test('switching the event off keeps the rule but silences the cue', async ({ page }) => {
		const sourceId = await declareSource(page);
		await armRule(page, 'roll-critical-success', sourceId);
		await openAutomationTab(page);

		await page.getByRole('switch', { name: 'Play a sound on Natural 20' }).click();
		await expect(page.getByTestId('sfx-events').getByText('Turned off').first()).toBeVisible();

		const nat20 = await dispatch(page, {
			type: 'dice.roll',
			actorId: 'dm-1',
			payload: { expression: '1d20', seed: 'seed-12' },
		});
		expect(nat20.status, nat20.rejection?.message ?? '').toBe('accepted');

		const recent = page.getByTestId('sfx-recent');
		await expect(recent).toContainText('Natural 20');
		await expect(recent).toContainText('Turned off');
		// The rule itself survives the mute — switching the event back on plays it again.
		const rules = await page.evaluate(
			() =>
				Object.keys((window.__rt!.state.audio as { automationRules: object }).automationRules)
					.length,
		);
		expect(rules).toBe(1);
	});

	test('with no rule armed, the event reports itself instead of pretending', async ({ page }) => {
		const nat1 = await dispatch(page, {
			type: 'dice.roll',
			actorId: 'dm-1',
			payload: { expression: '1d20', seed: 'seed1-1' },
		});
		expect(nat1.status, nat1.rejection?.message ?? '').toBe('accepted');

		await openAutomationTab(page);
		const recent = page.getByTestId('sfx-recent');
		await expect(recent).toContainText('Natural 1');
		await expect(recent).toContainText('No rule armed');
	});
});
