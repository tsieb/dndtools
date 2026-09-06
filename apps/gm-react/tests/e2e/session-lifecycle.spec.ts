import { expect, test, type Page } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh } from './_helpers';

// RC-SES-1.3 — the START and END flows on /session.
//
// Starting used to be a single "Go live" press that silently resolved a scene (the session's, else
// the home Scene, else whatever came first out of the vault) and never named it, and ending was
// reachable only by moving the phase rail onto a radio labelled "Standby" — whose one outcome threw
// the whole session away with no archive. This spec drives both flows through the UI and asserts the
// durable core state that comes out, including that the core's `allowedTransitionsFrom` gating is
// still what decides which endings are offered.

const phases = (page: Page) => page.getByRole('radiogroup', { name: 'Session phase' });
const startDialog = (page: Page) => page.getByRole('dialog', { name: 'Start a session' });
const endDialog = (page: Page) => page.getByRole('dialog', { name: 'End the live session?' });

function session(
	page: Page,
): Promise<{ workflow: string; title: string | null; scene: string | null }> {
	return page.evaluate(() => {
		const s = window.__rt!.state.session as unknown as {
			workflow: string;
			title: string | null;
			activeSceneId: string | null;
		};
		return { workflow: s.workflow, title: s.title, scene: s.activeSceneId };
	});
}

/** Move the workflow with the core directly — the shortcut for arranging a state, never the assertion. */
async function setWorkflow(page: Page, workflow: string): Promise<void> {
	const result = await page.evaluate(async (target) => {
		const rt = window.__rt!;
		const state = rt.state as unknown as {
			session: { activeSceneId: string | null };
			commandCenter: { homeSceneId: string | null };
			scenes: { scenes: Record<string, { id: string; isTemplate?: boolean }> };
		};
		const sceneId =
			state.session.activeSceneId ??
			state.commandCenter.homeSceneId ??
			Object.values(state.scenes.scenes).find((s) => !s.isTemplate)?.id;
		return rt.dispatch({
			type: 'session.set-workflow',
			actorId: rt.defaultActorId,
			payload: { workflow: target, activeSceneId: sceneId },
		});
	}, workflow);
	expect(result.status, result.rejection?.message ?? '').toBe('accepted');
}

test.beforeEach(async ({ page }) => {
	await markOnboarded(page);
	await gotoRoute(page, '/session');
	await seedFresh(page);
	await gotoRoute(page, '/session');
});

test.describe('starting a session is a flow, not a silent press', () => {
	// Prep puts a scene on the session, which is what a "Continue" start resumes. A vault with no
	// active and no home Scene has nothing to continue — covered by its own test below.
	test.beforeEach(async ({ page }) => {
		await setWorkflow(page, 'prep');
	});

	test('Go live asks which scene, and continuing keeps the session unnamed', async ({ page }) => {
		expect((await session(page)).workflow).toBe('prep');
		await page.getByRole('button', { name: 'Go live', exact: true }).click();

		const dialog = startDialog(page);
		await expect(dialog).toBeVisible();
		// Nothing durable has happened yet — the dialog is a question, not a transition.
		expect((await session(page)).workflow).toBe('prep');
		await expect(dialog.getByText(/^Continue .+\?$/)).toBeVisible();

		await dialog.getByRole('button', { name: 'Go live', exact: true }).click();
		await expect(dialog).toBeHidden();
		await expect.poll(async () => (await session(page)).workflow).toBe('active');
		const live = await session(page);
		expect(live.title).toBeNull();
		expect(live.scene).not.toBeNull();
	});

	test('a new session takes the scene and the name it was given', async ({ page }) => {
		await page.getByRole('button', { name: 'Go live', exact: true }).click();
		const dialog = startDialog(page);
		await dialog.getByRole('radio', { name: 'New session' }).click();

		const scene = dialog.getByLabel('Scene');
		await expect(scene).toBeVisible();
		const sceneId = await scene.inputValue();
		await dialog.getByLabel('Session name').fill('  Session 12 — the drowned vault  ');
		await dialog.getByRole('button', { name: 'Go live', exact: true }).click();

		await expect.poll(async () => (await session(page)).workflow).toBe('active');
		const live = await session(page);
		// The name is trimmed by the core schema, and the scene is the one the DM chose.
		expect(live.title).toBe('Session 12 — the drowned vault');
		expect(live.scene).toBe(sceneId);
		// And the header leads with the name it was given.
		await expect(page.getByText('Session 12 — the drowned vault').first()).toBeVisible();
	});

	test('cancelling leaves the session exactly where it was', async ({ page }) => {
		await page.getByRole('button', { name: 'Go live', exact: true }).click();
		await startDialog(page).getByRole('button', { name: 'Cancel' }).click();
		await expect(startDialog(page)).toHaveCount(0);
		expect((await session(page)).workflow).toBe('prep');
	});

	test('the phase rail routes through the same flow rather than going live behind it', async ({
		page,
	}) => {
		await phases(page).getByRole('radio', { name: 'Live' }).click();
		await expect(startDialog(page)).toBeVisible();
		expect((await session(page)).workflow).toBe('prep');
	});
});

// A vault whose session has never been anywhere has nothing to continue, so the dialog opens on the
// picker with no continue/new rail at all rather than offering to resume a scene it invented.
test('with nothing to continue, the start flow opens straight on the scene picker', async ({
	page,
}) => {
	expect((await session(page)).workflow).toBe('idle');
	await page.getByRole('button', { name: 'Go live', exact: true }).click();
	const dialog = startDialog(page);
	await expect(dialog).toBeVisible();
	await expect(dialog.getByRole('radiogroup', { name: 'How to start' })).toHaveCount(0);
	await expect(dialog.getByLabel('Scene')).toBeVisible();
	await dialog.getByLabel('Session name').fill('The drowned vault');
	await dialog.getByRole('button', { name: 'Go live', exact: true }).click();
	await expect.poll(async () => (await session(page)).workflow).toBe('active');
	expect((await session(page)).title).toBe('The drowned vault');
});

test.describe('ending a session offers both honest outcomes', () => {
	test.beforeEach(async ({ page }) => {
		await setWorkflow(page, 'active');
	});

	test('End and review archives the session, name and all', async ({ page }) => {
		// Live already: the standby card is gone, so the end flow starts from the header control.
		await page.getByRole('button', { name: 'End session', exact: true }).click();
		const dialog = endDialog(page);
		await expect(dialog).toBeVisible();
		await dialog.getByRole('button', { name: 'End and review' }).click();

		await expect.poll(async () => (await session(page)).workflow).toBe('recap');
		const archived = await page.evaluate(() => {
			const s = window.__rt!.state.session as unknown as {
				recapArchiveId: string | null;
				archives: Record<string, { activeSceneId: string | null }>;
			};
			return s.recapArchiveId ? !!s.archives[s.recapArchiveId] : false;
		});
		expect(archived).toBe(true);
	});

	test('End session discards it with no archive, and Stay live changes nothing', async ({
		page,
	}) => {
		await page.getByRole('button', { name: 'End session', exact: true }).click();
		await endDialog(page).getByRole('button', { name: 'Stay live' }).click();
		await expect(endDialog(page)).toBeHidden();
		expect((await session(page)).workflow).toBe('active');

		await page.getByRole('button', { name: 'End session', exact: true }).click();
		await endDialog(page).getByRole('button', { name: 'End session', exact: true }).click();
		await expect.poll(async () => (await session(page)).workflow).toBe('idle');
		const archives = await page.evaluate(
			() =>
				Object.keys(
					(window.__rt!.state.session as unknown as { archives: Record<string, unknown> }).archives,
				).length,
		);
		expect(archives).toBe(0);
	});

	test('a state with no legal move to Recap is not offered one', async ({ page }) => {
		// `recap → recap` is legal, `recap → active` is not: from Recap the end dialog is unreachable
		// (no live session to end) and the start flow stays closed, exactly as the core's transition
		// table says. Assert the gating the story must retain.
		await setWorkflow(page, 'recap');
		await expect(page.getByRole('button', { name: 'End session', exact: true })).toHaveCount(0);
		const goLive = page.getByRole('button', { name: 'Go live', exact: true });
		await expect(goLive).toHaveAttribute('aria-disabled', 'true');
		await goLive.dispatchEvent('click');
		await expect(startDialog(page)).toHaveCount(0);
		expect((await session(page)).workflow).toBe('recap');
	});
});
