import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
	dispatch,
	enterPreview,
	exitPreview,
	gotoRoute,
	markOnboarded,
	preferTier,
} from './_helpers';

// RC-POL-1.17 — the Settings polish pass (roadmap §20.2–§20.5). Every category and the overlays a
// local build can open are scanned with the strict tag set on both profiles; the journal
// (state/RC-POL-1.17.journal.md) lists the signed-in cloud dialogs this build cannot reach.

const CATEGORIES = [
	'appearance',
	'language',
	'account',
	'subscription',
	'players',
	'permissions',
	'vault',
	'sync',
	'tools',
	'ai',
	'plugins',
	'systems',
	'accessibility',
	'about',
] as const;

async function axe(page: Page) {
	// Dialogs and toasts fade in; measuring mid-entrance reads a half-transparent colour pair.
	await page.evaluate(async () => {
		await Promise.all(
			document
				.getAnimations()
				.filter((a) => a.effect?.getTiming().iterations !== Infinity)
				.map((a) => a.finished.catch(() => undefined)),
		);
	});
	const result = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'])
		.analyze();
	expect(result.violations).toEqual([]);
}

/** Open one category the way a person would on this profile: the rail on desktop, the picker on a phone. */
async function openCategory(page: Page, id: string, label: string) {
	if (test.info().project.name.startsWith('mobile'))
		await page.getByRole('combobox', { name: 'Settings section' }).selectOption(id);
	else
		await page
			.getByRole('navigation', { name: 'Settings navigation' })
			.getByRole('button', { name: label })
			.click();
	await expect(page).toHaveURL(new RegExp(`tab=${id}`));
}

/**
 * Chromium's origin-private file system hands out a real, structured-cloneable directory handle, so
 * the folder-source flow (connect → persisted handle → import/export → disconnect) runs for real.
 */
async function stubFolderPicker(page: Page) {
	await page.addInitScript(() => {
		Object.defineProperty(window, 'showDirectoryPicker', {
			configurable: true,
			value: async () => {
				const root = await navigator.storage.getDirectory();
				return root.getDirectoryHandle('Table notes', { create: true });
			},
		});
	});
}

test.beforeEach(async ({ page }) => {
	await markOnboarded(page);
	await preferTier(page, 'advanced');
	await page.addInitScript(() => {
		try {
			if (localStorage.getItem('dndtools.ai.usage-preference') === null)
				localStorage.setItem('dndtools.ai.usage-preference', 'complete');
		} catch {
			/* storage is best-effort */
		}
	});
});

test('every Settings category is axe clean', async ({ page }) => {
	test.setTimeout(120_000);
	await gotoRoute(page, '/settings');
	const labels: Record<string, string> = {
		appearance: 'Appearance',
		language: 'Language & region',
		account: 'Account',
		subscription: 'Subscription',
		players: 'Players',
		permissions: 'Permissions',
		vault: 'Vault connections',
		sync: 'Backup & history',
		tools: 'Tool preferences',
		ai: 'AI & tools',
		plugins: 'Plugins',
		systems: 'Extensions & systems',
		accessibility: 'Accessibility',
		about: 'About & diagnostics',
	};
	for (const id of CATEGORIES) {
		await openCategory(page, id, labels[id]);
		await expect(page.locator('#main-content section').first()).toBeVisible();
		await axe(page);
	}
});

test('a category hidden by the experience level explains itself and is axe clean', async ({
	page,
}) => {
	await page.addInitScript(() => localStorage.setItem('dndtools:react:tier', 'core'));
	await gotoRoute(page, '/settings?tab=permissions');
	await expect(
		page.getByRole('heading', { name: 'Hidden at your experience level' }),
	).toBeVisible();
	await axe(page);
});

test('backup, privacy and provider dialogs are axe clean, named and return focus', async ({
	page,
}) => {
	await gotoRoute(page, '/settings?tab=sync');
	// Local backup leads the category (its tap target must clear the compact shell's navigation).
	await expect(page.locator('#main-content h2').first()).toHaveText('Local backup');

	const download = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Download backup' }).click();
	const backupPath = await (await download).path();
	const chooser = page.waitForEvent('filechooser');
	const restore = page.getByRole('button', { name: 'Restore from backup…' });
	await restore.click();
	await (await chooser).setFiles(backupPath!);
	const replace = page.getByRole('alertdialog', { name: 'Replace this vault?' });
	await expect(replace).toBeVisible();
	await expect(replace.getByRole('button', { name: 'Cancel' })).toBeFocused();
	await axe(page);
	await page.keyboard.press('Escape');
	await expect(replace).toHaveCount(0);

	await page.getByRole('button', { name: 'Switch to Cloud-Enhanced…' }).click();
	const consent = page.getByRole('alertdialog', { name: 'Switch to Cloud-Enhanced?' });
	await expect(consent).toBeVisible();
	await expect(consent.getByLabel('Type “read my vault” to confirm')).toBeVisible();
	await axe(page);
	await consent.getByRole('button', { name: 'Cancel' }).click();
	await expect(page.getByRole('button', { name: 'Switch to Cloud-Enhanced…' })).toBeFocused();

	await gotoRoute(page, '/settings?tab=ai');
	await page.getByLabel('Provider API key').fill('sk-ant-polish-test');
	await page.getByRole('button', { name: 'Save key' }).click();
	const destination = page.getByRole('dialog', { name: 'Confirm credential destination' });
	await expect(destination).toBeVisible();
	await expect(destination).toContainText('https://api.anthropic.com');
	await axe(page);
	await destination.getByRole('button', { name: 'Cancel' }).click();
	await expect(destination).toHaveCount(0);
});

test('Knowledge sources: a folder connects, exports, and disconnects by name', async ({ page }) => {
	await stubFolderPicker(page);
	await gotoRoute(page, '/settings?tab=vault');
	await expect(page.getByText('No sources connected')).toBeVisible();
	// "Open Knowledge → Sources" lands on the Sources panel itself, not the note list.
	await page.getByRole('button', { name: 'Open Knowledge → Sources' }).click();
	const sources = page.locator('section').filter({
		has: page.getByRole('heading', { name: 'Connected sources' }),
	});
	await expect(sources).toBeVisible();

	await sources.getByRole('button', { name: 'Connect folder…' }).click();
	await expect(sources.getByText('Table notes', { exact: true })).toBeVisible();
	await expect(sources.getByRole('status').filter({ hasText: 'Folder connected.' })).toBeVisible();
	await sources.getByRole('button', { name: 'Export notes' }).click();
	// Seeded notes carry front matter the folder keeps, so the export either writes directly or asks
	// to accept a formatting change first; both end with the per-row outcome in its live region.
	const lossy = page.getByRole('dialog', { name: /^Exporting to “Table notes”/ });
	const exported = sources.getByRole('status').filter({ hasText: /^Exported \d+ of / });
	await expect(lossy.or(exported)).toBeVisible();
	if (await lossy.isVisible()) {
		await axe(page);
		await lossy.getByRole('button', { name: 'Accept changes & export' }).click();
	}
	await expect(exported).toBeVisible();
	await axe(page);

	const disconnect = sources.getByRole('button', { name: 'Disconnect' });
	await disconnect.click();
	const confirm = page.getByRole('dialog', { name: 'Disconnect “Table notes”?' });
	await expect(confirm).toBeVisible();
	await axe(page);
	await confirm.getByRole('button', { name: 'Cancel' }).click();
	await expect(disconnect).toBeFocused();

	// Settings lists the same registry and confirms its own disconnect by name.
	await gotoRoute(page, '/settings?tab=vault');
	await expect(page.getByText('Table notes', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Disconnect' }).click();
	const settingsConfirm = page.getByRole('dialog', { name: 'Disconnect this folder?' });
	await expect(settingsConfirm).toContainText('Table notes');
	await axe(page);
	await settingsConfirm.getByRole('button', { name: 'Disconnect' }).click();
	await expect(page.getByText('No sources connected')).toBeVisible();
});

test('keyboard only: the theme picker moves with arrow keys and focus stays visible', async ({
	page,
}) => {
	await gotoRoute(page, '/settings?tab=appearance');
	const theme = page.getByRole('radiogroup', { name: 'Theme' });
	const tavern = theme.getByRole('radio', { name: 'Tavern' });
	await tavern.focus();
	await expect(tavern).toBeFocused();
	expect(await tavern.evaluate((el) => el.matches(':focus-visible'))).toBe(true);
	await page.keyboard.press('ArrowRight');
	const parchment = theme.getByRole('radio', { name: 'Parchment' });
	await expect(parchment).toBeFocused();
	await expect(parchment).toHaveAttribute('aria-checked', 'true');
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'parchment');
	await page.keyboard.press('ArrowLeft');
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'tavern');
});

test('a refused grant says so and leaves the grant list unchanged', async ({ page }) => {
	await gotoRoute(page, '/settings?tab=permissions');
	const before = await page.evaluate(() => window.__rt!.state.permissions.grants.length);
	await page.evaluate(() => {
		const rt = window.__rt!;
		const original = rt.dispatch.bind(rt);
		rt.dispatch = async (command) => {
			if (command.type === 'permission.grant-capability-set') {
				rt.dispatch = original;
				throw new Error('Storage unavailable');
			}
			return original(command);
		};
	});
	await page.getByRole('button', { name: 'Grant', exact: true }).click();
	await expect(page.getByText('Storage unavailable')).toBeVisible();
	expect(await page.evaluate(() => window.__rt!.state.permissions.grants.length)).toBe(before);

	// The retry goes through, and the new row names the scene and the player, never their ids.
	await page.getByRole('button', { name: 'Grant', exact: true }).click();
	await expect(page.getByText(/^Access granted to /)).toBeVisible();
	await expect(page.locator('#main-content')).not.toContainText(/[0-9a-f]{8}-[0-9a-f]{4}-/);
	await expect(
		page.getByRole('button', { name: /^Revoke Co-editor on The Sunken Crypt for / }),
	).toBeVisible();
	await axe(page);
});

test('a scene grant reaches the player through their actor read', async ({ page }) => {
	await gotoRoute(page, '/settings?tab=permissions');
	const dmId = await page.evaluate(() => window.__rt!.defaultActorId);
	const created = await dispatch(page, {
		type: 'scene.create',
		actorId: dmId,
		payload: { name: 'Lantern Market', description: '', visibility: 'shared', tags: [] },
	});
	expect(created.status).toBe('accepted');
	const { playerId, sharedId, dmOnlyId } = await page.evaluate(() => {
		const state = window.__rt!.state as unknown as {
			permissions: { actors: Record<string, { id: string; role: string }> };
			scenes: { scenes: Record<string, { id: string; name: string }> };
		};
		const scenes = Object.values(state.scenes.scenes);
		return {
			playerId: Object.values(state.permissions.actors).find((a) => a.role === 'player')!.id,
			sharedId: scenes.find((s) => s.name === 'Lantern Market')!.id,
			dmOnlyId: scenes.find((s) => s.name === 'The Sunken Crypt')!.id,
		};
	});
	const root = process.cwd().replace(/\/apps\/gm-react$/, '');
	// The player's own projection, read through the core query their view renders from.
	const visibleTo = (sceneId: string) =>
		page.evaluate(
			async ({ root, playerId, sceneId }) => {
				const core = await import(/* @vite-ignore */ `/@fs${root}/packages/core/src/index.ts`);
				const rt = window.__rt!;
				const view = core.getSceneForActor(
					rt.state.scenes,
					rt.state.permissions,
					playerId,
					sceneId,
				);
				return !('kind' in view && view.kind === 'denied');
			},
			{ root, playerId, sceneId },
		);
	const grant = async (sceneId: string) => {
		await page.getByRole('combobox', { name: 'Player' }).selectOption(playerId);
		await page.getByRole('combobox', { name: 'Scene' }).selectOption(sceneId);
		await page.getByRole('radio', { name: 'Viewer' }).click();
		await page.getByRole('button', { name: 'Grant', exact: true }).click();
	};
	expect(await visibleTo(sharedId)).toBe(false);
	await grant(sharedId);
	await expect(
		page.getByRole('button', { name: /^Revoke Viewer on Lantern Market for / }),
	).toBeVisible();
	expect(await visibleTo(sharedId)).toBe(true);
	// A grant never lifts a DM-only scene: the core keeps it hidden whatever Settings records.
	await grant(dmOnlyId);
	await expect(
		page.getByRole('button', { name: /^Revoke Viewer on The Sunken Crypt for / }),
	).toBeVisible();
	expect(await visibleTo(dmOnlyId)).toBe(false);
	await page.getByRole('button', { name: /^Revoke Viewer on Lantern Market for / }).click();
	await expect(
		page.getByRole('button', { name: /^Revoke Viewer on Lantern Market for / }),
	).toHaveCount(0);
	expect(await visibleTo(sharedId)).toBe(false);
});

test('player preview: Settings cannot write and DM-only panels say why', async ({ page }) => {
	await gotoRoute(page, '/settings?tab=permissions');
	await enterPreview(page, 'player');
	const grants = await page.evaluate(() => window.__rt!.state.permissions.grants.length);
	const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
	const sceneId = await page.evaluate(
		() =>
			Object.keys(
				(window.__rt!.state as unknown as { scenes: { scenes: object } }).scenes.scenes,
			)[0],
	);
	const playerId = await page.evaluate(
		() =>
			Object.values(
				window.__rt!.state.permissions.actors as Record<string, { id: string; role: string }>,
			).find((a) => a.role === 'player')!.id,
	);
	const result = await dispatch(page, {
		type: 'permission.grant-capability-set',
		actorId,
		payload: {
			entityType: 'scene',
			entityId: sceneId,
			playerActorId: playerId,
			capabilitySet: 'viewer',
			expiresAt: null,
		},
	});
	expect(result.status).toBe('rejected');
	expect(await page.evaluate(() => window.__rt!.state.permissions.grants.length)).toBe(grants);
	await gotoRoute(page, '/settings?tab=about');
	await expect(page.getByText('Diagnostics are DM only. Ask your DM to open them.')).toBeVisible();
	await axe(page);
	await exitPreview(page);
});

test('200% text keeps every category inside the viewport', async ({ page }) => {
	test.setTimeout(120_000);
	await gotoRoute(page, '/settings');
	await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
	for (const id of CATEGORIES) {
		await page.goto(`/#/settings?tab=${id}`, { waitUntil: 'domcontentloaded' });
		await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
		await expect(page.locator('#main-content section').first()).toBeVisible();
		const overflow = await page.evaluate(() => {
			const main = document.querySelector('#main-content') as HTMLElement;
			return main.scrollWidth - main.clientWidth;
		});
		expect(overflow, `${id} overflows horizontally at 200% text`).toBeLessThanOrEqual(1);
	}
});
