import { execFileSync } from 'node:child_process';
import {
	expect,
	test,
	type Browser,
	type Locator,
	type Page,
	type TestInfo,
} from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, waitReady } from './_helpers';

// RC-UX-3.7 — the demo campaign as inspiration, from the vault switcher. "Explore the demo campaign"
// opens a SEPARATE demo vault seeded with the showcase, badged "Demo" wherever its name shows. The
// journey edits the demo, resets it, and returns to the GM's own vault with its op log exactly as it
// was. Inside the demo, cloud sync, local backup and hosting or joining a table all refuse. It runs
// at the profile's own viewport, so the phone project drives the More sheet and the table-controls
// sheet while the desktop project drives the sidebar chip and the top bar.

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) <= 640;

const opIds = (page: Page): Promise<string[]> =>
	page.evaluate(() => window.__rt!.state.sync.operations.map((op) => op.id));
const vaultId = (page: Page): Promise<string> => page.evaluate(() => window.__rt!.vaultId);

/** The op log after the home board's first-paint commands have landed (it stops growing). */
async function settledOpIds(page: Page): Promise<string[]> {
	let previous = -1;
	await expect
		.poll(
			async () => {
				const count = (await opIds(page)).length;
				const settled = count === previous;
				previous = count;
				return settled;
			},
			{ intervals: [500], timeout: 15_000 },
		)
		.toBe(true);
	return opIds(page);
}

async function openSwitcher(page: Page): Promise<Locator> {
	if (isPhone(page)) {
		await page.getByRole('button', { name: 'More', exact: true }).click();
		await page.getByRole('button', { name: /^Local vaults/ }).click();
	} else {
		await page.getByRole('button', { name: 'Local vaults', exact: true }).click();
	}
	const dialog = page.getByRole('dialog', { name: 'Local vaults' });
	await expect(dialog).toBeVisible();
	return dialog;
}

/** Click a switcher action that reloads the document, and wait for the new document's runtime. */
async function reloadingClick(page: Page, target: Locator): Promise<void> {
	const reloaded = page.waitForEvent('load', { timeout: 30_000 });
	await target.click();
	await reloaded;
	await waitReady(page);
	expect(new URL(page.url()).hash).toBe('#/');
}

/** The showcase facts the seed guarantees; a reset must bring every one of them back. */
function showcase(page: Page) {
	return page.evaluate(() => {
		const state = window.__rt!.state as unknown as {
			systems: { activePackageId: string };
			session: { workflow: string; combat: { status: string; tokens: Record<string, unknown> } };
			scenes: { scenes: Record<string, { name: string; widgets: { type: string }[] }> };
			mcp: { proposals: Record<string, { status: string }> };
		};
		const screen = Object.values(state.scenes.scenes).find(
			(scene) => scene.name === 'Showdown at the reliquary',
		);
		return {
			system: state.systems.activePackageId,
			workflow: state.session.workflow,
			combat: state.session.combat.status,
			tokens: Object.keys(state.session.combat.tokens).length,
			screenWidgets: screen?.widgets.map((widget) => widget.type) ?? [],
			pendingProposals: Object.values(state.mcp.proposals).filter((p) => p.status === 'pending')
				.length,
		};
	});
}

function noteTitles(page: Page): Promise<string[]> {
	return page.evaluate(() =>
		Object.values(
			(window.__rt!.state.content as { items: Record<string, { title: string }> }).items,
		).map((item) => item.title),
	);
}

async function addNote(page: Page, title: string): Promise<void> {
	const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
	const result = await dispatch(page, {
		type: 'content.create-item',
		actorId,
		payload: { kind: 'note', title, body: `${title} body`, visibility: 'dm-only' },
	});
	expect(result.status).toBe('accepted');
}

/** The demo badge beside the vault name in this viewport's navigation. */
async function expectDemoBadge(page: Page): Promise<void> {
	if (isPhone(page)) {
		await page.getByRole('button', { name: 'More', exact: true }).click();
		const row = page.getByRole('button', { name: /^Local vaults/ });
		await expect(row).toContainText('Demo campaign');
		await expect(row).toContainText(/Demo$/);
		await page.keyboard.press('Escape');
	} else {
		const chip = page.getByRole('button', { name: 'Local vaults', exact: true });
		await expect(chip).toContainText('Demo campaign');
		await expect(chip.getByText('Demo', { exact: true })).toBeVisible();
	}
}

/** Cloud backup, local backup and a full restore, asked of THIS document's vault. */
function refusals(page: Page) {
	return page.evaluate(async () => {
		const load = (path: string) =>
			new Function(`return import(${JSON.stringify(path)})`)() as Promise<Record<string, unknown>>;
		const { getCloudSyncStatus } = (await load('/src/cloud/cloudSync.ts')) as {
			getCloudSyncStatus(account: string): Promise<{ vaultSupported: boolean }>;
		};
		const { exportFullVault } = (await load('/src/platform/backup.ts')) as {
			exportFullVault(): Promise<unknown>;
		};
		const cloud = (await getCloudSyncStatus('e2e-account')).vaultSupported;
		let backup = 'allowed';
		try {
			await exportFullVault();
		} catch (error) {
			backup = error instanceof Error ? error.message : String(error);
		}
		await new Promise((resolve) => setTimeout(resolve, 0));
		return { cloud, backup };
	});
}

/** Open the host dialog from this viewport's top bar (the phone keeps it in Table controls). */
async function openHostDialog(page: Page): Promise<Locator> {
	if (isPhone(page)) await page.getByRole('button', { name: 'Table controls' }).click();
	await page.getByRole('button', { name: /Host a live table/ }).click();
	const dialog = page.getByRole('dialog', { name: 'Host a live table' });
	await expect(dialog).toBeVisible();
	return dialog;
}

test('the demo opens from the switcher, resets, and leaves the GM vault untouched', async ({
	page,
}) => {
	test.setTimeout(180_000);
	await markOnboarded(page);
	await gotoRoute(page, '/');

	// ── The GM's own vault ────────────────────────────────────────────────────────────────────
	expect(await vaultId(page)).toBe('primary');
	const gmOps = await settledOpIds(page);
	expect(gmOps.length).toBeGreaterThan(0);

	// ── Explore the demo campaign ─────────────────────────────────────────────────────────────
	let dialog = await openSwitcher(page);
	await reloadingClick(
		page,
		dialog.getByRole('button', { name: 'Explore the demo campaign', exact: true }),
	);
	const demoId = await vaultId(page);
	expect(demoId).toMatch(/^local-/);
	const demoStart = await opIds(page);
	expect(demoStart.filter((id) => gmOps.includes(id))).toEqual([]);
	await expectDemoBadge(page);
	const seeded = await showcase(page);
	expect(seeded).toEqual({
		system: 'custom:saltreach-house-rules',
		workflow: 'active',
		combat: 'running',
		tokens: 6,
		screenWidgets: ['map', 'initiative-tracker', 'tide-clock'],
		pendingProposals: 1,
	});

	// The switcher lists it with its badge, and offers the way back and a reset.
	dialog = await openSwitcher(page);
	await expect(dialog.getByText('Demo', { exact: true })).toBeVisible();
	await expect(dialog.getByRole('button', { name: 'Back to my campaign' })).toBeVisible();
	await expect(dialog.getByRole('button', { name: 'Explore the demo campaign' })).toHaveCount(0);
	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);

	// ── Never synced, never backed up, never at a table ───────────────────────────────────────
	expect(await refusals(page)).toEqual({
		cloud: false,
		backup:
			'The demo campaign is never backed up. Open your own campaign to back it up or restore it.',
	});
	const host = await openHostDialog(page);
	await expect(host.getByText('The demo campaign can’t host or join a table.')).toBeVisible();
	await expect(host.getByRole('button', { name: 'Host on local network' })).toHaveCount(0);
	await page.keyboard.press('Escape');
	await expect(host).toHaveCount(0);
	expect(await page.evaluate(() => window.__rt!.vaultId)).toBe(demoId);

	// ── Edit it ───────────────────────────────────────────────────────────────────────────────
	await addNote(page, 'Demo scribble');
	await expect.poll(() => noteTitles(page)).toContain('Demo scribble');
	const edited = await opIds(page);

	// ── Reset it: the edit is gone and the showcase is back, in the same demo vault ───────────
	dialog = await openSwitcher(page);
	await dialog.getByRole('button', { name: 'Reset the demo', exact: true }).click();
	await expect(dialog.getByText(/Put the demo back the way it started\?/)).toBeVisible();
	await reloadingClick(page, dialog.getByRole('button', { name: 'Reset demo', exact: true }));
	expect(await vaultId(page)).toBe(demoId);
	expect(await noteTitles(page)).not.toContain('Demo scribble');
	expect(await showcase(page)).toEqual(seeded);
	expect((await opIds(page)).filter((id) => edited.includes(id))).toEqual([]);

	// ── Back to the GM's own vault, exactly as it was ─────────────────────────────────────────
	dialog = await openSwitcher(page);
	await reloadingClick(
		page,
		dialog.getByRole('button', { name: 'Back to my campaign', exact: true }),
	);
	expect(await vaultId(page)).toBe('primary');
	expect(await settledOpIds(page)).toEqual(gmOps);
	expect(await noteTitles(page)).not.toContain('Demo scribble');
	expect(await refusals(page)).toEqual({ cloud: true, backup: 'allowed' });

	// ── Exploring again reopens the same demo instead of adding a second one ──────────────────
	dialog = await openSwitcher(page);
	await expect(
		dialog.getByRole('button', { name: 'Open Demo campaign', exact: true }),
	).toBeVisible();
	await reloadingClick(
		page,
		dialog.getByRole('button', { name: 'Explore the demo campaign', exact: true }),
	);
	expect(await vaultId(page)).toBe(demoId);
});

// Opt-in, like local-vault-performance.spec.ts: timing a browser while the functional suite runs in
// parallel measures contention. The demo's FIRST load is the heavy one (the base seed plus the
// showcase, committed as one batch before the board paints), so every sample is a cold context
// whose catalog selects a never-opened demo vault. The original vault's cold first load (the
// perf harness's own `scene-first-render` scenario) is sampled in alternation, so host load hits
// both equally and the evidence carries the showcase's own cost. Run with --workers=1.
async function coldFirstRender(
	browser: Browser,
	use: TestInfo['project']['use'],
	demo: boolean,
): Promise<{ ms: number; fixture: string }> {
	const { baseURL, viewport, isMobile, hasTouch, deviceScaleFactor } = use;
	const context = await browser.newContext({
		baseURL,
		viewport,
		isMobile,
		hasTouch,
		deviceScaleFactor,
	});
	try {
		const page = await context.newPage();
		await page.addInitScript((selectDemo) => {
			localStorage.setItem('dndtools:react:onboarded', 'gate');
			if (!selectDemo || localStorage.getItem('dndtools:react:local-vaults-v1')) return;
			const demo = {
				id: 'local-demo-first-render',
				name: 'Demo campaign',
				createdAt: new Date().toISOString(),
				lastOpenedAt: null,
				kind: 'demo',
			};
			const original = { ...demo, id: 'primary', name: 'Your campaign', kind: 'campaign' };
			localStorage.setItem(
				'dndtools:react:local-vaults-v1',
				JSON.stringify({ schemaVersion: 1, vaults: [original, demo] }),
			);
			localStorage.setItem('dndtools:react:selected-local-vault', demo.id);
		}, demo);
		await page.goto('/#/board', { waitUntil: 'domcontentloaded' });
		await page.waitForFunction(
			(expectDemo) => {
				const rt = window.__rt as unknown as
					| {
							loaded: boolean;
							vaultId: string;
							state: {
								commandCenter: { homeSceneId: string | null };
								scenes: { scenes: Record<string, { widgets: unknown[] }> };
								session: { combat: { status: string } };
							};
					  }
					| undefined;
				if (!rt?.loaded) return false;
				if (expectDemo !== (rt.vaultId === 'local-demo-first-render')) return false;
				if (expectDemo && rt.state.session.combat.status !== 'running') return false;
				const id = rt.state.commandCenter.homeSceneId;
				if (!id || (rt.state.scenes.scenes[id]?.widgets.length ?? 0) === 0) return false;
				return (
					document.querySelectorAll('[data-testid="scene-board-bounded"] [data-testid^="widget-"]')
						.length > 0
				);
			},
			demo,
			{ timeout: 30_000, polling: 'raf' },
		);
		const ms = await page.evaluate(
			() =>
				new Promise<number>((resolve) => {
					requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now())));
				}),
		);
		const fixture = await page.evaluate(
			() =>
				`${window.__rt!.state.sync.operations.length} seeded operations, ${
					document.querySelectorAll('[data-testid="scene-board-bounded"] [data-testid^="widget-"]')
						.length
				} painted home widgets`,
		);
		return { ms: Math.round(ms * 10) / 10, fixture };
	} finally {
		await context.close();
	}
}

test('scene-first-render: the demo vault’s first load, seed included', async ({
	browser,
}, testInfo) => {
	test.skip(process.env.DNDTOOLS_VAULT_PERF !== '1', 'Dedicated performance capture only');
	test.setTimeout(300_000);
	const use = testInfo.project.use;
	// One discarded pair warms the dev server's module graph, as in the perf harness.
	await coldFirstRender(browser, use, false);
	await coldFirstRender(browser, use, true);
	const demo: number[] = [];
	const original: number[] = [];
	let demoFixture = '';
	let originalFixture = '';
	for (let pair = 0; pair < 5; pair++) {
		const first = pair % 2 === 0;
		for (const isDemo of first ? [true, false] : [false, true]) {
			const sample = await coldFirstRender(browser, use, isDemo);
			(isDemo ? demo : original).push(sample.ms);
			if (isDemo) demoFixture = sample.fixture;
			else originalFixture = sample.fixture;
		}
	}
	const median = (values: number[]) => [...values].sort((a, b) => a - b)[values.length >> 1]!;
	const evidence = {
		budgetId: 'scene-first-render',
		targetMs: 1500,
		scenario: 'Cold context → never-opened vault → /board painted (seed committed in one batch)',
		profile: testInfo.project.name,
		viewport: use.viewport,
		commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
		worktreeStatus: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
		demo: {
			fixture: demoFixture,
			samples: demo,
			medianMs: median(demo),
			maximumMs: Math.max(...demo),
		},
		original: {
			fixture: originalFixture,
			samples: original,
			medianMs: median(original),
			maximumMs: Math.max(...original),
		},
		showcaseCostMs: Math.round((median(demo) - median(original)) * 10) / 10,
	};
	await testInfo.attach('demo-scene-first-render.json', {
		body: JSON.stringify(evidence, null, 2),
		contentType: 'application/json',
	});
	console.log(JSON.stringify(evidence));
	expect(evidence.demo.medianMs).toBeLessThanOrEqual(evidence.targetMs);
});
