import AxeBuilder from '@axe-core/playwright';
import type { CoreStateSlice } from '@dndtools/core';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, installFakeLan, markOnboarded } from './_helpers';
import { selectCompanionSection } from './_companion';

// RC-CHR-6.1 — the companion sheet is the player's sheet. A player joined over the fake LAN (real
// signaling, encryption and host filtering; only the data channel is faked) marks damage, adds a
// condition and spends a slot from `/play`, and each change reaches the DM's combat tracker and the
// DM's character sheet within the live-delivery budget. A write against another player's PC is
// refused by the DM's Core and changes nothing.
//
// The budget is read from the perf registry source, as `collab.spec.ts` does, so this test cannot
// pass against a number nobody maintains.
const DELIVERY_BUDGET_MS = (() => {
	const registry = readFileSync(
		fileURLToPath(
			new URL('../../../../packages/core/src/perf/budget-registry.ts', import.meta.url),
		),
		'utf8',
	);
	const entry = registry.slice(registry.indexOf("id: 'live-session-delivery'"));
	const target = /kind: 'latency-ms-p95'[^}]*?target: (\d+)/.exec(entry.slice(0, 600));
	if (!target) throw new Error('the live-session-delivery latency budget is not declared');
	return Number(target[1]);
})();

type Character = { id: string; name: string; kind: string; combat: { hp: number; maxHp: number } };

async function command(page: Page, type: string, payload: Record<string, unknown>) {
	const result = await dispatch(page, {
		type,
		payload,
		actorId: await page.evaluate(() => window.__rt!.defaultActorId),
	});
	expect(result.status, `${type}: ${result.rejection?.message}`).toBe('accepted');
}

function characterOf(page: Page, id: string) {
	return page.evaluate(
		(characterId) =>
			(window.__rt!.state as unknown as CoreStateSlice).characters.characters[characterId]!,
		id,
	);
}

/** Time from `act` until `appears` is visible on the DM's device; fails past the budget. */
async function delivered(act: () => Promise<void>, appears: ReturnType<Page['locator']>) {
	const started = Date.now();
	await act();
	await expect(appears).toBeVisible({ timeout: DELIVERY_BUDGET_MS });
	expect(Date.now() - started).toBeLessThanOrEqual(DELIVERY_BUDGET_MS);
}

test('a joined player edits their own sheet live; the DM sees it and another PC is refused', async ({
	page,
	browser,
}, testInfo) => {
	test.setTimeout(120_000);
	const peers: Page[] = [];
	await installFakeLan(page, peers);
	await markOnboarded(page);
	await gotoRoute(page, '/session');

	// The seeded party: the invited player's own PC, and a PC belonging to someone else.
	const { playerId, mine, theirs } = await page.evaluate(() => {
		const state = window.__rt!.state as unknown as {
			characters: { characters: Record<string, Character> };
			permissions: {
				grants: { entityId: string; playerActorId: string; capabilitySet: string }[];
			};
		};
		const ownerOf = (id: string) =>
			state.permissions.grants.find((g) => g.entityId === id && g.capabilitySet === 'owner')
				?.playerActorId ?? null;
		const pcs = Object.values(state.characters.characters).filter(
			(c) => c.kind === 'pc' && ownerOf(c.id),
		);
		const own = pcs[0]!;
		const other = pcs.find((c) => ownerOf(c.id) !== ownerOf(own.id))!;
		return { playerId: ownerOf(own.id)!, mine: own, theirs: other };
	});
	expect(mine.combat.hp).toBeGreaterThan(3);
	await command(page, 'character.set-spell-slots', { characterId: mine.id, level: 1, max: 2 });
	await command(page, 'combat.start', {
		combatants: [
			{
				kind: 'character',
				name: mine.name,
				characterId: mine.id,
				initiative: 15,
				maxHp: mine.combat.maxHp,
			},
			{ kind: 'monster', name: 'Bog Lurker', initiative: 9, maxHp: 22 },
		],
	});

	const offer = await page.evaluate(async (actorId) => {
		const path = '/src/net/SessionHost.ts';
		const { SessionHost } = await import(path);
		const host = new SessionHost(window.__rt, 'companion-sheet-lan');
		Object.assign(window, { sheetHost: host });
		const invitation = await host.invite(actorId);
		return invitation.offerCode as string;
	}, playerId);

	const context = await browser.newContext({
		viewport: page.viewportSize(),
		isMobile: testInfo.project.name === 'mobile-chromium',
		hasTouch: testInfo.project.name === 'mobile-chromium',
	});
	try {
		const player = await context.newPage();
		await installFakeLan(player, peers);
		await player.addInitScript(() => localStorage.setItem('dndtools:react:vault-choice', 'fresh'));
		await player.goto(new URL('/#/play', page.url()).href);
		// Keep a handle on the joined client, so the test can send what no control on the sheet offers.
		await player.evaluate(async () => {
			const path = '/src/net/SessionClient.ts';
			const { SessionClient } = await import(path);
			const onChange = SessionClient.prototype.onChange;
			SessionClient.prototype.onChange = function (handler: (state: unknown) => void) {
				Object.assign(window, { sheetClient: this });
				onChange.call(this, handler);
			};
		});
		await player.getByRole('button', { name: 'Join a table' }).click();
		const dialog = player.getByRole('dialog', { name: 'Join a table' });
		await dialog.getByLabel('Invite code from your DM').fill(offer);
		await dialog.getByRole('button', { name: 'Join', exact: true }).click();
		const answer = await dialog.getByLabel('Your reply code').inputValue();
		await page.evaluate(async (code) => {
			await (
				window as unknown as { sheetHost: { acceptAnswer(code: string): Promise<void> } }
			).sheetHost.acceptAnswer(code);
		}, answer);
		await expect(dialog.getByTestId('session-connection')).toContainText('Connected');
		await player.keyboard.press('Escape');
		await selectCompanionSection(player, 'My character');
		const sheet = player.locator('#player-main');
		await expect(sheet.getByRole('heading', { name: mine.name })).toBeVisible();
		// The sheet the table sees is the sheet the player edits: the old hand-off copy is gone.
		await expect(player.getByText(/full character app/)).toHaveCount(0);

		const axe = await new AxeBuilder({ page: player })
			.include('#player-main')
			.withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
			.analyze();
		expect(axe.violations).toEqual([]);

		// The DM watches the combat tracker on /session.
		const row = page
			.getByRole('listitem')
			.filter({ has: page.getByRole('button', { name: mine.name, exact: true }) });
		await expect(row).toBeVisible();
		const hpAfter = mine.combat.hp - 3;

		// 1 · Mark 3 damage.
		await sheet.getByLabel('Hit point change amount').fill('3');
		await delivered(
			() => sheet.getByRole('button', { name: 'Damage 3', exact: true }).click(),
			row.getByText(`${hpAfter}/${mine.combat.maxHp}`, { exact: true }),
		);
		await expect(sheet.getByTestId('vitals-hp')).toContainText(String(hpAfter));
		await expect(sheet.getByRole('button', { name: 'Undo 3 damage' })).toBeVisible();

		// 2 · Add Poisoned.
		await sheet.getByLabel('Condition to add').selectOption('poisoned');
		await delivered(
			() => sheet.getByRole('button', { name: 'Add condition', exact: true }).click(),
			row.getByRole('img', { name: 'Poisoned' }),
		);

		// 3 · Spend a slot, with the DM on the character's own sheet.
		await gotoRoute(page, `/characters/${mine.id}`);
		const dmSheet = page.getByRole('main');
		await expect(dmSheet.getByText(`${hpAfter}/${mine.combat.maxHp}`).first()).toBeVisible();
		await expect(dmSheet.getByRole('img', { name: 'Poisoned' }).first()).toBeVisible();
		await expect(dmSheet.getByLabel('Level 1 slot 2 available')).toBeVisible();
		await delivered(
			() => sheet.getByRole('button', { name: 'Level 1 slot 1 available' }).click(),
			dmSheet.getByLabel('Level 1 slot 2 expended'),
		);
		const after = await characterOf(page, mine.id);
		expect(after.combat.hp).toBe(hpAfter);

		// 4 · Another player's PC: the joined client asks, the DM's Core refuses, nothing moves.
		const before = await characterOf(page, theirs.id);
		const refused = await player.evaluate(
			(characterId) =>
				(
					window as unknown as {
						sheetClient: {
							requestCommand(command: unknown): Promise<{ ok: boolean; message?: string }>;
						};
					}
				).sheetClient.requestCommand({
					type: 'character.update-combat-resource',
					payload: { characterId, kind: 'hp', delta: -3 },
				}),
			theirs.id,
		);
		expect(refused).toEqual({
			ok: false,
			message: "You may not update this character's combat resources.",
		});
		expect(await characterOf(page, theirs.id)).toEqual(before);
	} finally {
		await context.close();
	}
});
