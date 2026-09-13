import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// RC-AUD-3.1 — COMBAT MUSIC AUTOMATION. A `combat-start`/`combat-end` automation rule (Audio ›
// Automation) now fires the instant combat actually starts/ends — no manual "Run now" click needed —
// dispatching the SAME durable `session.audio.play` / `session.audio.stop` commands a DM would use by
// hand. This spec proves the auto-fire end to end: configure a rule through the real UI, start/end
// combat through the Core (as combat.spec.ts does — reaching the tracker needs the session live
// first), and assert the session's actual playing track without any manual play/stop click.

async function goLiveAndStartCombat(page: Page): Promise<void> {
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
		const live = await rt.dispatch({
			type: 'session.set-workflow',
			actorId: rt.defaultActorId,
			payload: { workflow: 'active', activeSceneId: sceneId },
		});
		const outcome =
			live.status !== 'accepted'
				? { step: 'go live', result: live }
				: {
						step: 'start combat',
						result: await rt.dispatch({
							type: 'combat.start',
							actorId: rt.defaultActorId,
							payload: {
								combatants: [
									{ kind: 'monster', name: 'Bog Lurker', ac: 13, initiative: 18, maxHp: 22 },
								],
							},
						}),
					};
		// The automation driver queues its play command right behind `combat.start`, so settle from a
		// fresh task before returning, as `dispatch` in _helpers.ts does (RC-ENG-2.6).
		await new Promise((resolve) => setTimeout(resolve, 0));
		return {
			step: outcome.step,
			status: outcome.result.status,
			rejection: outcome.result.rejection,
		};
	});
	expect(result.status, `${result.step}: ${JSON.stringify(result.rejection ?? {})}`).toBe(
		'accepted',
	);
}

function track(page: Page): Promise<{ sourceId: string; status: string } | null> {
	return page.evaluate(
		() =>
			(
				window.__rt!.state.session as unknown as {
					audioPlayback: { track: { sourceId: string; status: string } | null };
				}
			).audioPlayback.track,
	);
}

test.describe('combat music automation: the rule fires on the real combat lifecycle', () => {
	test('a combat-start play rule and a combat-end stop rule fire automatically, with no manual play/stop', async ({
		page,
	}) => {
		await markOnboarded(page);
		await gotoRoute(page, '/audio');
		await seedFresh(page);
		await page.goto('/#/audio', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.locator('#main-content').waitFor({ state: 'attached' });

		const actorId = await page.evaluate(() => window.__rt!.defaultActorId);

		// A declared web-stream source needs no local asset bytes, so this spec exercises the driver's
		// dispatch path without depending on IndexedDB asset storage.
		const configured = await dispatch(page, {
			type: 'audio.configure-source',
			actorId,
			payload: {
				type: 'web-stream',
				displayName: 'Battle Theme',
				url: 'https://stream.example.com/battle.mp3',
				cacheBehavior: 'cache-required',
			},
		});
		expect(configured.status).toBe('accepted');
		const sourceId = (configured.events ?? []).find((e) => e.kind === 'audio.source-configured')
			?.sourceId as string | undefined;
		expect(sourceId).toBeTruthy();

		const startRule = await dispatch(page, {
			type: 'audio.configure-automation',
			actorId,
			payload: { trigger: 'combat-start', action: 'play', sourceId, assetId: null },
		});
		expect(startRule.status).toBe('accepted');
		const endRule = await dispatch(page, {
			type: 'audio.configure-automation',
			actorId,
			payload: { trigger: 'combat-end', action: 'stop', sourceId, assetId: null },
		});
		expect(endRule.status).toBe('accepted');

		// The Automation tab shows the armed rule as Ready — the SAME reactive resolution the driver
		// itself uses — before combat ever starts.
		await page.getByRole('tab', { name: 'Automation' }).click();
		// The rule's default label (`buildAudioAutomationRule`'s fallback: "<action> on <trigger>").
		await expect(page.getByText('play on combat-start')).toBeVisible();
		await expect(page.getByText('Ready').first()).toBeVisible();

		expect(await track(page)).toBeNull();

		await goLiveAndStartCombat(page);
		await expect
			.poll(async () => track(page), { timeout: 10_000 })
			.toMatchObject({ sourceId, status: 'playing' });

		const ended = await dispatch(page, { type: 'combat.end', actorId, payload: {} });
		expect(ended.status).toBe('accepted');
		await expect.poll(async () => track(page), { timeout: 10_000 }).toBeNull();
	});
});
