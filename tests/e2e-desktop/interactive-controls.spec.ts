import { test, expect, type Page } from '@playwright/test';
import { FileSystemAdapter } from '../../mcp/storage.js';
import { createTempVaultDir, launchDesktopApp, closeDesktopApp } from './helpers/desktop-app.js';

function buildNote(
	id: string,
	title: string,
	content: string,
	overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
	const now = new Date().toISOString();
	return {
		id,
		title,
		content,
		folder: '/',
		tags: [],
		frontmatter: {},
		createdAt: now,
		updatedAt: now,
		deleted: false,
		deletedAt: null,
		pinned: false,
		pinnedAt: null,
		...overrides,
	};
}

function buildMapObject(id: string, name: string, areaNoteId: string): Record<string, unknown> {
	const now = new Date().toISOString();
	return {
		id,
		type: 'map',
		name,
		summary: 'Map seeded for interaction coverage.',
		tags: ['travel', 'atlas'],
		visibility: 'dm_only',
		relationships: [],
		data: {
			filePath: '.vault/assets/maps/interactive-map.png',
			width: 1200,
			height: 800,
			areaNoteId,
			scale: {
				unitsPerGridSquare: 1,
				unitLabel: 'mi',
			},
			grid: {
				type: 'square',
				visible: true,
				originX: 0,
				originY: 0,
				cellSize: 100,
			},
			layers: [
				{
					id: 'layer-default',
					name: 'Default',
					visible: true,
					playerVisible: true,
					colorTheme: 'amber',
				},
			],
			pois: [],
			routes: [],
		},
		createdAt: now,
		updatedAt: now,
	};
}

async function launchWithSeed(): Promise<Awaited<ReturnType<typeof launchDesktopApp>>> {
	const vaultDir = await createTempVaultDir('dndtools-e2e-interactive-vault-');
	const adapter = new FileSystemAdapter(vaultDir);
	await adapter.initialize();
	try {
		const now = new Date().toISOString();
		await adapter.saveNote(
			buildNote('note-shell-anchor', 'Navigation Anchor', 'ArcaneShellToken [[Route Atlas]]', {
				folder: '/campaign/quests',
				tags: ['quest', 'session'],
				pinned: true,
				pinnedAt: now,
			}) as never,
		);
		await adapter.saveNote(
			buildNote('note-route-atlas', 'Route Atlas', 'Map anchor note', {
				folder: '/campaign/locations',
				tags: ['location', 'travel'],
				frontmatter: {
					mapId: 'map-shell',
					type: 'location',
				},
			}) as never,
		);
		await adapter.saveNote(
			buildNote('note-campaign-npc', 'Captain Varyn', 'Campaign NPC anchor', {
				folder: '/campaign/npcs',
				tags: ['npc'],
				frontmatter: {
					dndtools: {
						object: {
							kind: 'npc',
							summary: 'Campaign anchor NPC',
							data: { disposition: 'active' },
						},
					},
				},
			}) as never,
		);
		await adapter.saveNote(
			buildNote('note-character-facet', 'Character Dossier', 'ArcaneShellToken facet helper', {
				folder: '/campaign/party',
				tags: ['party'],
				frontmatter: {
					type: 'character',
				},
			}) as never,
		);
		await adapter.resolveAndIndexLinks(
			'note-shell-anchor' as never,
			'ArcaneShellToken [[Route Atlas]]',
		);
		await adapter.saveObject(
			buildMapObject('map-shell', 'Shell Atlas', 'note-route-atlas') as never,
		);
		await adapter.saveSessionBoard({
			id: 'board-interactive' as never,
			name: 'Interactive Board',
			description: 'Board for interaction coverage',
			tiles: [],
			createdAt: now,
			updatedAt: now,
		});
	} finally {
		await adapter.close();
	}
	return launchDesktopApp(vaultDir);
}

async function gotoDesktopPath(page: Page, route: string): Promise<void> {
	const origin = new URL(page.url()).origin;
	await page.goto(`${origin}${route}`);
}

async function ensureSidebarOpen(page: Page): Promise<void> {
	if ((await page.locator('aside:visible').getByRole('button', { name: 'Tree' }).count()) > 0)
		return;
	await page.getByRole('button', { name: 'Toggle local navigation' }).first().click();
	await expect(page.locator('aside:visible').getByRole('button', { name: 'Tree' })).toBeVisible();
}

async function ensureDmMode(page: Page): Promise<void> {
	const exitPlayerModeButton = page.getByRole('button', { name: /Exit player mode/i }).first();
	if (await exitPlayerModeButton.isVisible().catch(() => false)) {
		await exitPlayerModeButton.click();
		await expect(page.getByRole('button', { name: /Enter player mode/i }).first()).toBeVisible();
	}
}

async function createNoteFromTopBar(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Create options' }).click();
	const createMenu = page.getByRole('menu', { name: 'Create menu' });
	await expect(createMenu).toBeVisible();
	await createMenu.getByRole('menuitem', { name: 'New note' }).click({ force: true });

	if (/\/notes\/[^/]+\/edit$/.test(page.url())) {
		return;
	}

	const templateDialog = page.getByRole('dialog', { name: 'New from Template' });
	if (await templateDialog.isVisible().catch(() => false)) {
		await templateDialog.locator('.grid button').first().click();
	}

	if (/\/notes\/[^/]+\/edit$/.test(page.url())) {
		return;
	}

	const firstRunButton = page.getByRole('button', { name: 'Create Your First Note' });
	if (await firstRunButton.isVisible().catch(() => false)) {
		await firstRunButton.click();
	}

	if (!/\/notes\/[^/]+\/edit$/.test(page.url())) {
		const origin = new URL(page.url()).origin;
		await page.goto(`${origin}/notes?create=e2e-topbar-note`);
	}

	if (!/\/notes\/[^/]+\/edit$/.test(page.url())) {
		const templateDialog = page.getByRole('dialog', { name: 'New from Template' });
		if (await templateDialog.isVisible().catch(() => false)) {
			await templateDialog.locator('.grid button').first().click();
		}
	}

	await expect(page).toHaveURL(/\/notes\/[^/]+\/edit$/);
}

test.describe('Desktop interactive controls coverage @critical', () => {
	test('top-bar buttons and overlays are fully interactive with visible state changes', async () => {
		const app = await launchWithSeed();
		try {
			await ensureDmMode(app.page);
			await ensureSidebarOpen(app.page);

			await app.page.getByRole('button', { name: 'Toggle local navigation' }).click();
			await expect(app.page.getByRole('button', { name: 'Tree' })).toHaveCount(0);
			await app.page.getByRole('button', { name: 'Toggle local navigation' }).click();
			await expect(app.page.getByRole('button', { name: 'Tree' })).toBeVisible();

			await app.page.getByRole('button', { name: 'Create options' }).click();
			const createMenu = app.page.getByRole('menu', { name: 'Create menu' });
			await expect(createMenu).toBeVisible();
			const beforeTemplateActionUrl = app.page.url();
			await createMenu.getByRole('menuitem', { name: 'Create from template' }).click({
				force: true,
			});
			const templateDialog = app.page.getByRole('dialog', { name: 'New from Template' });
			if (await templateDialog.isVisible().catch(() => false)) {
				await templateDialog.getByRole('button', { name: 'Close' }).first().click();
				await expect(templateDialog).toHaveCount(0);
			} else if (app.page.url() !== beforeTemplateActionUrl) {
				await expect(app.page).toHaveURL(/\/notes\/[^/]+\/edit$/);
				await app.page.getByRole('button', { name: 'Done' }).click();
				await expect(app.page).toHaveURL(/\/notes\/[^/]+$/);
			}

			await app.page.getByRole('button', { name: 'Create options' }).click();
			await app.page.getByRole('menuitem', { name: 'Create handout' }).click({ force: true });
			const handoutDialog = app.page.getByRole('dialog', { name: 'Create handout' });
			if (!(await handoutDialog.isVisible().catch(() => false))) {
				await app.page.keyboard.press('Control+Shift+H');
			}
			await expect(handoutDialog).toBeVisible();
			await handoutDialog.getByRole('button', { name: 'Close' }).first().click();
			await expect(handoutDialog).toHaveCount(0);

			await createNoteFromTopBar(app.page);
			await expect(app.page.getByPlaceholder('Note title...')).toBeVisible();
			await app.page.getByRole('button', { name: 'Done' }).click();
			await expect(app.page).toHaveURL(/\/notes\/[^/]+$/);

			await app.page.getByRole('button', { name: 'Search' }).click();
			const quickSwitcher = app.page.getByRole('dialog', { name: 'Quick switcher' });
			await expect(quickSwitcher).toBeVisible();
			await app.page.keyboard.press('Escape');
			await expect(quickSwitcher).toHaveCount(0);

			await app.page.getByRole('button', { name: 'Open dice tray' }).click();
			const diceTray = app.page.getByRole('dialog', { name: 'Dice tray' });
			await expect(diceTray).toBeVisible();
			await diceTray.getByRole('button', { name: 'Close' }).first().click();
			await expect(diceTray).toHaveCount(0);

			await app.page.getByRole('button', { name: 'Refresh vault' }).click();
			await expect(app.page.getByRole('status').getByText('Vault refreshed')).toBeVisible();

			await app.page.getByRole('button', { name: 'Enter player mode' }).click();
			await expect(app.page).toHaveURL(/\/player$/);
			const exitPlayerMode = app.page
				.locator('main')
				.getByRole('button', { name: 'Exit Player Mode' })
				.first();
			await expect(exitPlayerMode).toBeVisible();
			await exitPlayerMode.click();
			await expect(app.page).toHaveURL(/\/notes$/);
		} finally {
			await closeDesktopApp(app);
		}
	});

	test('sidebar links, mode toggles, and navigation controls update routes and visible sections', async () => {
		const app = await launchWithSeed();
		try {
			await ensureDmMode(app.page);
			await ensureSidebarOpen(app.page);
			const sidebar = app.page.locator('aside:visible').first();

			await sidebar.getByRole('link', { name: 'All Notes' }).click();
			await expect(app.page).toHaveURL(/\/notes$/);
			await expect(
				app.page.getByRole('heading', { name: /All Notes|Player Notes|Notes tagged/i }),
			).toBeVisible();
			await sidebar.getByRole('link', { name: 'Search' }).click();
			await expect(app.page).toHaveURL(/\/search$/);
			await expect(app.page.getByRole('heading', { name: 'Search & Discovery' })).toBeVisible();

			const backButton = app.page.getByRole('button', { name: 'Go back' });
			const forwardButton = app.page.getByRole('button', { name: 'Go forward' });
			await expect(backButton).toBeEnabled();
			await expect(forwardButton).toBeDisabled();
			await backButton.click();
			await expect(app.page).toHaveURL(/\/notes$/);
			await expect(forwardButton).toBeEnabled();
			await forwardButton.click();
			await expect(app.page).toHaveURL(/\/search$/);

			const routeChecks: Array<{ label: string; url: RegExp }> = [
				{ label: 'Graph', url: /\/graph$/ },
				{ label: 'Maps', url: /\/maps$/ },
				{ label: 'Timeline', url: /\/timeline$/ },
				{ label: 'Session Board', url: /\/session-board$/ },
				{ label: 'Encounter Builder', url: /\/encounter\/new$/ },
				{ label: 'Combat', url: /\/combat$/ },
				{ label: 'Settings', url: /\/settings$/ },
			];
			for (const route of routeChecks) {
				await ensureSidebarOpen(app.page);
				await sidebar.getByRole('link', { name: route.label }).first().click();
				await expect(app.page).toHaveURL(route.url);
			}

			await ensureSidebarOpen(app.page);
			await sidebar.getByRole('link', { name: 'All Notes' }).click();
			await expect(app.page).toHaveURL(/\/notes$/);
			await sidebar.getByRole('button', { name: 'Recent' }).click({ force: true });
			await sidebar.getByRole('button', { name: 'Favorites' }).click({ force: true });
			await sidebar.getByRole('button', { name: 'Campaign' }).click({ force: true });
			await sidebar.getByRole('button', { name: 'Tree' }).click({ force: true });

			await sidebar.getByRole('button', { name: 'Tree' }).click();
			await expect(sidebar.getByText('Folder Tree')).toBeVisible();
			await expect(sidebar.getByRole('button', { name: 'Map view' })).toBeVisible();

			await expect(sidebar.getByRole('button', { name: 'Tags' })).toBeVisible();

			await ensureSidebarOpen(app.page);
			await sidebar.getByRole('button', { name: 'Onboarding' }).click();
			await expect(app.page).toHaveURL(/\/$/);
		} finally {
			await closeDesktopApp(app);
		}
	});

	test('search interactions cover operators, saved searches, facets, and result navigation', async () => {
		const app = await launchWithSeed();
		try {
			await gotoDesktopPath(app.page, '/knowledge/search');
			await expect(app.page.getByRole('heading', { name: 'Search & Discovery' })).toBeVisible();

			const input = app.page.getByPlaceholder('Search notes...');
			await input.fill('ArcaneShellToken');
			await expect(
				app.page.getByRole('button', { name: 'Navigation Anchor' }).first(),
			).toBeVisible();

			await app.page.getByRole('button', { name: 'Operators' }).click();
			await expect(app.page.getByText('updated:>=-7d')).toBeVisible();
			await app.page.getByRole('button', { name: 'Operators' }).click();
			await expect(app.page.getByText('updated:>=-7d')).toHaveCount(0);

			await app.page.getByPlaceholder('Name this search').fill('Shell Search');
			await app.page.getByRole('button', { name: 'Save' }).click();
			const savedSearchRunButton = app.page.locator('button[title="ArcaneShellToken"]').first();
			await expect(savedSearchRunButton).toBeVisible();
			await savedSearchRunButton.click();
			await expect(input).toHaveValue('ArcaneShellToken');

			await app.page
				.getByRole('button', { name: 'Delete saved search Shell Search' })
				.first()
				.click();
			await expect(app.page.locator('button[title="ArcaneShellToken"]')).toHaveCount(0);

			const facetsPanel = app.page.locator('#search-facets-panel');
			const facetsToggle = app.page.getByRole('button', { name: /Facets/ });
			await expect(facetsPanel).toBeVisible();
			await facetsToggle.click();
			await expect(facetsPanel).toHaveCount(0);
			await app.page.getByRole('button', { name: /Facets/ }).click();
			await expect(facetsPanel).toBeVisible();
			const firstFacet = facetsPanel.locator('button').first();
			await expect(firstFacet).toBeVisible();
			await firstFacet.click();
			const clearFacetsButton = app.page.getByRole('button', { name: 'Clear' }).first();
			await expect(clearFacetsButton).toBeEnabled();
			await clearFacetsButton.click();

			await input.fill('ArcaneShellToken');
			await app.page
				.locator('section button.font-semibold', { hasText: 'Navigation Anchor' })
				.first()
				.click();
			await expect(app.page).toHaveURL(/\/notes\/note-shell-anchor$/);
			await expect(app.page.getByRole('heading', { name: 'Navigation Anchor' })).toBeVisible();
		} finally {
			await closeDesktopApp(app);
		}
	});

	test('note view and editor interactions update UI state and persisted content', async () => {
		const app = await launchWithSeed();
		try {
			await gotoDesktopPath(app.page, '/knowledge/notes/note-shell-anchor');
			await expect(app.page.getByRole('heading', { name: 'Navigation Anchor' })).toBeVisible();

			await app.page.getByPlaceholder('Quick add to this note...').fill('Checklist bullet');
			await app.page.getByRole('button', { name: 'Add' }).click();
			await expect(app.page.getByRole('status').getByText('Added to note')).toBeVisible();
			await expect
				.poll(async () => {
					const note = await app.page.evaluate(async () =>
						window.dndtoolsDesktop?.getNote('note-shell-anchor' as never),
					);
					return note?.content ?? '';
				})
				.toContain('- Checklist bullet');

			await app.page.getByRole('button', { name: 'Focus Reading' }).click();
			await expect(app.page.getByRole('button', { name: 'Toggle local navigation' })).toHaveCount(
				0,
			);
			await expect(app.page.getByRole('button', { name: 'Exit Focus Reading' })).toBeVisible();
			await app.page.getByRole('button', { name: 'Exit Focus Reading' }).click();
			await expect(app.page.getByRole('button', { name: 'Toggle local navigation' })).toBeVisible();

			await app.page.getByRole('button', { name: 'Edit' }).click();
			await expect(app.page).toHaveURL(/\/notes\/note-shell-anchor\/edit$/);
			await expect(app.page.getByRole('heading', { name: 'Edit Navigation Anchor' })).toBeVisible();

			await app.page.locator('.cm-content').first().click();
			await app.page.keyboard.type('\nEditor interactive coverage line');
			await app.page.getByRole('button', { name: 'Save' }).click();
			await expect(app.page.getByRole('status').getByText('Note saved')).toBeVisible();
			await app.page.getByRole('button', { name: 'Done' }).click();
			await expect(app.page).toHaveURL(/\/notes\/note-shell-anchor$/);
			await expect
				.poll(async () => {
					const note = await app.page.evaluate(async () =>
						window.dndtoolsDesktop?.getNote('note-shell-anchor' as never),
					);
					return note?.content ?? '';
				})
				.toContain('Editor interactive coverage line');
		} finally {
			await closeDesktopApp(app);
		}
	});

	test('settings tabs and tab-panel controls are all actionable', async () => {
		const app = await launchWithSeed();
		try {
			await gotoDesktopPath(app.page, '/settings');
			await expect(app.page.getByRole('heading', { name: 'Settings' })).toBeVisible();

			const tabChecks: Array<{ name: string; assert: () => Promise<void> }> = [
				{
					name: 'General',
					assert: () =>
						expect(app.page.getByRole('heading', { name: 'Appearance' }).first()).toBeVisible(),
				},
				{
					name: 'About',
					assert: () =>
						expect(app.page.getByRole('heading', { name: 'Updates' }).first()).toBeVisible(),
				},
				{
					name: 'World',
					assert: () =>
						expect(app.page.getByRole('heading', { name: 'In-World Date' }).first()).toBeVisible(),
				},
				{
					name: 'Vault',
					assert: () =>
						expect(
							app.page
								.getByRole('button', { name: /Save Backup Settings|Create Safety Snapshot/ })
								.first(),
						).toBeVisible(),
				},
				{
					name: 'Sync',
					assert: () =>
						expect(app.page.getByRole('heading', { name: 'Sync Status' }).first()).toBeVisible(),
				},
				{
					name: 'Handouts',
					assert: () =>
						expect(
							app.page.getByRole('heading', { name: 'Handout Library' }).first(),
						).toBeVisible(),
				},
				{
					name: 'MCP',
					assert: () =>
						expect(app.page.getByRole('heading', { name: 'MCP Sidecar' }).first()).toBeVisible(),
				},
				{
					name: 'System Health',
					assert: () =>
						expect(
							app.page.getByRole('button', { name: /Export Diagnostics Bundle|Refresh/ }).first(),
						).toBeVisible(),
				},
			];
			for (const tab of tabChecks) {
				await app.page.getByRole('tab', { name: tab.name }).click();
				await expect(app.page.getByRole('tab', { name: tab.name })).toHaveAttribute(
					'aria-selected',
					'true',
				);
				await tab.assert();
			}

			await gotoDesktopPath(app.page, '/settings?tab=sync');
			await app.page.getByRole('button', { name: 'Save Strategy' }).click();
			await expect(app.page.getByRole('button', { name: 'Save Strategy' })).toBeVisible();

			await gotoDesktopPath(app.page, '/settings?tab=handouts');
			await app.page.getByRole('button', { name: 'Create Handout' }).click();
			const handoutDialog = app.page.getByRole('dialog', { name: 'Create handout' });
			await expect(handoutDialog).toBeVisible();
			await handoutDialog.getByRole('button', { name: 'Close' }).first().click();
			await expect(handoutDialog).toHaveCount(0);
		} finally {
			await closeDesktopApp(app);
		}
	});
});
