import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh } from './_helpers';

/**
 * COMBAT TILE — RC-CAN-5.3. The `initiative-tracker` widget on the board, on a phone, where it is
 * the whole tracker rather than a summary the DM has to leave the board to act on.
 *
 * The desk variant is unchanged and asserted here too, because "compact on a phone" is only true if
 * something else is true on a desktop.
 */

const ROW_MIN_HEIGHT = 56;

/** Go live on the home scene, place an initiative tracker on it, and roll a two-creature order. */
async function boardWithTracker(page: Page): Promise<void> {
	const result = await page.evaluate(async () => {
		const rt = window.__rt!;
		const state = rt.state as unknown as {
			session: { activeSceneId: string | null };
			commandCenter: { homeSceneId: string | null };
			scenes: { scenes: Record<string, { id: string; isTemplate?: boolean }> };
		};
		const sceneId =
			state.commandCenter.homeSceneId ??
			state.session.activeSceneId ??
			Object.values(state.scenes.scenes).find((s) => !s.isTemplate)?.id;
		const live = await rt.dispatch({
			type: 'session.set-workflow',
			actorId: rt.defaultActorId,
			payload: { workflow: 'active', activeSceneId: sceneId },
		});
		if (live.status !== 'accepted') return { step: 'go live', ...live };
		const placed = await rt.dispatch({
			type: 'scene.add-widget',
			actorId: rt.defaultActorId,
			payload: {
				sceneId,
				widget: {
					type: 'initiative-tracker',
					version: '1.0.0',
					layout: { x: 0, y: 0, w: 360, h: 320 },
					configuration: {},
					localState: {},
					binding: null,
				},
			},
		});
		if (placed.status !== 'accepted') return { step: 'place widget', ...placed };
		return {
			step: 'start combat',
			...(await rt.dispatch({
				type: 'combat.start',
				actorId: rt.defaultActorId,
				payload: {
					combatants: [
						{ kind: 'monster', name: 'Bog Lurker', ac: 13, initiative: 18, maxHp: 22 },
						{ kind: 'monster', name: 'Reed Stalker', ac: 12, initiative: 9, maxHp: 14 },
					],
				},
			})),
		};
	});
	expect(result.status, `${result.step}: ${JSON.stringify(result.rejection ?? {})}`).toBe(
		'accepted',
	);
}

/** Current HP of a combatant by name, read from the Core rather than from the pixels. */
function hpOf(page: Page, name: string): Promise<number | null> {
	return page.evaluate((who) => {
		const combat = (
			window.__rt!.state.session as unknown as {
				combat: {
					combatants: Record<string, { name: string; resources: { hp: number } | null }>;
				};
			}
		).combat;
		return Object.values(combat.combatants).find((c) => c.name === who)?.resources?.hp ?? null;
	}, name);
}

test.beforeEach(async ({ page }) => {
	await markOnboarded(page);
	await gotoRoute(page, '/board');
	await seedFresh(page);
	await boardWithTracker(page);
	await gotoRoute(page, '/board');
});

test.describe('touch-first combat tile', () => {
	test.skip(
		({ viewport }) => (viewport?.width ?? 1280) > 640,
		'the compact variant only draws on the phone tier',
	);

	test('the tile lists the order in rows a thumb can hit', async ({ page }) => {
		const tile = page.getByTestId('initiative-tile-compact');
		await expect(tile).toBeVisible();
		await expect(tile.getByText('Bog Lurker')).toBeVisible();
		await expect(tile.getByText('Reed Stalker')).toBeVisible();

		// 56px is the story's floor, and it is a floor for EVERY row, not an average.
		const rows = tile.getByRole('listitem');
		await expect(rows).toHaveCount(2);
		// LAYOUT height, not the on-screen box: the board canvas scales its tiles, and a scaled 56px
		// row is still a 56px row in the layout the DM zooms into.
		for (let i = 0; i < 2; i += 1) {
			const height = await rows.nth(i).evaluate((el) => (el as HTMLElement).offsetHeight);
			expect(height, `row ${i}`).toBeGreaterThanOrEqual(ROW_MIN_HEIGHT);
		}
	});

	test('tapping the hit points opens the keypad and a whole hit lands at once', async ({
		page,
	}) => {
		const tile = page.getByTestId('initiative-tile-compact');
		await tile.getByRole('button', { name: 'Adjust hit points — Bog Lurker' }).click();

		const sheet = page.getByRole('dialog');
		await expect(sheet).toBeVisible();
		await expect(sheet.getByText('Hit points — Bog Lurker')).toBeVisible();

		// 14 taps on "damage 1" is not a tracker; one amount, one verb.
		await sheet.getByRole('button', { name: 'Digit 1' }).click();
		await sheet.getByRole('button', { name: 'Digit 4' }).click();
		await sheet.getByRole('button', { name: 'Damage', exact: true }).click();

		await expect.poll(() => hpOf(page, 'Bog Lurker')).toBe(8);
		await expect(sheet).toBeHidden();
	});

	test('the quick actions are reachable without a swipe, and heal from the keyboard', async ({
		page,
	}) => {
		await dispatch(page, {
			type: 'combat.apply-resource',
			actorId: await page.evaluate(() => window.__rt!.defaultActorId),
			payload: {
				combatantId: await page.evaluate(
					() =>
						Object.values(
							(
								window.__rt!.state.session as unknown as {
									combat: { combatants: Record<string, { id: string; name: string }> };
								}
							).combat.combatants,
						).find((c) => c.name === 'Reed Stalker')!.id,
				),
				kind: 'hp',
				delta: -10,
			},
		});
		await expect.poll(() => hpOf(page, 'Reed Stalker')).toBe(4);

		const tile = page.getByTestId('initiative-tile-compact');
		// The swipe is a shortcut; this is the same tray, opened from the tab order.
		const more = tile.getByRole('button', { name: 'More actions — Reed Stalker' });
		await more.focus();
		await page.keyboard.press('Enter');

		const heal = tile.getByRole('button', { name: 'Heal', exact: true });
		await expect(heal).toBeVisible();
		await heal.focus();
		await page.keyboard.press('Enter');

		const sheet = page.getByRole('dialog');
		await expect(sheet).toBeVisible();
		// The sheet takes typed digits too, so the keypad is never the only way to enter an amount.
		await page.keyboard.press('6');
		await sheet.getByRole('button', { name: 'Heal', exact: true }).click();
		await expect.poll(() => hpOf(page, 'Reed Stalker')).toBe(10);
	});

	test('a swipe left on a row reveals the same quick actions', async ({ page }) => {
		const tile = page.getByTestId('initiative-tile-compact');
		const row = tile.getByRole('listitem').first();
		const box = await row.boundingBox();
		expect(box).not.toBeNull();
		const y = box!.y + box!.height / 2;
		// A real finger: down, several moves, up — one jump would never cross the slop threshold.
		await page.mouse.move(box!.x + box!.width - 12, y);
		await page.dispatchEvent(
			`[data-testid="initiative-tile-compact"] li:nth-child(1)`,
			'pointerdown',
			{
				pointerType: 'touch',
				clientX: box!.x + box!.width - 12,
				clientY: y,
			},
		);
		for (const step of [20, 45, 80]) {
			await page.dispatchEvent(
				`[data-testid="initiative-tile-compact"] li:nth-child(1)`,
				'pointermove',
				{ pointerType: 'touch', clientX: box!.x + box!.width - 12 - step, clientY: y },
			);
		}
		await page.dispatchEvent(
			`[data-testid="initiative-tile-compact"] li:nth-child(1)`,
			'pointerup',
			{
				pointerType: 'touch',
				clientX: box!.x + box!.width - 92,
				clientY: y,
			},
		);

		await expect(tile.getByRole('button', { name: 'Damage', exact: true })).toBeVisible();
		await expect(tile.getByRole('button', { name: 'Heal', exact: true })).toBeVisible();
	});
});

test.describe('desk tile', () => {
	test.skip(
		({ viewport }) => (viewport?.width ?? 1280) <= 640,
		'the summary variant is what a desktop draws',
	);

	test('stays the glanceable readout it was', async ({ page }) => {
		await expect(page.getByTestId('initiative-tile-compact')).toHaveCount(0);
		await expect(page.getByText('Round').first()).toBeVisible();
	});
});
