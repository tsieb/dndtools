import { expect, test, type Page } from '@playwright/test';
import type { CoreStateSlice } from '@dndtools/core';
import { dispatch, gotoRoute, markOnboarded, seedFresh } from './_helpers';

// RC-CAN-7.8 review regression: each tracker used to dispatch a durable turn advance for the same
// window keydown. Use three combatants so skipping a turn cannot hide behind wrapping the round.
async function duplicateTracker(page: Page) {
	await markOnboarded(page);
	await gotoRoute(page, '/session');
	await seedFresh(page);
	await expect(page.getByRole('button', { name: 'Build encounter', exact: true })).toBeVisible();
	return page.evaluate(async () => {
		const rt = window.__rt!;
		const state = rt.state as unknown as CoreStateSlice;
		const screen = Object.values(state.scenes.scenes).find((scene) =>
			scene.widgets.some(
				(widget) => widget.type === 'combat' && widget.configuration.view === 'tracker',
			),
		)!;
		const widget = screen.widgets.find((candidate) => candidate.type === 'combat')!;
		for (const command of [
			{
				type: 'scene.duplicate-widget',
				payload: { sceneId: screen.id, widgetInstanceId: widget.id },
			},
			{
				type: 'combat.start',
				payload: {
					combatants: [
						{ kind: 'monster', name: 'First', initiative: 20, maxHp: 20 },
						{ kind: 'monster', name: 'Second', initiative: 15, maxHp: 20 },
						{ kind: 'monster', name: 'Third', initiative: 10, maxHp: 20 },
					],
				},
			},
		]) {
			const result = await rt.dispatch({ ...command, actorId: rt.defaultActorId });
			if (result.status !== 'accepted') throw new Error(JSON.stringify(result));
		}
		return { sceneId: screen.id, widgetInstanceId: widget.id };
	});
}

function combat(page: Page) {
	return page.evaluate(() => {
		const state = window.__rt!.state as unknown as CoreStateSlice;
		return {
			turn: state.session.combat.turn,
			round: state.session.combat.round,
			log: state.session.combat.log,
		};
	});
}

test('duplicate trackers advance once per key and hand off after removing the first', async ({
	page,
}) => {
	const original = await duplicateTracker(page);
	await expect(page.getByRole('button', { name: 'End combat', exact: true })).toHaveCount(2);
	const before = await combat(page);
	await page.keyboard.press('n');
	await expect.poll(async () => (await combat(page)).turn).toBe(1);
	let after = await combat(page);
	expect(after.round).toBe(before.round);
	expect(after.log.slice(before.log.length).map((entry) => entry.kind)).toEqual(['turn-advanced']);
	await page.keyboard.press('p');
	await expect.poll(async () => (await combat(page)).turn).toBe(0);
	after = await combat(page);
	expect(after.log.slice(before.log.length).map((entry) => entry.kind)).toEqual([
		'turn-advanced',
		'turn-reverted',
	]);

	const result = await page.evaluate(
		async (payload) =>
			window.__rt!.dispatch({
				type: 'scene.destroy-widget',
				actorId: window.__rt!.defaultActorId,
				payload,
			}),
		original,
	);
	expect(result.status).toBe('accepted');
	await expect(page.getByRole('button', { name: 'End combat', exact: true })).toHaveCount(1);
	await page.keyboard.press('n');
	await expect.poll(async () => (await combat(page)).turn).toBe(1);
	expect((await combat(page)).log.slice(after.log.length).map((entry) => entry.kind)).toEqual([
		'turn-advanced',
	]);

	// Reload from durable storage: a second queued dispatch must not be concealed by a transient UI.
	await page.reload();
	await expect(page.getByRole('button', { name: 'End combat', exact: true })).toBeVisible();
	expect((await combat(page)).turn).toBe(1);
	expect((await combat(page)).log.slice(before.log.length).map((entry) => entry.kind)).toEqual([
		'turn-advanced',
		'turn-reverted',
		'turn-advanced',
	]);
});

test('duplicate trackers keep one selection and open one HP dialog', async ({ page }) => {
	await duplicateTracker(page);
	await expect(page.getByRole('button', { name: 'End combat', exact: true })).toHaveCount(2);
	await page.keyboard.press('ArrowDown');
	await expect(page.getByText('Selected · First', { exact: true })).toHaveCount(1);
	await page.keyboard.press('ArrowDown');
	await expect(page.getByText('Selected · Second', { exact: true })).toHaveCount(1);
	await expect(page.getByText('Selected · First', { exact: true })).toHaveCount(0);
	await page.keyboard.press('d');
	await expect(page.getByRole('dialog')).toHaveCount(1);
	const before = await combat(page);
	await page.keyboard.press('n');
	expect(await combat(page)).toEqual(before);
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await page.keyboard.press('h');
	await expect(page.getByRole('dialog')).toHaveCount(1);
});

for (const running of [false, true]) {
	test(`duplicate trackers consume each encounter launch once (${running ? 'running' : 'idle'})`, async ({
		page,
	}) => {
		const original = await duplicateTracker(page);
		if (!running) {
			const ended = await dispatch(page, { type: 'combat.end', actorId: 'dm-1', payload: {} });
			expect(ended.status).toBe('accepted');
		}
		const buttonName = running ? 'End combat' : 'Build encounter';
		await expect(page.getByRole('button', { name: buttonName, exact: true })).toHaveCount(2);

		async function launchAndCancel() {
			await page.keyboard.press('Control+k');
			const palette = page.getByRole('dialog', { name: 'Command palette' });
			await expect(palette.getByRole('combobox')).toBeFocused();
			await palette.getByRole('combobox').fill('Build encounter');
			await palette.getByRole('option', { name: 'Build encounter' }).click();
			await expect(palette).toHaveCount(0);
			// Count hidden dialogs too: two modal effects can make BOTH dialogs inert, so an
			// accessible-role count alone misses the original duplicate-consumer failure.
			await expect(page.getByRole('dialog', { includeHidden: true })).toHaveCount(1);
			const dialog = page.getByRole('dialog', { name: 'Build encounter' });
			await expect(dialog).toBeVisible();
			await dialog.getByLabel('Encounter title').fill('One usable encounter builder');
			await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
			await expect(page.getByRole('dialog', { includeHidden: true })).toHaveCount(0);
		}

		await launchAndCancel();
		await launchAndCancel(); // A fresh navigation is a fresh intent, even on the same route.
		await gotoRoute(page, '/characters');
		await launchAndCancel(); // Both trackers remount when a different route launches Session.
		const removed = await dispatch(page, {
			type: 'scene.destroy-widget',
			actorId: 'dm-1',
			payload: original,
		});
		expect(removed.status).toBe('accepted');
		await expect(page.getByRole('button', { name: buttonName, exact: true })).toHaveCount(1);
		await launchAndCancel(); // Removing the first consumer must not strand subsequent intents.
	});
}
