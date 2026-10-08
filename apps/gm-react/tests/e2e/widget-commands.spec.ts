import { builderStep } from './_widget-builder';
import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh } from './_helpers';

/**
 * WIDGET COMMANDS — RC-WID-6.1. A catalogue verb in the builder is only worth a button if the core
 * can run it. Before this story a builder-made action panel installed Roll and Advance, rendered
 * them, and then failed at the table with "has no reducer in this slice". Two paths, both through
 * the real builder and the real `widget.dispatch-command`:
 *
 * 1. A DM builds an action panel with Roll and Advance, installs and enables it, places it on a
 *    scene, and presses both in Standby (no session started): a dice result appears on the panel
 *    and lands in the session dice history, the counter moves, and no error banner shows.
 * 2. A blank command — one with nothing in the core to run it — is named on the Commands step and
 *    keeps Review from installing until the author picks what it runs.
 */

interface WidgetLite {
	id: string;
	type: string;
	configuration: Record<string, unknown>;
}

async function actorId(page: Page): Promise<string> {
	return page.evaluate(() => window.__rt!.defaultActorId);
}

async function openBuilder(page: Page) {
	await markOnboarded(page);
	await gotoRoute(page, '/extensions');
	await seedFresh(page);
	await page.getByRole('button', { name: 'Build a widget' }).click();
	const dialog = page.getByRole('dialog', { name: /Widget builder/ });
	await expect(dialog).toBeVisible();
	return dialog;
}

test.describe('widget commands: every catalogue verb runs (RC-WID-6.1)', () => {
	for (const surface of ['scene', 'board'] as const) {
		test(`a builder-made action panel rolls, advances and undoes in Standby on ${surface}`, async ({
			page,
			isMobile,
		}) => {
			const dialog = await openBuilder(page);
			await dialog.getByLabel('Name', { exact: true }).fill('Bell ringer');
			await builderStep(dialog, 'Data');
			await dialog.getByLabel('Template kind').selectOption('action-panel');
			await builderStep(dialog, 'Commands');
			await dialog.getByRole('button', { name: 'Roll dice', exact: true }).click();
			await dialog.getByRole('button', { name: 'Count up or down', exact: true }).click();
			await builderStep(dialog, 'Review');
			await dialog.getByRole('button', { name: 'Install widget' }).click();
			await expect(dialog).toHaveCount(0);

			// What was installed: each command names what runs it, and Roll brought its formula.
			const widget = await page.evaluate(
				() =>
					window.__rt!.state.widgets.packages['workspace.bell-ringer']?.package.widgets[0] as
						| {
								commands: Array<{ type: string; executor?: string }>;
								configFields?: Array<{ key: string; default?: unknown }>;
						  }
						| undefined,
			);
			expect(widget?.commands.map((command) => [command.type, command.executor])).toEqual([
				['bell-ringer.roll', 'roll'],
				['bell-ringer.advance', 'advance'],
			]);
			expect(widget?.configFields?.find((field) => field.key === 'formula')?.default).toBe('1d20');

			// RC-WID-6.2 — a template with no permission installs trusted and already on.
			await expect(page.getByRole('switch', { name: 'Enable Bell ringer' })).toBeChecked();
			await expect
				.poll(() =>
					page.evaluate(
						() => window.__rt!.state.widgets.packages['workspace.bell-ringer']?.enabled ?? false,
					),
				)
				.toBe(true);

			// ── Place it on a scene.
			const sceneName = `Bell Tower ${Date.now()}`;
			const created = await dispatch(page, {
				type: 'scene.create',
				actorId: await actorId(page),
				payload: { name: sceneName, description: '', visibility: 'dm-only', tags: [] },
			});
			expect(created.status, created.rejection?.message ?? '').toBe('accepted');
			let sceneId = await page.evaluate(
				(name) =>
					Object.values(window.__rt!.state.scenes.scenes).find((scene) => scene.name === name)
						?.id ?? null,
				sceneName,
			);
			if (surface === 'board') {
				const home = await dispatch(page, {
					type: 'command-center.ensure-home',
					actorId: await actorId(page),
					payload: {},
				});
				expect(home.status).toBe('accepted');
				sceneId = await page.evaluate(() => window.__rt!.state.commandCenter.homeSceneId);
			}
			expect(sceneId).toBeTruthy();
			const added = await dispatch(page, {
				type: 'scene.add-widget',
				actorId: await actorId(page),
				payload: {
					sceneId,
					widget: {
						type: 'bell-ringer',
						version: '1.0.0',
						layout: { x: 40, y: 40, w: 360, h: 240 },
						configuration: {},
						localState: {},
						binding: null,
					},
				},
			});
			expect(added.status, added.rejection?.message ?? '').toBe('accepted');
			const widgetOnScene = () =>
				page.evaluate(
					(id) =>
						(window.__rt!.state.scenes.scenes[id!]!.widgets as unknown as WidgetLite[]).find(
							(candidate) => candidate.type === 'bell-ringer',
						) ?? null,
					sceneId,
				);
			const widgetId = (await widgetOnScene())!.id;

			// ── Standby: the session was never started.
			expect(await page.evaluate(() => window.__rt!.state.session.workflow)).toBe('idle');
			await gotoRoute(page, surface === 'board' ? '/board' : `/scene/${sceneId}`);
			const panel = page.getByTestId(`widget-${widgetId}`);
			// A first click that is also the page's first gesture can land mid-relayout (the audio
			// autoplay retry); a key press takes the first gesture instead.
			await page.keyboard.press('Shift');

			const rollsBefore = await page.evaluate(() => window.__rt!.state.session.diceHistory.length);
			await panel.getByRole('button', { name: 'Roll', exact: true }).click();
			await expect(panel.getByText(/^Rolled 1d20: \d+$/)).toBeVisible();
			await expect
				.poll(() => page.evaluate(() => window.__rt!.state.session.diceHistory.length))
				.toBe(rollsBefore + 1);
			const roll = await page.evaluate(() => window.__rt!.state.session.diceHistory.at(-1)!);
			expect(roll.expression).toBe('1d20');
			await expect(panel.getByText(`Rolled 1d20: ${roll.total}`, { exact: true })).toBeVisible();

			await expect(panel.getByText('Count: 0', { exact: true })).toBeVisible();
			await panel.getByRole('button', { name: 'Advance', exact: true }).click();
			await expect(panel.getByText('Count: 1', { exact: true })).toBeVisible();
			await expect
				.poll(async () => (await widgetOnScene())?.configuration['executor.counter'])
				.toBe(1);

			// Consecutive presses must each keep their own inverse. Replaying old scene revisions
			// or idempotency keys would reject or silently skip the second undo/redo cycle.
			await panel.getByRole('button', { name: 'Advance', exact: true }).click();
			await expect(panel.getByText('Count: 2', { exact: true })).toBeVisible();
			await panel.getByRole('button', { name: 'Advance', exact: true }).focus();
			// The count paints before its write persists, and the history refuses an undo or redo while
			// the previous one is still replaying. Queue a no-op behind that write before each press.
			const settled = () =>
				page.evaluate(async () => {
					await window.__rt!.runExclusiveMaintenance(async () => undefined);
					await new Promise((resolve) => setTimeout(resolve, 0));
				});
			for (const count of [1, 0]) {
				await settled();
				if (isMobile) await page.getByRole('button', { name: /^Undo changed/ }).click();
				else await page.keyboard.press('Control+z');
				await expect(panel.getByText(`Count: ${count}`, { exact: true })).toBeVisible();
			}
			for (const count of [1, 2]) {
				await settled();
				if (isMobile) await page.getByRole('button', { name: /^Redo changed/ }).click();
				else await page.keyboard.press('Control+Shift+z');
				await expect(panel.getByText(`Count: ${count}`, { exact: true })).toBeVisible();
			}
			await settled();
			if (isMobile) await page.getByRole('button', { name: /^Undo changed/ }).click();
			else await page.keyboard.press('Control+z');
			await expect(panel.getByText('Count: 1', { exact: true })).toBeVisible();

			// No error banner, and still in Standby.
			await expect(page.getByRole('alert')).toHaveCount(0);
			await expect(page.locator('main')).not.toContainText('has no reducer');
			expect(await page.evaluate(() => window.__rt!.state.session.workflow)).toBe('idle');
		});
	}

	test('a blank command is named on the Commands step and cannot pass Review', async ({ page }) => {
		const dialog = await openBuilder(page);
		await dialog.getByLabel('Name', { exact: true }).fill('Blank panel');
		await builderStep(dialog, 'Data');
		await dialog.getByLabel('Template kind').selectOption('action-panel');
		await builderStep(dialog, 'Commands');
		await dialog.getByRole('button', { name: 'Add a blank command' }).click();

		const reason = 'Action 1 has nothing to run it at the table. Pick what it runs, or remove it.';
		await expect(dialog.getByText(reason).first()).toBeVisible();

		await builderStep(dialog, 'Review');
		await expect(dialog.getByRole('button', { name: 'Install widget' })).toBeDisabled();
		await expect(dialog.getByText(reason).first()).toBeVisible();
		await dialog.getByRole('button', { name: 'Go to Commands' }).first().click();

		// Picking what it runs clears the issue, and Review lets it through.
		await dialog.getByLabel('Runs', { exact: true }).selectOption('tick');
		await expect(dialog.getByText(reason)).toHaveCount(0);
		await builderStep(dialog, 'Review');
		await expect(dialog.getByRole('button', { name: 'Install widget' })).toBeEnabled();
		expect(
			await page.evaluate(
				() => window.__rt!.state.widgets.packages['workspace.blank-panel'] ?? null,
			),
		).toBeNull();
	});
});
