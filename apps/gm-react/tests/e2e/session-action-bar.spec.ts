import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import {
	dispatch,
	enterPreview,
	exitPreview,
	gotoRoute,
	markOnboarded,
	seedFresh,
} from './_helpers';

// RC-CAN-5.2 — THE PHONE BOARD'S FLOATING SESSION ACTION BAR. While the session is live, a phone
// reading `/board` gets a toolbar at the foot of the board with a d20, a d6, Next turn (only while
// combat is running, in the combat tile's colour) and Handout. Every control dispatches the same
// core command the session quick panel does, so these assertions read the Core, not the pixels.
// The desktop keeps its right rail (RC-SES-1.1) and never draws the bar.

const phone = (info: TestInfo) => info.project.name === 'mobile-chromium';

/** The home scene, or the first real scene, as the session's active scene. */
function liveSceneId(page: Page): Promise<string | undefined> {
	return page.evaluate(() => {
		const state = window.__rt!.state as unknown as {
			session: { activeSceneId: string | null };
			commandCenter: { homeSceneId: string | null };
			scenes: { scenes: Record<string, { id: string; isTemplate?: boolean }> };
		};
		return (
			state.session.activeSceneId ??
			state.commandCenter.homeSceneId ??
			Object.values(state.scenes.scenes).find((s) => !s.isTemplate)?.id
		);
	});
}

async function goLive(page: Page): Promise<void> {
	const result = await dispatch(page, {
		type: 'session.set-workflow',
		actorId: 'dm-1',
		payload: { workflow: 'active', activeSceneId: await liveSceneId(page) },
	});
	expect(result.status, result.rejection?.message ?? '').toBe('accepted');
}

async function startCombat(page: Page): Promise<void> {
	const result = await dispatch(page, {
		type: 'combat.start',
		actorId: 'dm-1',
		payload: {
			combatants: [
				{ kind: 'monster', name: 'Bog Lurker', ac: 13, initiative: 18, maxHp: 22 },
				{ kind: 'monster', name: 'Reed Stalker', ac: 12, initiative: 9, maxHp: 14 },
			],
		},
	});
	expect(result.status, result.rejection?.message ?? '').toBe('accepted');
}

function rollCount(page: Page): Promise<number> {
	return page.evaluate(
		() => (window.__rt!.state.session as { diceHistory?: unknown[] }).diceHistory?.length ?? 0,
	);
}

function turnCursor(page: Page): Promise<string> {
	return page.evaluate(() => {
		const combat = (window.__rt!.state.session as { combat: { round: number; turn: number } })
			.combat;
		return `${combat.round}:${combat.turn}`;
	});
}

function lastOpType(page: Page): Promise<string | undefined> {
	return page.evaluate(() => {
		const operations = window.__rt!.state.sync.operations as Array<{ opType: string }>;
		return operations[operations.length - 1]?.opType;
	});
}

test.describe('phone session action bar', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/board');
		await seedFresh(page);
		await gotoRoute(page, '/board');
	});

	test('appears on the phone board only while the session is live', async ({ page }, info) => {
		const bar = page.getByRole('toolbar', { name: 'Session actions' });
		await expect(bar).toHaveCount(0);

		await goLive(page);
		if (!phone(info)) {
			// The desktop's live posture is the right rail; the board keeps its full width.
			await expect(page.getByTestId('session-rail')).toBeVisible();
			await expect(bar).toHaveCount(0);
			return;
		}

		await expect(bar).toBeVisible();
		await expect(bar.getByRole('button', { name: 'Roll 1d20' })).toBeVisible();
		await expect(bar.getByRole('button', { name: 'Roll 1d6' })).toBeVisible();
		await expect(bar.getByRole('button', { name: 'Handout' })).toBeVisible();
		// No fight, no Next turn — a control that cannot work is absent rather than inert.
		await expect(bar.getByRole('button', { name: 'Next turn' })).toHaveCount(0);

		const ended = await dispatch(page, {
			type: 'session.set-workflow',
			actorId: 'dm-1',
			payload: { workflow: 'idle' },
		});
		expect(ended.status, ended.rejection?.message ?? '').toBe('accepted');
		await expect(bar).toHaveCount(0);
	});

	test('the dice roll through the Core and report the result', async ({ page }, info) => {
		test.skip(!phone(info), 'the bar is the phone posture');
		await goLive(page);
		const bar = page.getByRole('toolbar', { name: 'Session actions' });

		const before = await rollCount(page);
		await bar.getByRole('button', { name: 'Roll 1d20' }).click();
		await expect.poll(() => rollCount(page)).toBe(before + 1);
		await expect(page.getByText(/^Rolled 1d20: \d+$/)).toBeVisible();

		await bar.getByRole('button', { name: 'Roll 1d6' }).click();
		await expect.poll(() => rollCount(page)).toBe(before + 2);
		const last = await page.evaluate(() => {
			const rolls = (window.__rt!.state.session as { diceHistory: Array<{ expression: string }> })
				.diceHistory;
			return rolls[rolls.length - 1]?.expression;
		});
		expect(last).toBe('1d6');
	});

	test('Next turn appears with combat, in the combat accent, and advances the turn', async ({
		page,
	}, info) => {
		test.skip(!phone(info), 'the bar is the phone posture');
		await goLive(page);
		const bar = page.getByRole('toolbar', { name: 'Session actions' });
		await expect(bar).toBeVisible();
		await startCombat(page);

		const next = bar.getByRole('button', { name: 'Next turn' });
		await expect(next).toBeVisible();
		// The combat accent is the combat tile's identity colour, not the gold app accent.
		const colours = await next.evaluate((el) => {
			const probe = document.createElement('span');
			probe.style.color = 'var(--color-tile-combat)';
			el.appendChild(probe);
			const combat = getComputedStyle(probe).color;
			probe.remove();
			return { border: getComputedStyle(el).borderTopColor, combat };
		});
		expect(colours.border).toBe(colours.combat);

		const before = await turnCursor(page);
		await next.click();
		await expect.poll(() => turnCursor(page)).not.toBe(before);
		expect(page.url()).toContain('/board');

		const ended = await dispatch(page, { type: 'combat.end', actorId: 'dm-1', payload: {} });
		expect(ended.status, ended.rejection?.message ?? '').toBe('accepted');
		await expect(next).toHaveCount(0);
	});

	test('Handout opens a sheet that pushes to the players', async ({ page }, info) => {
		test.skip(!phone(info), 'the bar is the phone posture');
		await goLive(page);
		const bar = page.getByRole('toolbar', { name: 'Session actions' });
		await bar.getByRole('button', { name: 'Handout' }).click();

		const sheet = page.getByRole('dialog', { name: 'Push a handout' });
		await expect(sheet).toBeVisible();
		const push = sheet.getByRole('button', { name: 'Push' });
		await expect(push).toBeDisabled();

		const players = await page.evaluate(
			() =>
				Object.values(
					window.__rt!.state.permissions.actors as Record<string, { role: string }>,
				).filter((a) => a.role === 'player').length,
		);
		await sheet.getByRole('textbox', { name: 'Handout title' }).fill('The mill ledger');
		if (players === 0) {
			// Fail closed: with nobody to send it to, the push stays disabled and says why.
			await expect(push).toBeDisabled();
			await expect(sheet).toContainText(/player/i);
			return;
		}
		await push.click();
		await expect.poll(() => lastOpType(page)).toBe('session.deliver-handout');
		await expect(sheet).toHaveCount(0);
	});

	test('is a keyboard toolbar: arrow keys move between its controls', async ({ page }, info) => {
		test.skip(!phone(info), 'the bar is the phone posture');
		await goLive(page);
		const bar = page.getByRole('toolbar', { name: 'Session actions' });
		const d20 = bar.getByRole('button', { name: 'Roll 1d20' });
		await d20.focus();
		await page.keyboard.press('ArrowRight');
		await expect(bar.getByRole('button', { name: 'Roll 1d6' })).toBeFocused();
		await page.keyboard.press('End');
		await expect(bar.getByRole('button', { name: 'Handout' })).toBeFocused();
		await page.keyboard.press('Home');
		await expect(d20).toBeFocused();
	});

	test('previewing as a player takes the bar away with the board', async ({ page }, info) => {
		test.skip(!phone(info), 'the bar is the phone posture');
		await goLive(page);
		const bar = page.getByRole('toolbar', { name: 'Session actions' });
		await expect(bar).toBeVisible();
		// A player sees the /board player notice, not the DM's board, so no DM write is left on screen.
		await enterPreview(page, 'player');
		await expect(bar).toHaveCount(0);
		await exitPreview(page);
		await expect(bar).toBeVisible();
	});

	test('axe finds nothing on the bar or its handout sheet', async ({ page }, info) => {
		test.skip(!phone(info), 'the bar is the phone posture');
		await goLive(page);
		await startCombat(page);
		const bar = page.getByRole('toolbar', { name: 'Session actions' });
		await expect(bar.getByRole('button', { name: 'Next turn' })).toBeVisible();
		const tags = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'];
		const onBar = await new AxeBuilder({ page })
			.include('[data-testid="session-action-bar"]')
			.withTags(tags)
			.analyze();
		expect(onBar.violations).toEqual([]);

		await bar.getByRole('button', { name: 'Handout' }).click();
		await expect(page.getByRole('dialog', { name: 'Push a handout' })).toBeVisible();
		const onSheet = await new AxeBuilder({ page })
			.include('[data-testid="session-action-handout-sheet"]')
			.withTags(tags)
			.analyze();
		expect(onSheet.violations).toEqual([]);
	});

	for (const size of [
		{ width: 320, height: 640 },
		{ width: 360, height: 640 },
	]) {
		test(`sits inside the board above the tab bar at ${size.width}×${size.height}`, async ({
			page,
		}, info) => {
			test.skip(!phone(info), 'the bar is the phone posture');
			await page.setViewportSize(size);
			await goLive(page);
			await startCombat(page);
			const bar = page.getByTestId('session-action-bar');
			await expect(bar.getByRole('button', { name: 'Next turn' })).toBeVisible();
			// One row: every control shares the first control's top edge.
			const tops = await bar
				.getByRole('button')
				.evaluateAll((buttons) => buttons.map((b) => Math.round(b.getBoundingClientRect().top)));
			expect(new Set(tops).size, JSON.stringify(tops)).toBe(1);
			// Handout keeps its accessible name even when it drops to its glyph below 360px.
			await expect(bar.getByRole('button', { name: 'Handout' })).toBeVisible();

			const geometry = await page.evaluate(() => {
				const rect = (el: Element | null) => el?.getBoundingClientRect() ?? null;
				const main = rect(document.getElementById('main-content'))!;
				const bar = rect(document.querySelector('[data-testid="session-action-bar"]'))!;
				const trigger = rect(document.querySelector('[data-testid="session-quick-trigger"]'));
				const targets = Array.from(
					document.querySelectorAll('[data-testid="session-action-bar"] button'),
				).map((b) => {
					const r = b.getBoundingClientRect();
					return { w: r.width, h: r.height };
				});
				return {
					main: { top: main.top, bottom: main.bottom, left: main.left, right: main.right },
					bar: { top: bar.top, bottom: bar.bottom, left: bar.left, right: bar.right },
					trigger: trigger && {
						top: trigger.top,
						bottom: trigger.bottom,
						left: trigger.left,
						right: trigger.right,
					},
					targets,
					overflowX: document.documentElement.scrollWidth - window.innerWidth,
				};
			});

			// Inside the bounded main pane, so the tab bar below it stays uncovered.
			expect(geometry.bar.left).toBeGreaterThanOrEqual(geometry.main.left);
			expect(geometry.bar.right).toBeLessThanOrEqual(geometry.main.right);
			expect(geometry.bar.bottom).toBeLessThanOrEqual(geometry.main.bottom + 0.5);
			expect(geometry.overflowX).toBeLessThanOrEqual(0);
			// 48px touch targets for every control.
			for (const target of geometry.targets) {
				expect(target.h).toBeGreaterThanOrEqual(47.5);
				expect(target.w).toBeGreaterThanOrEqual(47.5);
			}
			// The quick-panel trigger floats above the navigation; the bar never sits under it.
			if (geometry.trigger) {
				const overlaps =
					geometry.trigger.left < geometry.bar.right &&
					geometry.trigger.right > geometry.bar.left &&
					geometry.trigger.top < geometry.bar.bottom &&
					geometry.trigger.bottom > geometry.bar.top;
				expect(overlaps, JSON.stringify(geometry)).toBe(false);
			}
		});
	}
});
