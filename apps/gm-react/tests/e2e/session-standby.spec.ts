import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh } from './_helpers';

// RC-SES-6.2 — the Session screen's table tools work in Standby. Before this story every one of them
// was gated on the live workflow ("go live to roll", a soft-disabled Build encounter, a greyed Push to
// players). This spec runs a whole table beat through the UI without ever starting a session: it
// rolls dice, draws a table, builds an encounter, runs two rounds and pushes a handout, and checks
// that the session is still in Standby at the end and that nothing on the screen said "go live".

type SessionSlice = {
	workflow: string;
	diceHistory: Array<{ sourceKind?: string; workflow?: string }>;
	combat: { status: string; round: number; turn: number; order: string[] };
	handouts: Record<string, { title: string }>;
};

function session(page: Page): Promise<SessionSlice> {
	return page.evaluate(() => window.__rt!.state.session as unknown as SessionSlice);
}

/** A rollable table in the vault, so the Tables panel has something to draw. */
async function createTable(page: Page): Promise<void> {
	const result = await dispatch(page, {
		type: 'content.create-item',
		actorId: await page.evaluate(() => window.__rt!.defaultActorId),
		payload: {
			kind: 'object',
			title: 'Marsh weather',
			fields: {
				'dndtools.objectSubtype': 'dice-table',
				dice: '1d4',
				entries: ['Fog', 'Drizzle', 'Still air', 'Squall'],
			},
		},
	});
	expect(result.status, result.rejection?.message ?? '').toBe('accepted');
}

test.beforeEach(async ({ page }) => {
	await markOnboarded(page);
	await gotoRoute(page, '/session');
	await seedFresh(page);
	await createTable(page);
	await gotoRoute(page, '/session');
});

test('in Standby the DM rolls, draws, builds an encounter, runs two rounds and pushes a handout', async ({
	page,
}) => {
	expect((await session(page)).workflow).toBe('idle');
	const main = page.locator('main');

	// Standby is a quiet status, not a gate, and the header's one primary says what starting does.
	await expect(
		main.getByText('Not recording. Rolls and combat are logged once you start the session.'),
	).toBeVisible();
	const start = main.getByRole('button', { name: 'Start session', exact: true });
	await expect(start).toHaveAttribute(
		'title',
		'Starts the session log, the clock and the automations.',
	);
	await expect(main).not.toContainText(/\bgo(?:es|ing)?\s+live\b/i);

	// A first click that is also the page's first gesture can land mid-relayout (the audio autoplay
	// retry); a key press takes the first gesture instead.
	await page.keyboard.press('Shift');

	// 1. Dice.
	const rollsBefore = (await session(page)).diceHistory.length;
	await main.getByLabel('Dice expression').fill('1d20+5');
	await main.getByRole('button', { name: 'Roll', exact: true }).first().click();
	await expect.poll(async () => (await session(page)).diceHistory.length).toBe(rollsBefore + 1);
	// The roll is kept and labelled with the workflow it happened in, which keeps it out of the log.
	expect((await session(page)).diceHistory.at(-1)?.workflow).toBe('idle');
	await expect(main.getByText('Outside a session').first()).toBeVisible();

	// 2. A table draw.
	const table = main.getByTestId(/^table-row-/);
	await expect(table).toHaveCount(1);
	await table.getByRole('button', { name: 'Roll', exact: true }).click();
	await expect
		.poll(async () => (await session(page)).diceHistory.filter((r) => r.sourceKind === 'table'))
		.toHaveLength(1);
	await expect(table).toContainText(/Row \d \(rolled \d\)/);

	// 3. An encounter, built in the dialog and started.
	const build = main.getByRole('button', { name: 'Build encounter', exact: true });
	await expect(build).not.toHaveAttribute('aria-disabled', 'true');
	await build.click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	for (const [name, initiative] of [
		['Bog Lurker', '18'],
		['Reed Stalker', '9'],
	] as const) {
		await dialog.getByLabel('Quick add').fill(name);
		await dialog.getByRole('button', { name: 'Add', exact: true }).click();
		await dialog.getByLabel(`${name} initiative`).fill(initiative);
	}
	await dialog.getByRole('button', { name: 'Start combat', exact: true }).click();
	await expect(dialog).toBeHidden();
	await expect.poll(async () => (await session(page)).combat.status).toBe('running');
	const { combat } = await session(page);
	expect(combat.order.length).toBeGreaterThanOrEqual(2);
	expect(combat.round).toBe(1);

	// 4. Two full rounds: every combatant takes a turn twice, and the tracker reaches round 3.
	const next = main.getByRole('button', { name: 'Next turn', exact: true });
	const position = async () => {
		const { round, turn } = (await session(page)).combat;
		return `${round}:${turn}`;
	};
	for (let taken = 0; taken < combat.order.length * 2; taken += 1) {
		const before = await position();
		await next.click();
		await expect.poll(position).not.toBe(before);
	}
	await expect.poll(async () => (await session(page)).combat.round).toBe(3);

	// 5. A handout, pushed to the players.
	const title = `Waterlogged map ${Date.now()}`;
	await main.getByLabel('Handout title').fill(title);
	const push = main.getByRole('button', { name: 'Push to players' });
	await expect(push).not.toHaveAttribute('aria-disabled', 'true');
	await push.click();
	await expect
		.poll(async () => Object.values((await session(page)).handouts).some((h) => h.title === title))
		.toBe(true);

	// None of it started a session, and nothing on the screen asked for one.
	expect((await session(page)).workflow).toBe('idle');
	await expect(main).not.toContainText(/\bgo(?:es|ing)?\s+live\b/i);
});
