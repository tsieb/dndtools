// Run from repository root: pnpm exec tsx state/RC-CAN-7.5/capture-combat.ts
// Requires isolated, cloud-disabled Vite at PARITY_URL (default below).
// Live combat conditional controls (SE-11/SE-42–SE-44) and the board Initiative tile (BD-21/BD-29–BD-31).
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
	markOnboarded,
	gotoRoute,
	enterPreview,
	exitPreview,
} from '../../apps/gm-react/tests/e2e/_helpers';
const require = createRequire(new URL('../../apps/gm-react/package.json', import.meta.url));
const { chromium, expect } = require('@playwright/test');
const browser = await chromium.launch({ headless: true });
const baseURL = process.env.PARITY_URL ?? 'http://127.0.0.1:15751';
type Combatant = {
	name: string;
	resources: {
		hp: number;
		conditions: string[];
		concentration: { effect: string | null; check: unknown };
		deathSaves: { successes: number; failures: number };
	};
};
try {
	for (const [tier, width, height] of [
		['desktop', 1440, 900],
		['rail', 900, 800],
		['phone', 390, 844],
	] as const) {
		for (const theme of ['tavern', 'parchment', 'high-contrast']) {
			// A 390px phone renders at device scale 3; CSS layout and ARIA are unchanged, but the
			// board tile (about 120x80 CSS px at Fit) is otherwise an illegible image.
			const context = await browser.newContext({
				baseURL,
				viewport: { width, height },
				deviceScaleFactor: tier === 'phone' ? 3 : 1,
			});
			const page = await context.newPage();
			await markOnboarded(page);
			await page.addInitScript('window.__name = (fn) => fn;');
			await page.addInitScript(
				(theme: string) => localStorage.setItem('dndtools:react:theme', theme),
				theme,
			);
			// Dialogs overlay the page, so their image is the viewport; panels use an element image.
			const capture = async (
				state: string,
				scope: { ariaSnapshot(): Promise<string>; screenshot(o: object): Promise<Buffer> },
				whole = false,
			) => {
				const name = `refresh-${state}-${tier}-${theme}`;
				writeFileSync(`state/RC-CAN-7.5/aria/${name}.yaml`, (await scope.ariaSnapshot()) + '\n');
				const png = await (whole ? page : scope).screenshot({ animations: 'disabled' });
				execFileSync(
					'magick',
					['png:-', '-define', 'webp:lossless=true', `state/RC-CAN-7.5/screens/${name}.webp`],
					{ input: png },
				);
				console.log(name);
			};
			const combatant = (name: string) =>
				page.evaluate(
					(who: string) =>
						Object.values(
							(
								window.__rt!.state.session as unknown as {
									combat: { combatants: Record<string, Combatant> };
								}
							).combat.combatants,
						).find((c) => c.name === who)!.resources,
					name,
				);

			// Live combat through accepted Core commands, as combat.spec.ts does: Bog Lurker
			// concentrates on Blur, takes 1 damage (check owed) and is Poisoned for two rounds; Reed
			// Stalker is kept at 0 HP, not defeated (dying); Marsh Wisp is hidden from players.
			await gotoRoute(page, '/session');
			await expect(page.getByRole('radiogroup', { name: 'Session phase' })).toBeVisible();
			await page.evaluate(async () => {
				const rt = window.__rt!;
				const actorId = rt.defaultActorId;
				const send = async (type: string, payload: unknown) => {
					const r = await rt.dispatch({ type, actorId, payload } as never);
					if (r.status !== 'accepted') throw new Error(type + JSON.stringify(r.rejection));
				};
				await send('session.set-workflow', {
					workflow: 'active',
					activeSceneId:
						rt.state.commandCenter.homeSceneId ?? Object.values(rt.state.scenes.scenes)[0].id,
				});
				await send('combat.start', {
					combatants: [
						{ kind: 'monster', name: 'Bog Lurker', ac: 13, initiative: 18, maxHp: 22 },
						{ kind: 'monster', name: 'Reed Stalker', ac: 12, initiative: 9, maxHp: 14 },
						{ kind: 'monster', name: 'Marsh Wisp', ac: 15, initiative: 4, maxHp: 9 },
					],
				});
				const [lurker, stalker, wisp] = (
					rt.state.session as unknown as {
						combat: { order: string[] };
					}
				).combat.order;
				const resource = (combatantId: string, rest: object) =>
					send('combat.apply-resource', { combatantId, ...rest });
				await resource(lurker, { kind: 'concentration', effect: 'Blur' });
				await resource(lurker, { kind: 'hp', delta: -1 });
				await resource(lurker, {
					kind: 'condition',
					condition: 'poisoned',
					present: true,
					rounds: 2,
				});
				await resource(stalker, { kind: 'hp', delta: -99 });
				await resource(stalker, { kind: 'defeated', value: false });
				await send('combat.set-combatant-visibility', { combatantId: wisp, hidden: true });
			});

			const combat = page.locator('section').filter({
				has: page.getByRole('heading', { name: 'Combat', level: 2, exact: true }),
			});
			await expect(combat.getByRole('button', { name: 'Clear Poisoned' })).toBeVisible();
			await expect(
				combat.getByRole('button', { name: 'Keep concentration for Bog Lurker' }),
			).toBeVisible();
			await expect(
				combat.getByRole('button', { name: 'Record a death save success for Reed Stalker' }),
			).toBeVisible();
			await expect(combat.getByLabel('2 rounds left')).toBeVisible();
			await capture('session-combat-conditional', combat);

			await combat.getByRole('button', { name: 'Adjust hit points — Bog Lurker' }).click();
			const sessionSheet = page.getByRole('dialog', { name: 'Hit points — Bog Lurker' });
			await expect(sessionSheet.getByRole('button', { name: 'Digit 7' })).toBeVisible();
			await capture('session-combat-hp-sheet', sessionSheet, true);
			await page.keyboard.press('Escape');
			await expect(sessionSheet).toHaveCount(0);

			await enterPreview(page, 'player');
			await expect(combat.getByRole('button', { name: 'Clear Poisoned' })).toHaveCount(0);
			await capture('session-combat-preview', combat);
			await exitPreview(page);

			// Exercise each conditional control and check the durable result, not only its presence.
			await combat
				.getByRole('button', { name: 'Record a death save success for Reed Stalker' })
				.click();
			await expect(combat.getByText('Death saves 1 of 3 kept, 0 of 3 failed')).toBeVisible();
			await combat
				.getByRole('button', { name: 'Record a death save failure for Reed Stalker' })
				.click();
			await expect(combat.getByText('Death saves 1 of 3 kept, 1 of 3 failed')).toBeVisible();
			await combat.getByRole('button', { name: 'Keep concentration for Bog Lurker' }).click();
			await expect(combat.getByText(/Concentration check, DC/)).toHaveCount(0);
			await combat.getByRole('button', { name: 'Clear Poisoned' }).click();
			await expect(combat.getByRole('button', { name: 'Clear Poisoned' })).toHaveCount(0);
			const lurker = await combatant('Bog Lurker');
			const stalker = await combatant('Reed Stalker');
			if (
				lurker.concentration.effect !== 'Blur' ||
				lurker.concentration.check !== null ||
				lurker.conditions.length !== 0 ||
				stalker.deathSaves.successes !== 1 ||
				stalker.deathSaves.failures !== 1
			)
				throw new Error(`Unexpected combat outcome ${JSON.stringify({ lurker, stalker })}`);

			await gotoRoute(page, '/board');
			await expect(page.getByRole('button', { name: 'Edit layout', exact: true })).toBeVisible();
			const tile = page.getByRole('group', { name: 'Initiative Tracker, Combat widget' });
			await expect(tile.getByRole('button', { name: 'Next turn' })).toBeEnabled();
			if (tier === 'phone') {
				await expect(tile.getByTestId('initiative-tile-compact')).toBeVisible();
				await expect(tile.getByRole('button', { name: 'More actions — Bog Lurker' })).toBeVisible();
			} else {
				await expect(tile.getByTestId('initiative-tile-compact')).toHaveCount(0);
			}
			await capture('board-combat-live', tile);

			if (tier === 'phone') {
				// Swipe left on the first row, as combat-tile.spec.ts does: the gesture opens the tray.
				const row = '[data-testid="initiative-tile-compact"] li:nth-child(1)';
				const box = (await page.locator(row).boundingBox())!;
				const y = box.y + box.height / 2;
				const x = box.x + box.width - 12;
				await page.dispatchEvent(row, 'pointerdown', {
					pointerType: 'touch',
					clientX: x,
					clientY: y,
				});
				for (const step of [20, 45, 80])
					await page.dispatchEvent(row, 'pointermove', {
						pointerType: 'touch',
						clientX: x - step,
						clientY: y,
					});
				await page.dispatchEvent(row, 'pointerup', {
					pointerType: 'touch',
					clientX: x - 80,
					clientY: y,
				});
				const tray = tile.getByRole('group', { name: 'Quick actions — Bog Lurker' });
				await expect(
					tray.getByRole('button', { name: 'Hide Bog Lurker from players' }),
				).toBeVisible();
				await capture('board-combat-tray', tile);
				await tray.getByRole('button', { name: 'Close quick actions — Bog Lurker' }).click();
				await expect(tray).toHaveCount(0);
				// The same tray from the keyboard: More actions is in the tab order.
				await tile.getByRole('button', { name: 'More actions — Bog Lurker' }).focus();
				await page.keyboard.press('Enter');
				await expect(tray).toBeVisible();
				// No explicit focus move exists in source; the reused DOM button ends up named Heal.
				await expect(tray.getByRole('button', { name: 'Heal', exact: true })).toBeFocused();
				await tray.getByRole('button', { name: 'Close quick actions — Bog Lurker' }).click();

				await tile.getByRole('button', { name: 'Adjust hit points — Bog Lurker' }).click();
				const sheet = page.getByRole('dialog', { name: 'Hit points — Bog Lurker' });
				await expect(sheet.getByRole('button', { name: 'Digit 5' })).toBeVisible();
				await capture('board-combat-hp-sheet', sheet, true);
				await page.keyboard.press('5');
				await sheet.getByRole('button', { name: 'Damage', exact: true }).click();
				await expect(sheet).toHaveCount(0);
				await expect(
					tile.getByRole('status').filter({ hasText: 'Damage 5 · Bog Lurker' }),
				).toHaveCount(1);
				if ((await combatant('Bog Lurker')).hp !== 16) throw new Error('Tile damage not applied');
			}

			// Player preview replaces the whole board with a DM-only notice; the tile is unreachable.
			await enterPreview(page, 'player');
			const main = page.locator('#main-content');
			await expect(main.getByText(/Only the DM can arrange it/)).toBeVisible();
			await expect(tile).toHaveCount(0);
			await capture('board-combat-preview', main);
			await exitPreview(page);

			await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
			// Editing makes the body a picture: Next turn is no longer a button; phone row buttons disable.
			await expect(tile.getByRole('button', { name: 'Next turn' })).toHaveCount(0);
			if (tier === 'phone')
				await expect(
					tile.getByRole('button', { name: 'More actions — Bog Lurker' }),
				).toBeDisabled();
			await capture('board-combat-edit', tile);
			await context.close();
		}
	}
} finally {
	await browser.close();
}
