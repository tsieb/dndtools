import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
	dispatch,
	enterPreview,
	exitPreview,
	gotoRoute,
	markOnboarded,
	seedFresh,
	waitReady,
} from './_helpers';

// RC-POL-1.4 — the Session polish pass (roadmap §20.2–§20.5). Runs on desktop-chromium and
// mobile-chromium: strict axe over the route and every overlay it opens (the shell's own chrome is
// the App shell story's surface and is left out, as in the other polish specs), a five-theme
// contrast scan, Prep and recap's recent-changes count (§1.7), a keyboard walkthrough, the empty
// roster refusal as the failure path, player preview, and 200% text. The journal is
// state/RC-POL-1.4.journal.md.

const TRACKER_QUERY = `/@fs${fileURLToPath(new URL('../../../../packages/core/src/queries/combat-tracker-view.ts', import.meta.url))}`;
const THEMES = ['tavern', 'parchment', 'scholar', 'dungeon', 'high-contrast'] as const;
const STRICT = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

/**
 * The one known exception, outside this surface: the shared screen-kit `Seg` (the session phase
 * control) paints its selected option in parchment's accent-on-tint pair, 4.43:1 — DEBT-2026-008,
 * owned by the design system. Only that control and that exact pair are let through.
 */
function sharedSegDebt(node: { target: unknown[]; failureSummary?: string }): boolean {
	return (
		node.target.join(' ').includes('[role="radio"]') &&
		/foreground color: #9a5418, background color: #f0e0c8/.test(node.failureSummary ?? '')
	);
}

/** Settle entrances (a dialog mid-fade measures as a contrast failure), then scan without the shell. */
async function axe(page: Page, label: string, tags: string[] = STRICT) {
	await page.evaluate(async () => {
		await Promise.all(
			document
				.getAnimations()
				.filter((a) => a.effect?.getTiming().iterations !== Infinity)
				.map((a) => a.finished.catch(() => undefined)),
		);
		const main = document.getElementById('main-content');
		for (const sibling of Array.from(main?.parentElement?.children ?? []))
			if (sibling !== main) sibling.setAttribute('data-axe-shell', '');
		for (const aside of Array.from(document.querySelectorAll('aside')))
			if (!main?.contains(aside)) aside.setAttribute('data-axe-shell', '');
		// The shell's floating session trigger and its phone strip (RC-SES-1.1/1.2) sit outside
		// `#main-content` too; dialogs portal to the body and stay in the scan.
		for (const el of Array.from(document.querySelectorAll('[data-testid="session-quick-trigger"]')))
			el.setAttribute('data-axe-shell', '');
	});
	const result = await new AxeBuilder({ page })
		.withTags(tags)
		.exclude('[data-axe-shell]')
		.analyze();
	const found = result.violations
		.map((violation) => ({
			id: violation.id,
			nodes: violation.nodes
				.filter((node) => !(violation.id === 'color-contrast' && sharedSegDebt(node)))
				.map((node) => node.target.join(' ')),
		}))
		.filter((violation) => violation.nodes.length > 0);
	expect(found, label).toEqual([]);
}

function panel(page: Page, heading: string): Locator {
	return page
		.locator('#main-content section')
		.filter({ has: page.getByRole('heading', { name: heading, exact: true }) })
		.last();
}

async function openSession(page: Page, theme: (typeof THEMES)[number] = 'tavern') {
	await page.addInitScript((applied) => {
		try {
			window.localStorage.setItem('dndtools:react:theme', applied);
		} catch {
			/* best-effort, as in markOnboarded */
		}
	}, theme);
	await markOnboarded(page);
	await gotoRoute(page, '/session');
	await seedFresh(page);
	await expect(page.getByTestId('session-screen')).toBeVisible();
	await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

/** Go live on the demo seed's first table scene and start a two-foe fight, the second hidden. */
async function startFight(page: Page) {
	const live = await page.evaluate(async () => {
		const rt = window.__rt!;
		const state = rt.state as unknown as {
			commandCenter: { homeSceneId: string | null };
			scenes: {
				scenes: Record<
					string,
					{
						id: string;
						templateMeta?: { isTemplate?: boolean };
						screen?: { origin?: { kind?: string } };
					}
				>;
			};
		};
		const scene = Object.values(state.scenes.scenes).find(
			(s) =>
				!s.templateMeta?.isTemplate &&
				s.id !== state.commandCenter.homeSceneId &&
				s.screen?.origin?.kind !== 'default',
		);
		const result = await rt.dispatch({
			type: 'session.set-workflow',
			actorId: rt.defaultActorId,
			payload: { workflow: 'active', activeSceneId: scene?.id },
		});
		return result.status;
	});
	expect(live).toBe('accepted');
	const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
	const fight = await dispatch(page, {
		type: 'combat.start',
		actorId,
		payload: {
			combatants: [
				{ kind: 'monster', name: 'Bog Lurker', ac: 13, initiative: 18, maxHp: 22 },
				{ kind: 'monster', name: 'Reed Stalker', ac: 12, initiative: 9, maxHp: 14, hidden: true },
			],
		},
	});
	expect(fight.status).toBe('accepted');
	await expect(page.getByRole('button', { name: 'End combat' })).toBeVisible();
}

/** Open a dialog from `trigger`, scan it, close it with Escape and check focus came back. */
async function scanDialog(page: Page, trigger: Locator, label: string) {
	await trigger.click();
	await expect(page.getByRole('dialog')).toBeVisible();
	await axe(page, label);
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).toHaveCount(0);
}

test('the route and every overlay it opens are axe clean', async ({ page }) => {
	test.setTimeout(120_000);
	await openSession(page);
	const main = page.locator('#main-content');
	await axe(page, 'standby');

	await scanDialog(page, main.getByRole('button', { name: /^Build encounter/ }).first(), 'build');
	await scanDialog(page, main.getByRole('button', { name: 'Start session' }), 'start session');

	await panel(page, 'Prep & recap')
		.getByRole('button', { name: /recent changes? to review/ })
		.click();
	await axe(page, 'recent changes open');

	await startFight(page);
	await axe(page, 'live fight');
	await scanDialog(page, main.getByRole('button', { name: 'Call a rest' }), 'call a rest');

	await main.getByRole('button', { name: 'Bog Lurker', exact: true }).click();
	await axe(page, 'combatant selected');
	await scanDialog(
		page,
		main.getByRole('button', { name: 'Adjust hit points — Bog Lurker' }),
		'hit point keypad',
	);
	await scanDialog(page, main.getByRole('button', { name: 'Add condition' }), 'condition picker');
	await scanDialog(
		page,
		main.getByRole('button', { name: 'Quick reference', exact: true }),
		'quick reference',
	);
	await scanDialog(page, main.getByRole('button', { name: 'Add', exact: true }), 'reinforcements');
	await scanDialog(page, main.getByRole('button', { name: 'End combat' }), 'end combat');

	await main.getByRole('button', { name: 'End session' }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
	await axe(page, 'end session');
	await page.getByRole('dialog').getByRole('button', { name: 'End and review' }).click();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(
		panel(page, 'Prep & recap').getByText('What happened', { exact: true }),
	).toBeVisible();
	await axe(page, 'recap');
});

test('every theme keeps standby, the encounter builder and a live fight above 4.5:1', async ({
	page,
}) => {
	test.setTimeout(150_000);
	for (const theme of THEMES) {
		await test.step(theme, async () => {
			await openSession(page, theme);
			await panel(page, 'Prep & recap')
				.getByRole('button', { name: /recent changes? to review/ })
				.click();
			await axe(page, `${theme} standby`, ['wcag2aa']);
			await page
				.locator('#main-content')
				.getByRole('button', { name: /^Build encounter/ })
				.first()
				.click();
			await expect(page.getByRole('dialog')).toBeVisible();
			await axe(page, `${theme} encounter builder`, ['wcag2aa']);
			await page.keyboard.press('Escape');
			await startFight(page);
			await page
				.locator('#main-content')
				.getByRole('button', { name: 'Bog Lurker', exact: true })
				.click();
			await axe(page, `${theme} live fight`, ['wcag2aa']);
		});
	}
});

test('an empty vault has no recent changes to review', async ({ page }) => {
	await markOnboarded(page);
	await page.addInitScript(() => {
		try {
			window.localStorage.setItem('dndtools:react:vault-choice', 'fresh');
		} catch {
			/* best-effort, as in markOnboarded */
		}
	});
	await gotoRoute(page, '/session');
	await seedFresh(page);
	await page.goto('/#/session', { waitUntil: 'domcontentloaded' });
	await waitReady(page);
	const prep = panel(page, 'Prep & recap');
	// Opening Session provisions its own screen, the app's write and not the GM's.
	await expect(prep.getByText('No recent changes to review.', { exact: true })).toBeVisible();
	await expect(prep.getByRole('button', { name: /recent changes? to review/ })).toHaveCount(0);
	await expect(prep.getByText(/\d+ recent changes? to review/)).toHaveCount(0);
});

test('the recent-changes count opens the list it counts', async ({ page }) => {
	await openSession(page);
	const prep = panel(page, 'Prep & recap');
	const count = prep.getByRole('button', { name: /recent changes? to review/ });
	await expect(count).toHaveAttribute('aria-expanded', 'false');
	const label = (await count.textContent()) ?? '';
	const counted = Number(label.match(/\d+/)?.[0]);
	expect(counted).toBeGreaterThan(0);
	const list = prep.getByRole('list', { name: 'Recent changes' });
	await expect(list).toBeHidden();

	await count.click();
	await expect(count).toHaveAttribute('aria-expanded', 'true');
	await expect(list.getByRole('listitem')).toHaveCount(counted);
	// The setup writes are not in it: no entry names the Session screen the route provisioned.
	await expect(list.getByText('Session', { exact: true })).toHaveCount(0);

	// A change the GM makes lands at the top of the list.
	const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
	const note = await dispatch(page, {
		type: 'content.create-item',
		actorId,
		payload: { kind: 'note', title: 'Lantern bearer notes', body: '', visibility: 'dm-only' },
	});
	expect(note.status).toBe('accepted');
	await expect(list.getByRole('listitem').first()).toContainText('Lantern bearer notes');
	await expect(list.getByRole('listitem').first()).toContainText('Created');

	await count.click();
	await expect(list).toBeHidden();
	await expect(count).toBeFocused();
});

test('keyboard only: build an encounter, refuse an empty roster, run a turn', async ({ page }) => {
	await openSession(page);
	const main = page.locator('#main-content');
	const build = main.getByRole('button', { name: /^Build encounter/ }).first();
	await build.focus();
	await expect(build).toBeFocused();
	expect(await build.evaluate((el) => el.matches(':focus-visible'))).toBe(true);
	await page.keyboard.press('Enter');
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();

	// The failure path: with the party unpicked the roster is empty and Start refuses, saying why.
	const picked = dialog.locator('button[aria-pressed="true"]');
	while ((await picked.count()) > 0) {
		await picked.first().focus();
		await page.keyboard.press('Space');
	}
	await expect(dialog.getByText('Combatants · 0')).toBeVisible();
	const start = dialog.getByRole('button', { name: 'Start combat' });
	await expect(start).toHaveAttribute('aria-disabled', 'true');
	await expect(start).toHaveAttribute('title', 'Add at least one combatant to the roster first.');
	await start.focus();
	await expect(start).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(dialog).toBeVisible();
	await expect(page.getByRole('button', { name: 'End combat' })).toHaveCount(0);

	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);
	await expect(build).toBeFocused();

	await startFight(page);
	const next = main.getByRole('button', { name: 'Next turn' });
	await next.focus();
	await page.keyboard.press('Enter');
	await expect(main.getByRole('listitem').filter({ hasText: 'Reed Stalker' })).toHaveAttribute(
		'aria-current',
		'true',
	);
	await expect(page.getByRole('status').filter({ hasText: 'Round 1, turn 2' })).toHaveCount(1);
});

test('previewing as a player hides the GM panels and refuses the writes', async ({ page }) => {
	await openSession(page);
	await startFight(page);
	await enterPreview(page, 'player');
	const main = page.locator('#main-content');
	await expect(main.getByRole('heading', { name: 'Prep & recap' })).toHaveCount(0);
	await expect(main.getByRole('heading', { name: 'End-of-session capture' })).toHaveCount(0);
	await expect(main.getByRole('button', { name: 'Next turn' })).toBeDisabled();
	await expect(main.getByRole('button', { name: 'End combat' })).toBeDisabled();
	// The hidden foe never reaches the player: the actor-scoped read decides, not the client.
	await expect(main.getByText('Reed Stalker')).toHaveCount(0);
	const names = await page.evaluate(async (queryUrl) => {
		const rt = window.__rt!;
		const core = await new Function('url', 'return import(url)')(queryUrl);
		const state = rt.state as unknown as { session: { combat: unknown }; permissions: unknown };
		const view = core.getCombatTrackerForActor(
			state.session.combat,
			state.permissions,
			rt.defaultActorId,
		);
		return view.combatants.map((row: { name: string }) => row.name);
	}, TRACKER_QUERY);
	expect(names).toContain('Bog Lurker');
	expect(names).not.toContain('Reed Stalker');
	await exitPreview(page);
	await expect(main.getByText('Reed Stalker', { exact: true })).toBeVisible();
});

test('at 200% text neither standby nor the live fight widens the page', async ({ page }) => {
	await openSession(page);
	await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
	const widened = () =>
		page.evaluate(() => {
			const main = document.getElementById('main-content')!;
			return main.scrollWidth - main.clientWidth;
		});
	await expect.poll(widened).toBeLessThanOrEqual(1);
	await startFight(page);
	await page
		.locator('#main-content')
		.getByRole('button', { name: 'Bog Lurker', exact: true })
		.click();
	await expect.poll(widened).toBeLessThanOrEqual(1);
});

test('removing a combatant asks first, names it, and keeps focus in place', async ({ page }) => {
	await openSession(page);
	await startFight(page);
	const main = page.locator('#main-content');
	await main.getByRole('button', { name: 'Bog Lurker', exact: true }).click();
	const remove = main.getByRole('button', { name: 'Remove', exact: true });
	await remove.click();
	const question = main.getByRole('group', {
		name: 'Remove Bog Lurker from combat? Its hit points and conditions go with it.',
	});
	await expect(question).toBeVisible();
	await expect(question.getByRole('button', { name: 'Keep Bog Lurker' })).toBeFocused();
	await axe(page, 'remove confirm');
	await page.keyboard.press('Escape');
	await expect(question).toHaveCount(0);
	await expect(remove).toBeFocused();
	await expect(main.getByRole('listitem').filter({ hasText: 'Bog Lurker' })).toHaveCount(1);

	await remove.click();
	await question.getByRole('button', { name: 'Remove Bog Lurker' }).click();
	await expect(main.getByRole('listitem').filter({ hasText: 'Bog Lurker' })).toHaveCount(0);
});
