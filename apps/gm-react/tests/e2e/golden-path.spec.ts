import type { CoreStateSlice } from '@dndtools/core';
import { expect, test, type Page } from '@playwright/test';
import {
	dispatch,
	gotoRoute,
	installFakeLan,
	markOnboarded,
	waitReady,
	watchJourney,
} from './_helpers';

async function command(page: Page, type: string, payload: Record<string, unknown> = {}) {
	const result = await dispatch(page, {
		type,
		payload,
		actorId: await page.evaluate(() => window.__rt!.defaultActorId),
	});
	expect(result.status, `${type}: ${result.rejection?.message}`).toBe('accepted');
	return result.events ?? [];
}

async function prepare(page: Page) {
	await command(page, 'character.quick-create', { kind: 'npc', name: 'Golden guide' });
	await command(page, 'map.create', { name: 'Golden map', visibility: 'player-visible' });
	await command(page, 'content.create-item', {
		kind: 'note',
		title: 'Golden secret',
		body: 'The guide is a dragon.',
		visibility: 'dm-only',
	});
	await command(page, 'scene.create', { name: 'Golden template', asTemplate: true });
	const templateSceneId = await page.evaluate(
		() =>
			Object.values(window.__rt!.state.scenes.scenes).find((s) => s.name === 'Golden template')!.id,
	);
	const version = await page.evaluate(
		() =>
			Object.values((window.__rt!.state as unknown as CoreStateSlice).widgets.packages)
				.flatMap((record) => record.package.widgets)
				.find((widget) => widget.type === 'notes')!.version,
	);
	await command(page, 'scene.add-widget', {
		sceneId: templateSceneId,
		widget: { type: 'notes', version, layout: { x: 0, y: 0, w: 400, h: 182 } },
	});
	await command(page, 'scene.instantiate-template', {
		templateSceneId,
		newSceneName: 'Golden screen',
	});
	return page.evaluate(
		() =>
			Object.values(window.__rt!.state.scenes.scenes).find((s) => s.name === 'Golden screen')!.id,
	);
}

async function live(page: Page, activeSceneId: string) {
	await gotoRoute(page, '/session');
	await page.getByRole('button', { name: 'Go live', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Start a session' });
	await dialog.getByLabel('Scene', { exact: true }).selectOption(activeSceneId);
	await dialog.getByLabel('Session name').fill('Golden session');
	await dialog.getByRole('button', { name: 'Go live', exact: true }).click();
	await expect(dialog).toBeHidden();
}

test.describe('golden paths', () => {
	test('first run to Command Center with an empty vault', async ({ page }) => {
		const health = watchJourney(page);
		await page.addInitScript(() => localStorage.setItem('dndtools:react:vault-choice', 'fresh'));
		await page.goto('/#/');
		await waitReady(page);
		const overlay = page.locator('[data-fullscreen-overlay="onboarding"]');
		await health.checkpoint('Welcome');
		await overlay.getByRole('button', { name: 'Get started' }).click();
		await overlay.getByRole('button', { name: 'Continue' }).click();
		await health.checkpoint('Privacy choice');
		await overlay.getByRole('radio', { name: /Private vault/ }).click();
		await overlay.getByLabel('Type "i hold the keys" to confirm').fill('i hold the keys');
		for (let step = 0; step < 4; step++) {
			await overlay.getByRole('button', { name: 'Continue' }).click();
			await health.checkpoint(`Setup ${step}`);
		}
		await overlay.getByRole('button', { name: 'Enter Command Center' }).click();
		await expect(overlay).toBeHidden();
		await expect(page.locator('#main-content')).toBeVisible();
		expect(
			await page.evaluate(() => {
				const state = window.__rt!.state as unknown as CoreStateSlice;
				return {
					characters: Object.keys(state.characters.characters).length,
					maps: Object.keys(state.maps.maps).length,
				};
			}),
		).toEqual({ characters: 0, maps: 0 });
		expect(
			await page.evaluate(() =>
				Object.keys((window.__rt!.state.content as { items: object }).items),
			),
		).toEqual([]);
		await health.assertHealthy();
	});

	test('prep a character, map, note and pinned template screen', async ({ page }) => {
		const health = watchJourney(page);
		await markOnboarded(page);
		await gotoRoute(page, '/');
		const sceneId = await prepare(page);

		const widgetId = await page.evaluate(
			(id) => window.__rt!.state.scenes.scenes[id]!.widgets[0]!.id,
			sceneId,
		);
		await command(page, 'scene.pin-widget', { sceneId, widgetInstanceId: widgetId, pinned: true });
		expect(
			await page.evaluate(
				({ sceneId, widgetId }) =>
					(window.__rt!.state as unknown as CoreStateSlice).scenes.scenes[sceneId]!.widgets.find(
						(w) => w.id === widgetId,
					)!.layout.pinned,
				{ sceneId, widgetId },
			),
		).toBe(true);
		for (const [route, name] of [
			['/characters', 'Golden guide'],
			['/atlas', 'Golden map'],
			['/knowledge', 'Golden secret'],
			['/scenes', 'Golden screen'],
		]) {
			await gotoRoute(page, route!);
			await expect(
				page.locator('#main-content').getByText(name!, { exact: true }).first(),
			).toBeVisible();
			await health.checkpoint(route!);
		}
		await gotoRoute(page, `/scene/${sceneId}`);
		await expect(page.getByTestId(`widget-${widgetId}`)).toBeVisible();
		await health.assertHealthy();
	});

	test('Standby to live, three combat rounds, projection and capture', async ({ page }) => {
		test.setTimeout(90_000);
		const health = watchJourney(page);
		await markOnboarded(page);
		await gotoRoute(page, '/session');
		const sceneId = await prepare(page);
		await expect(page.getByRole('radio', { name: 'Standby', exact: true })).toHaveAttribute(
			'aria-checked',
			'true',
		);
		await health.checkpoint('Standby');
		await live(page, sceneId);
		await command(page, 'dice.roll', { expression: '1d20', seed: 'golden' });
		const events = await command(page, 'content.create-item', {
			kind: 'object',
			title: 'Golden omens',
			body: '',
			fields: { 'dndtools.objectSubtype': 'dice-table', dice: '1d2', entries: ['Rain', 'Sun'] },
		});
		const tableId = events.find((e) => e.kind === 'content.item-changed')!.itemId;
		await page
			.getByTestId(`table-row-${tableId}`)
			.getByRole('button', { name: 'Roll', exact: true })
			.click();
		await expect(page.getByTestId(`table-draw-${tableId}`)).toBeVisible();
		await command(page, 'combat.start', {
			combatants: [{ kind: 'monster', name: 'Golden foe', ac: 12, initiative: 18, maxHp: 30 }],
		});
		const combatantId = await page.evaluate(
			() => (window.__rt!.state.session as { combat: { order: string[] } }).combat.order[0],
		);
		for (let round = 1; round <= 3; round++) {
			await page.getByRole('button', { name: 'Adjust hit points — Golden foe' }).click();
			const hp = page.getByRole('dialog').filter({ hasText: 'Hit points — Golden foe' });
			await hp.getByRole('button', { name: 'Digit 1', exact: true }).click();
			await hp.getByRole('button', { name: 'Damage', exact: true }).click();
			await expect
				.poll(() =>
					page.evaluate(
						(id) =>
							(window.__rt!.state as unknown as CoreStateSlice).session.combat.combatants[id!]!
								.resources.hp,
						combatantId,
					),
				)
				.toBe(30 - round);
			await command(page, 'combat.apply-resource', {
				combatantId,
				kind: 'condition',
				condition: 'poisoned',
				present: true,
				rounds: 1,
			});
			await expect(page.getByLabel('1 round left').first()).toBeVisible();
			await page.locator('#main-content').getByRole('button', { name: 'Next turn' }).click();
			await expect
				.poll(() =>
					page.evaluate(
						() => (window.__rt!.state.session as { combat: { round: number } }).combat.round,
					),
				)
				.toBe(round + 1);
			expect(
				await page.evaluate(
					(id) =>
						(window.__rt!.state as unknown as CoreStateSlice).session.combat.combatants[id!]!
							.resources.conditions,
					combatantId,
				),
			).not.toContain('poisoned');
			await health.checkpoint(`Round ${round}`);
		}
		const playerActorIds = await page.evaluate(() =>
			window.__rt!.actors.filter((a) => a.role === 'player').map((a) => a.id),
		);
		await command(page, 'session.deliver-handout', {
			sceneId,
			title: 'Golden letter',
			sections: [{ heading: 'Welcome', body: 'Meet at dawn.', visibility: 'shared' }],
			recipientActorIds: playerActorIds,
		});
		await command(page, 'command-center.ensure-home');
		const mapId = await page.evaluate(
			() =>
				Object.values(
					(window.__rt!.state.maps as { maps: Record<string, { id: string; name: string }> }).maps,
				).find((m) => m.name === 'Golden map')!.id,
		);
		await command(page, 'session.set-active-map', { mapId });
		await command(page, 'session.project-active-map', { playerActorIds });
		await health.checkpoint('Projected handout and map');
		await page.getByRole('button', { name: 'End session', exact: true }).click();
		await page
			.getByRole('dialog', { name: 'End the live session?' })
			.getByRole('button', { name: 'End and review' })
			.click();
		await health.checkpoint('Recap capture');
		await page.getByLabel('Session log title').fill('Golden recap');
		await page
			.getByLabel('What happened', { exact: true })
			.fill('We defeated the foe and met at dawn.');
		await page.getByLabel('Follow-ups').fill('Return to the guide');
		await page.getByRole('button', { name: 'Save session log' }).click();
		await expect
			.poll(() =>
				page.evaluate(() => {
					const s = (window.__rt!.state as unknown as CoreStateSlice).session;
					return s.archives[s.recapArchiveId!]!.recap?.happened;
				}),
			)
			.toBe('We defeated the foe and met at dawn.');
		const archive = await page.evaluate(() => {
			const s = (window.__rt!.state as unknown as CoreStateSlice).session;
			return s.archives[s.recapArchiveId!]!;
		});
		expect(archive.diceHistory).toHaveLength(2);
		expect(archive.diceHistory.some((roll) => roll.sourceKind === 'table')).toBe(true);
		expect(archive.combat.round).toBe(4);
		expect(
			Object.values(archive.handouts).some((handout) => handout.title === 'Golden letter'),
		).toBe(true);
		expect(Object.keys(archive.activeMapProjections).sort()).toEqual([...playerActorIds].sort());
		await gotoRoute(page, '/knowledge');
		await expect(page.getByText('Golden recap', { exact: true }).first()).toBeVisible();
		await health.assertHealthy();
	});

	test('player joins the fake LAN and receives only player-safe content', async ({
		page,
		browser,
	}, testInfo) => {
		const hostHealth = watchJourney(page);
		const peers: Page[] = [];
		await installFakeLan(page, peers);
		await markOnboarded(page);
		await gotoRoute(page, '/session');
		const sceneId = await prepare(page);
		await live(page, sceneId);
		const playerId = await page.evaluate(
			() => window.__rt!.actors.find((a) => a.role === 'player')!.id,
		);
		await command(page, 'content.create-item', {
			kind: 'note',
			title: 'Golden letter',
			body: 'Meet at dawn.',
			visibility: 'player-visible',
		});
		await command(page, 'command-center.ensure-home');
		const mapId = await page.evaluate(
			() =>
				Object.values((window.__rt!.state as unknown as CoreStateSlice).maps.maps).find(
					(map) => map.name === 'Golden map',
				)!.id,
		);
		await command(page, 'session.set-active-map', { mapId });
		await command(page, 'session.project-active-map', { playerActorIds: [playerId] });
		const offer = await page.evaluate(async (actorId) => {
			const path = '/src/net/SessionHost.ts';
			const { SessionHost } = await import(path);
			const host = new SessionHost(window.__rt, 'golden-lan');
			Object.assign(window, { goldenHost: host });
			const invitation = await host.invite(actorId);
			await new Promise((resolve) => setTimeout(resolve, 0));
			return invitation.offerCode as string;
		}, playerId);
		const playerContext = await browser.newContext({
			viewport: page.viewportSize(),
			isMobile: testInfo.project.name === 'mobile-chromium',
			hasTouch: testInfo.project.name === 'mobile-chromium',
		});
		const player = await playerContext.newPage();
		const playerHealth = watchJourney(player);
		await installFakeLan(player, peers);
		await player.addInitScript(() => localStorage.setItem('dndtools:react:vault-choice', 'fresh'));
		await player.goto(new URL('/#/play', page.url()).href);
		await player.evaluate(async () => {
			const path = '/src/net/SessionClient.ts';
			const { SessionClient } = await import(path);
			const onChange = SessionClient.prototype.onChange;
			SessionClient.prototype.onChange = function (handler: (state: { data: unknown }) => void) {
				onChange.call(this, (state: { data: unknown }) => {
					Object.assign(window, { goldenPlayerData: state.data });
					handler(state);
				});
			};
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		await player.getByRole('button', { name: 'Join a table' }).click();
		const dialog = player.getByRole('dialog', { name: 'Join a table' });
		await dialog.getByLabel('Invite code from your DM').fill(offer);
		await dialog.getByRole('button', { name: 'Join', exact: true }).click();
		const answer = await dialog.locator('textarea[readonly]').inputValue();
		await page.evaluate(async (code) => {
			await (
				window as unknown as { goldenHost: { acceptAnswer(code: string): Promise<void> } }
			).goldenHost.acceptAnswer(code);
			await new Promise((resolve) => setTimeout(resolve, 0));
		}, answer);
		await expect(dialog.getByTestId('session-connection')).toContainText('Connected');
		await player.keyboard.press('Escape');
		await expect(player.getByTestId('player-stage-map')).toBeVisible();
		await playerHealth.checkpoint('Projected map');
		await player.getByRole('button', { name: 'Handouts', exact: true }).click();
		await expect(player.getByText('Golden letter', { exact: true }).first()).toBeVisible();
		await expect(player.getByText('The guide is a dragon.', { exact: false })).toHaveCount(0);
		await expect(player.getByText('Golden secret', { exact: false })).toHaveCount(0);
		const received = await player.evaluate(() =>
			JSON.stringify((window as unknown as { goldenPlayerData: unknown }).goldenPlayerData),
		);
		expect(received).toContain('Golden letter');
		expect(received).not.toContain('The guide is a dragon.');
		expect(received).not.toContain('Golden secret');
		expect(received).not.toContain('Golden guide');
		expect(
			await player.evaluate(() =>
				Object.keys((window.__rt!.state as unknown as CoreStateSlice).content.items),
			),
		).toEqual([]);
		await playerHealth.checkpoint('Joined handouts');
		await expect(player.locator('body')).not.toContainText('The guide is a dragon.');
		try {
			const checks = await Promise.allSettled([
				hostHealth.assertHealthy(),
				playerHealth.assertHealthy(),
			]);
			const errors = checks.flatMap((result, index) =>
				result.status === 'rejected'
					? [`${index === 0 ? 'Host' : 'Player'}: ${String(result.reason)}`]
					: [],
			);
			expect(errors, 'Both devices must remain healthy').toEqual([]);
		} finally {
			await playerContext.close();
		}
	});
});

// Each mutant must trip the SAME assertion the journeys use. Baseline first prevents a vacuous
// rejection from unrelated fixture damage; a fresh page isolates each injected defect.
for (const defect of [
	'warning',
	'error',
	'pageerror',
	'request',
	'http',
	'widget',
	'disabled',
	'clip-x',
	'clip-y',
]) {
	test(`health detector rejects seeded ${defect}`, async ({ page }) => {
		await page.route('**/golden-fixture', (route) =>
			route.fulfill({ contentType: 'text/html', body: '<main>Healthy</main>' }),
		);
		await page.goto('/golden-fixture');
		const health = watchJourney(page);
		await health.assertHealthy();
		if (defect === 'request' || defect === 'http') {
			await page.route('**/golden-defect', (route) =>
				defect === 'request'
					? route.abort('failed')
					: route.fulfill({ status: 503, body: 'seeded' }),
			);
			await page.evaluate(() => fetch('/golden-defect').catch(() => {}));
		} else {
			await page.evaluate((kind) => {
				if (kind === 'warning') console.warn('seeded warning');
				else if (kind === 'error') console.error('seeded error');
				else if (kind === 'pageerror')
					setTimeout(() => {
						throw new Error('seeded page error');
					}, 0);
				else if (kind === 'widget')
					document.body.innerHTML += '<div data-testid="widget-placeholder">Renderer failed</div>';
				else if (kind === 'disabled') document.body.innerHTML += '<button disabled>Save</button>';
				else
					document.body.innerHTML += `<div style="width:40px;height:20px;overflow:hidden;${kind === 'clip-x' ? 'white-space:nowrap' : ''}">This is the complete long text that must remain recoverable.</div>`;
			}, defect);
		}
		const diagnostic = {
			warning: 'console warning: seeded warning',
			error: 'console error: seeded error',
			pageerror: 'page error: seeded page error',
			request: 'request failed:',
			http: 'HTTP 503:',
			widget: 'widget error:',
			disabled: 'disabled without reason:',
			'clip-x': 'unrecoverable clip (x):',
			'clip-y': 'unrecoverable clip (y):',
		}[defect]!;
		await expect
			.poll(() =>
				health.assertHealthy().then(
					() => '',
					(error) => String(error),
				),
			)
			.toContain(diagnostic);
	});
}

test('detector accepts scroll affordances and complete accessible text', async ({ page }) => {
	await page.setContent(
		'<div style="width:40px;height:20px;overflow:auto">Long content that can be scrolled in both directions</div><div title="Complete readable text" style="width:40px;overflow:hidden;white-space:nowrap">Complete readable text</div><p id="reason">Choose a scene first</p><button disabled aria-describedby="reason">Start</button>',
	);
	await watchJourney(page).assertHealthy();
});

// A skip link parked above the viewport is not clipped by the shell's overflow; a one-pixel
// helper below the fold makes the shell a clip candidate, as on /characters.
const PARKED_SKIP_LINK =
	'<a href="#m" style="position:fixed;top:-40px;left:8px">Skip to content</a><main id="m">Body</main><span style="position:absolute;top:800px;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%)">Helper</span>';

test('detector accepts a fixed skip link outside a clipped shell', async ({ page }) => {
	await page.setContent(
		`<div style="position:relative;height:300px;overflow:hidden">${PARKED_SKIP_LINK}</div>`,
	);
	await watchJourney(page).assertHealthy();
});

for (const [name, markup] of [
	[
		'nested clip inside a scroller',
		'<div style="width:100px;overflow:auto"><div style="width:40px;overflow:hidden;white-space:nowrap">Clipped text inside a scrollable ancestor</div></div>',
	],
	[
		'unrelated accessible label',
		'<div aria-label="Summary" style="width:40px;overflow:hidden;white-space:nowrap">Complete text that the label does not provide</div>',
	],
	[
		'a fixed box trapped by a transformed clip',
		`<div style="position:relative;height:300px;overflow:hidden;transform:translateZ(0)">${PARKED_SKIP_LINK}</div>`,
	],
	[
		'ARIA disabled with a dangling reason',
		'<button aria-disabled="true" aria-describedby="missing">Start</button>',
	],
] as const) {
	test(`detector rejects ${name}`, async ({ page }) => {
		await page.setContent('<main>Healthy</main>');
		const health = watchJourney(page);
		await health.assertHealthy();
		await page.setContent(markup);
		await expect(health.assertHealthy()).rejects.toThrow(
			name.startsWith('ARIA') ? 'disabled without reason' : 'unrecoverable clip',
		);
	});
}

// A root's scrollHeight can include an absolutely positioned, visually hidden helper even
// though all visible content is inside an operable scroller. Reproduce the roster-shell case.
test('detector accepts inner scrolling and offscreen screen-reader helpers', async ({ page }) => {
	await page.setContent(`
		<div id="shell" style="position:relative;height:40px;overflow:hidden">
			<div style="height:40px;overflow:auto"><div style="height:120px">Scrollable content</div><button>Reachable by scrolling</button></div>
			<span style="position:absolute;top:90px;width:1px;height:1px;clip:rect(0,0,0,0);clip-path:inset(50%);overflow:hidden">Full keyboard instructions</span>
		</div>`);
	expect(await page.locator('#shell').evaluate((el) => el.scrollHeight > el.clientHeight + 2)).toBe(
		true,
	);
	await watchJourney(page).assertHealthy();
});

test('an inner scroller does not excuse clipped sibling content', async ({ page }) => {
	await page.setContent(
		'<div style="height:40px;overflow:hidden"><div style="height:30px;overflow:auto">Scrollable</div><p>Lost sibling content</p></div>',
	);
	await expect(watchJourney(page).assertHealthy()).rejects.toThrow('unrecoverable clip');
});

test('detector accepts full text in the containing control accessible name', async ({ page }) => {
	await page.setContent(
		'<button><span style="display:block;width:40px;overflow:hidden;white-space:nowrap">The complete readable note summary</span></button>',
	);
	await expect(page.getByRole('button')).toHaveAccessibleName('The complete readable note summary');
	await watchJourney(page).assertHealthy();
});

test('an overriding accessible name cannot excuse clipped child text', async ({ page }) => {
	await page.setContent(
		'<button aria-label="Open note"><span style="display:block;width:40px;overflow:hidden;white-space:nowrap">The missing note summary</span></button>',
	);
	await expect(page.getByRole('button')).toHaveAccessibleName('Open note');
	await expect(watchJourney(page).assertHealthy()).rejects.toThrow('unrecoverable clip');
});

test('accessible names cannot hide clipped graphical content', async ({ page }) => {
	await page.setContent(
		'<button title="Map" style="width:40px;height:40px;overflow:hidden"><span>Map</span><canvas width="200" height="200" aria-label="Map"></canvas></button>',
	);
	await expect(watchJourney(page).assertHealthy()).rejects.toThrow('unrecoverable clip');
});

for (const [name, markup, diagnostic] of [
	[
		'leading-edge text',
		'<div style="width:100px;height:30px;overflow:hidden"><div style="position:relative;left:-60px;white-space:nowrap">Missing prefix</div></div>',
		'unrecoverable clip (x)',
	],
	[
		'leading-edge vertical text',
		'<div style="height:30px;overflow:hidden"><div style="position:relative;top:-15px">Missing top</div></div>',
		'unrecoverable clip (y)',
	],
	[
		'SVG bounds',
		'<div style="width:40px;height:40px;overflow:hidden"><svg width="200" height="200"><rect width="200" height="200" fill="red" /></svg></div>',
		'unrecoverable clip',
	],
	['action-only tooltip', '<button disabled title="Save">Save</button>', 'disabled without reason'],
	[
		'IconButton action-only tooltip',
		'<button disabled title="Save" aria-label="Save"><svg width="16" height="16"><path d="M0 0L16 16" /></svg></button>',
		'disabled without reason',
	],
] as const) {
	test(`detector rejects ${name}`, async ({ page }) => {
		await page.setContent(markup);
		await expect(watchJourney(page).assertHealthy()).rejects.toThrow(diagnostic);
	});
}

test('containing control identity survives insertion after geometry capture', async ({ page }) => {
	await page.setContent(
		'<button><span style="display:block;width:40px;overflow:hidden;white-space:nowrap">The complete readable note summary</span></button>',
	);
	// Insert at the exact boundary before accessible-name lookup, without a timing race.
	const original = page.getByRole.bind(page);
	let inserted = false;
	page.getByRole = ((...args: Parameters<Page['getByRole']>) => {
		const locator = original(...args);
		const evaluateAll = locator.evaluateAll.bind(locator);
		locator.evaluateAll = async (...evaluation: Parameters<typeof locator.evaluateAll>) => {
			await page.evaluate(() => document.body.prepend(document.createElement('div')));
			inserted = true;
			return evaluateAll(...evaluation);
		};
		return locator;
	}) as Page['getByRole'];
	try {
		await watchJourney(page).assertHealthy();
		expect(inserted).toBe(true);
	} finally {
		page.getByRole = original;
	}
});
