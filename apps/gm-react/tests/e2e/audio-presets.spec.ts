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

// AUDIO PRESETS — I11 S11.3 (AUDIO-014) the Presets tab of the `/audio` screen. The built-in atmosphere
// LIBRARY is a browsable catalog of TEMPLATE recipes (unbound layers, no shipped bytes); applying one
// reports the honest "bind sources first" state through the same AUDIO-009/004/010 gates as playback —
// it never guesses a track. A DM SAVES the live session audio as a named USER scene package, re-applies
// it (it drives the real session-audio model), and deletes it. Every mutation is DM-only. Behaviour is
// driven through the REAL UI (tab, apply/save/delete buttons) and asserted against `__rt.state` AND the
// visible surface; audio is NEVER asserted to actually sound (the e2e server plays a silent sample).

/** Loose user-preset shape read off `__rt.state.audio.presets` (raw). */
interface PresetLite {
	id: string;
	name: string;
	category: string;
	layers: unknown[];
}

function findUserPreset(page: Page, name: string): Promise<PresetLite | null> {
	return page.evaluate((n) => {
		const presets = (window.__rt!.state.audio as { presets: Record<string, PresetLite> }).presets;
		return Object.values(presets).find((p) => p.name === n) ?? null;
	}, name);
}

/** Set up a capturable, re-appliable primary track: a declared `web-stream` source with a bounded
 *  https URL (the demo seed plays a `data:` URI, which `buildAudioPreset` refuses as an unbounded ref).
 *  Playing it makes it the session's primary track, so the current audio is both saveable AND the saved
 *  package re-applies cleanly (the core gates never hit the network — the URL need not resolve). */
async function setupPlayableTrack(page: Page): Promise<void> {
	const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
	const configured = await dispatch(page, {
		type: 'audio.configure-source',
		actorId,
		payload: {
			type: 'web-stream',
			displayName: 'E2E Atmosphere Stream',
			url: 'https://stream.example.com/atmosphere.mp3',
			cacheBehavior: 'cache-required',
		},
	});
	expect(configured.status).toBe('accepted');
	const sourceId = (configured.events ?? []).find((e) => e.kind === 'audio.source-configured')
		?.sourceId as string | undefined;
	expect(sourceId).toBeTruthy();
	const played = await dispatch(page, {
		type: 'session.audio.play',
		actorId,
		payload: { sourceId, volume: 0.5, online: true },
	});
	expect(played.status).toBe('accepted');
}

/** Open the Presets tab and confirm the built-in library rendered. */
async function openPresetsTab(page: Page): Promise<void> {
	await page.getByRole('tab', { name: 'Presets' }).click();
	await expect(page.getByRole('heading', { name: 'Atmosphere library' })).toBeVisible({
		timeout: 10_000,
	});
}

test.describe('audio presets: atmosphere library + scene packages', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/audio');
		await seedFresh(page);
		await page.goto('/#/audio', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.locator('#main-content').waitFor({ state: 'attached' });
	});

	test('the Presets tab renders the built-in atmosphere library grouped by category', async ({
		page,
	}) => {
		await openPresetsTab(page);

		// The six declared categories head their groups (they also appear as save-form select options —
		// a count assertion tolerates both without a strict-mode collision).
		for (const category of ['Dungeon', 'Wilderness', 'Urban', 'Combat', 'Social', 'Mystical']) {
			await expect(page.getByText(category, { exact: true })).not.toHaveCount(0);
		}

		// Representative shipped recipes across categories prove the catalog itself rendered.
		for (const preset of [
			'Stone Corridor',
			'Flooded Cave',
			'Tavern',
			'Battle',
			'Formal Court',
			'Arcane Lab',
		]) {
			await expect(page.getByText(preset, { exact: true })).not.toHaveCount(0);
		}

		// A fresh vault has no user scene packages yet — the honest empty state, no invented rows.
		await expect(page.getByText('No scene packages yet.')).not.toHaveCount(0);
	});

	test('applying a built-in template preset reports the honest bind-sources-first state', async ({
		page,
	}) => {
		await openPresetsTab(page);
		const before = await ops(page);

		// A built-in preset's layers are unbound TEMPLATES: no layer resolves to a ready source, so apply
		// fails closed with the honest guidance — it never guesses a track. Assert the toast, not audio.
		await page.getByRole('button', { name: 'Apply Stone Corridor' }).click();
		await expect(page.getByText(/no layers bound to a ready audio source/)).toBeVisible({
			timeout: 10_000,
		});
		await expect(page.getByText(/Bind its layers to configured sources first/)).not.toHaveCount(0);

		// A rejected command appends no durable op — nothing was half-applied.
		expect(await ops(page)).toBe(before);
	});

	test('a saved scene package persists, re-applies as real session audio, and deletes', async ({
		page,
	}) => {
		await setupPlayableTrack(page);
		await openPresetsTab(page);

		const name = `Tavern Night ${Date.now()}`;

		// SAVE: capture the live track+ambience as a named user preset. The save handler AWAITS the
		// dispatch (persist) before clearing the name field — the emptied input is the post-persist barrier.
		await page.getByLabel('Package name').fill(name);
		await page.getByRole('button', { name: 'Save current audio' }).click();
		await expect(page.getByText(/as a scene package/)).toBeVisible({ timeout: 10_000 });
		await expect(page.getByLabel('Package name')).toHaveValue('', { timeout: 10_000 });

		const saved = await findUserPreset(page, name);
		expect(saved).not.toBeNull();
		expect((saved!.layers as unknown[]).length).toBeGreaterThan(0);
		await expect(page.getByText('1 package')).not.toHaveCount(0);
		await expect(page.getByText(name, { exact: true })).not.toHaveCount(0);

		// Reload-persistence: the saved package is a durable op-log transaction (the tab resets on reload).
		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await openPresetsTab(page);
		expect((await findUserPreset(page, name))?.id).toBe(saved!.id);
		await expect(page.getByText(name, { exact: true })).not.toHaveCount(0);

		// APPLY: this user package's layer IS bound to a ready web-stream source, so it drives the real
		// session-audio model — accepted, with a durable op (unlike the unbound built-in templates).
		const beforeApply = await ops(page);
		await page.getByRole('button', { name: `Apply ${name}` }).click();
		await expect(page.getByText(/Applied/)).toBeVisible({ timeout: 10_000 });
		expect(await ops(page)).toBeGreaterThan(beforeApply);

		// DELETE: removes the user package (the delete toast is shown after the awaited persist).
		await page.getByRole('button', { name: `Delete ${name}` }).click();
		await expect(page.getByText(/Deleted/)).toBeVisible({ timeout: 10_000 });
		expect(await findUserPreset(page, name)).toBeNull();
		await expect(page.getByText(name, { exact: true })).toHaveCount(0);

		// The deletion is durable, not display state.
		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await openPresetsTab(page);
		expect(await findUserPreset(page, name)).toBeNull();
	});

	test('saving and applying presets is DM-only', async ({ page }) => {
		await openPresetsTab(page);

		// Core authority: a non-DM actor cannot apply a built-in preset or save the audio (fail closed).
		const applyAsPlayer = await dispatch(page, {
			type: 'session.audio.apply-preset',
			actorId: 'actor-player',
			payload: { presetId: 'builtin-preset-dungeon-stone-corridor', online: true },
		});
		expect(applyAsPlayer.status).toBe('rejected');
		const saveAsPlayer = await dispatch(page, {
			type: 'audio.save-preset',
			actorId: 'actor-player',
			payload: { name: 'Sneaky', category: 'dungeon' },
		});
		expect(saveAsPlayer.status).toBe('rejected');

		// Surface: previewing as a player replaces the save form with the honest DM-only note and disables
		// every apply affordance — no dead buttons a non-DM could press.
		await enterPreview(page, 'player');
		await expect(page.getByText(/Presets are DM-only/)).toBeVisible({ timeout: 10_000 });
		await expect(page.getByRole('button', { name: 'Apply Stone Corridor' })).toBeDisabled();
		await expect(page.getByRole('button', { name: 'Save current audio' })).toHaveCount(0);
		await exitPreview(page);
	});
	// The master volume fader is a `CommitSlider`: the thumb follows a local draft and the durable
	// `session.audio.set-volume` goes out once, on release, so a drag can't emit ~100 IndexedDB writes.
	// Two things used to make its ± steppers look dead:
	//  - `pointerup`/`keyup` both fire BEFORE a button's synthesized `click`, so a press always
	//    committed with `draft === null` and its value only left on the NEXT press or on blur.
	//  - the readout was computed by the caller from the DURABLE value while the thumb followed the
	//    draft, and `Slider` maps it to `aria-valuetext` (which overrides `aria-valuenow`), so the
	//    number froze for the whole interaction.
	test('the master volume stepper commits its own press and the readout follows the thumb', async ({
		page,
	}) => {
		await setupPlayableTrack(page);
		const slider = page.getByRole('slider', { name: 'Master volume' });
		await expect(slider).toBeEnabled({ timeout: 10_000 });
		await expect(slider).toHaveAttribute('aria-valuetext', '50%');

		// ONE press of "+" must produce exactly ONE durable command, with no blur and no second press.
		await page.getByRole('button', { name: 'Increase Master volume' }).click();
		await expect
			.poll(() => page.evaluate(() => window.__rt!.state.session.audioPlayback.track?.volume), {
				timeout: 10_000,
			})
			.toBe(0.51);
		await expect(slider).toHaveAttribute('aria-valuetext', '51%');

		// MID-INTERACTION the announced text must track the thumb, not the last committed value.
		// Holding ArrowRight down moves the range input without ever firing `keyup`, so the draft is
		// live and uncommitted at the moment we read — exactly the state that used to freeze the
		// readout. (A range input's `aria-valuenow` is IMPLICIT, so read the `value` property.)
		await slider.focus();
		await page.keyboard.down('ArrowRight');
		const [held, heldText] = await slider.evaluate((el) => [
			(el as HTMLInputElement).value,
			el.getAttribute('aria-valuetext'),
		]);
		await page.keyboard.up('ArrowRight');
		expect(Number(held), 'the draft should have moved past the committed 51').toBeGreaterThan(51);
		expect(heldText, 'the readout froze at the durable value for the whole interaction').toBe(
			`${held}%`,
		);
	});

	// "Unbind" sat on a row reading "N cues" but only ever removed `bound[0]`, so the DM pressed an
	// unchanging button once per cue; and neither it nor "Bind" was named for its scene.
	test('unbinding a scene clears every cue on it and both controls name their scene', async ({
		page,
	}) => {
		await setupPlayableTrack(page);
		const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
		const scene = await page.evaluate(() => {
			const scenes = window.__rt!.state.scenes.scenes as Record<
				string,
				{ id: string; name: string }
			>;
			return Object.values(scenes)[0]!;
		});
		// Sources are keyed BY source id and the record itself carries `id`, not `sourceId`.
		const sourceId = await page.evaluate(() => {
			const sources = window.__rt!.state.audio.sources as Record<string, { type: string }>;
			return Object.entries(sources).find(([, s]) => s.type === 'web-stream')![0];
		});
		for (const label of ['First cue', 'Second cue']) {
			const bound = await dispatch(page, {
				type: 'audio.associate-scene',
				actorId,
				payload: {
					targetKind: 'scene',
					targetId: scene.id,
					presetKind: 'ambient',
					label,
					sourceId,
				},
			});
			expect(bound.status, JSON.stringify(bound)).toBe('accepted');
		}

		const unbind = page.getByRole('button', { name: `Unbind audio from ${scene.name}` });
		await expect(unbind).toBeVisible({ timeout: 10_000 });
		await unbind.click();

		// One press, every cue gone — and the row flips to the correspondingly-named Bind control.
		await expect
			.poll(
				() =>
					page.evaluate((id) => {
						const list = window.__rt!.state.audio.associations as Record<
							string,
							{ targetKind: string; targetId: string }
						>;
						return Object.values(list).filter((a) => a.targetKind === 'scene' && a.targetId === id)
							.length;
					}, scene.id),
				{ timeout: 10_000 },
			)
			.toBe(0);
		await expect(page.getByRole('button', { name: `Bind audio to ${scene.name}` })).toBeVisible();
	});
});
