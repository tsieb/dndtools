import { test, expect, type Page } from '@playwright/test';
import { FileSystemAdapter } from '../../mcp/storage.js';
import { createTempVaultDir, launchDesktopApp, closeDesktopApp } from './helpers/desktop-app.js';

function buildNote(id: string, title: string, content: string): Record<string, unknown> {
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
	};
}

async function launchWithSeed(
	seed?: (adapter: FileSystemAdapter) => Promise<void>,
): Promise<Awaited<ReturnType<typeof launchDesktopApp>>> {
	const vaultDir = await createTempVaultDir('dndtools-e2e-vault-');
	if (seed) {
		const adapter = new FileSystemAdapter(vaultDir);
		await adapter.initialize();
		try {
			await seed(adapter);
		} finally {
			await adapter.close();
		}
	}
	return launchDesktopApp(vaultDir);
}

async function startNewNote(page: Page): Promise<void> {
	await page.getByRole('link', { name: 'All Notes' }).first().click();
	const newNoteButtons = page.getByRole('button', { name: 'New Note' });
	const targetIndex = (await newNoteButtons.count()) > 1 ? 1 : 0;
	await newNoteButtons.nth(targetIndex).click();
	if (!/\/notes\/[^/]+\/edit$/.test(page.url())) {
		const templateDialog = page.getByRole('dialog', { name: 'New from Template' });
		if ((await templateDialog.count()) > 0) {
			await templateDialog.getByRole('button').first().click();
		}
	}
	if (!/\/notes\/[^/]+\/edit$/.test(page.url())) {
		const firstRunButton = page.getByRole('button', { name: 'Create Your First Note' });
		if ((await firstRunButton.count()) > 0) {
			await firstRunButton.first().click();
		}
	}
	if (!/\/notes\/[^/]+\/edit$/.test(page.url())) {
		const origin = new URL(page.url()).origin;
		await page.goto(`${origin}/notes?create=e2e-note`);
	}
	await expect(page).toHaveURL(/\/notes\/[^/]+\/edit$/);
}

test.describe('Desktop critical workflows @critical', () => {
	test('vault opens and first-run onboarding is actionable', async () => {
		const app = await launchWithSeed();
		try {
			await expect(app.page.getByRole('heading', { name: 'First-run Checklist' })).toBeVisible();
			const searchStep = app.page.locator('li').filter({ hasText: 'Try global search' });
			await searchStep.getByRole('button', { name: 'Open' }).click();
			await expect(app.page).toHaveURL(/\/search$/);
			await expect(app.page.getByRole('heading', { name: 'Search & Discovery' })).toBeVisible();
		} finally {
			await closeDesktopApp(app);
		}
	});

	test('note CRUD workflow: create, update, and delete', async () => {
		const app = await launchWithSeed();
		try {
			await startNewNote(app.page);

			await app.page.locator('.cm-content').first().click();
			await app.page.keyboard.type('Critical CRUD body');
			await app.page.getByRole('button', { name: 'Done' }).click();
			await expect(app.page).toHaveURL(/\/notes\/[^/]+$/);
			const createdId = decodeURIComponent(app.page.url().split('/notes/')[1] ?? '');

			await app.page.getByRole('button', { name: 'Edit' }).click();
			await expect(app.page).toHaveURL(/\/notes\/[^/]+\/edit$/);
			await app.page.locator('.cm-content').first().click();
			await app.page.keyboard.type('\nAdded via CRUD flow');
			await app.page.getByRole('button', { name: 'Save' }).click();
			await expect(app.page.getByText('Note saved')).toBeVisible();
			await app.page.getByRole('button', { name: 'Done' }).click();
			const updatedContent = await app.page.evaluate(async (id) => {
				const note = await window.dndtoolsDesktop?.getNote(id as never);
				return note?.content ?? '';
			}, createdId);
			expect(updatedContent).toContain('Added via CRUD flow');

			await app.page.getByTitle('Delete note').click();
			await expect(app.page.getByText('Are you sure you want to delete')).toBeVisible();
			await app.page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
			await expect(app.page).toHaveURL(/\/notes$/);
			const deletedState = await app.page.evaluate(async (id) => {
				const note = await window.dndtoolsDesktop?.getNote(id as never);
				return note?.deleted ?? false;
			}, createdId);
			expect(deletedState).toBe(true);
		} finally {
			await closeDesktopApp(app);
		}
	});

	test('wikilink navigation and search workflows resolve seeded knowledge', async () => {
		const app = await launchWithSeed(async (adapter) => {
			const beta = buildNote('note-beta', 'Beta Node', 'Contains ArcaneSigilToken.');
			const alpha = buildNote('note-alpha', 'Alpha Hub', 'Reference [[Beta Node]].');
			await adapter.saveNote(beta as never);
			await adapter.saveNote(alpha as never);
			await adapter.resolveAndIndexLinks('note-alpha' as never, 'Reference [[Beta Node]].');
		});
		try {
			await app.page.getByRole('link', { name: 'All Notes' }).first().click();
			await app.page.getByText('Alpha Hub').first().click();
			await expect(app.page).toHaveURL(/\/notes\/note-alpha$/);
			await app.page.getByRole('link', { name: 'Beta Node' }).click();
			await expect(app.page).toHaveURL(/\/notes\/note-beta$/);
			await expect(app.page.getByRole('heading', { name: 'Beta Node' })).toBeVisible();

			await app.page.getByRole('link', { name: 'Search' }).first().click();
			await app.page.getByPlaceholder('Search notes...').fill('ArcaneSigilToken');
			await expect(app.page.getByRole('button', { name: 'Beta Node' })).toBeVisible();
		} finally {
			await closeDesktopApp(app);
		}
	});

	test('MCP pending review approves staged changes from settings', async () => {
		const app = await launchWithSeed(async (adapter) => {
			const before = buildNote(
				'note-mcp-review',
				'MCP Review Target',
				'Before pending update.',
			) as never;
			await adapter.saveNote(before);
			const persistedBefore = await adapter.getNote('note-mcp-review' as never);
			if (!persistedBefore) {
				throw new Error('Failed to seed MCP review note');
			}
			const after = {
				...persistedBefore,
				content: 'After pending update.',
				updatedAt: new Date(Date.now() + 5_000).toISOString(),
			};
			await adapter.recordMcpChange({
				type: 'update',
				noteId: 'note-mcp-review',
				title: 'MCP Review Target',
				summary: 'Update staged by MCP agent',
				agentId: 'agent-review',
				before: { note: persistedBefore },
				after: { note: after as never },
			});
		});
		try {
			await app.page.getByLabel('Pending MCP changes').click();
			await expect(app.page.getByRole('heading', { name: 'MCP Pending Changes' })).toBeVisible();
			const pendingRow = app.page.locator('li').filter({ hasText: 'Update staged by MCP agent' });
			await expect(pendingRow).toBeVisible();
			await pendingRow.getByRole('button', { name: 'Reject' }).click();
			await expect
				.poll(
					async () => {
						const pending = await app.page.evaluate(async () =>
							window.dndtoolsDesktop?.listMcpPendingChanges(),
						);
						return pending?.length ?? -1;
					},
					{ timeout: 20_000, intervals: [250, 500, 1_000] },
				)
				.toBe(0);

			const updatedContent = await app.page.evaluate(async () => {
				const note = await window.dndtoolsDesktop?.getNote('note-mcp-review' as never);
				return note?.content ?? '';
			});
			expect(updatedContent).toBe('Before pending update.');
			await expect(app.page.getByText('rejected - Update staged by MCP agent')).toBeVisible();
		} finally {
			await closeDesktopApp(app);
		}
	});

	test('session board management updates an active board and attaches notes', async () => {
		const app = await launchWithSeed(async (adapter) => {
			await adapter.saveNote(
				buildNote('note-board-anchor', 'Board Anchor', 'Session board seed note.') as never,
			);
			const now = new Date().toISOString();
			await adapter.saveSessionBoard({
				id: 'board-critical' as never,
				name: 'Critical Session Board',
				description: 'Coverage board',
				tiles: [],
				createdAt: now,
				updatedAt: now,
			});
		});
		try {
			await app.page.getByRole('link', { name: 'Session Board' }).first().click();
			await app.page.getByRole('button', { name: 'Edit' }).first().click();

			const addNotesSection = app.page
				.locator('section')
				.filter({ hasText: 'Add Tiles and Notes' });
			await addNotesSection
				.getByRole('button', { name: /Board Anchor/ })
				.first()
				.click();
			await expect
				.poll(async () => {
					const board = await app.page.evaluate(async () => {
						const boards = (await window.dndtoolsDesktop?.getSessionBoards()) ?? [];
						return boards.find((entry) => entry.id === 'board-critical') ?? null;
					});
					return board?.tiles.some((tile) => tile.noteId === 'note-board-anchor') ?? false;
				})
				.toBe(true);
			await expect(
				app.page.getByRole('button', { name: 'Session board tile: Board Anchor' }),
			).toBeVisible();
		} finally {
			await closeDesktopApp(app);
		}
	});

	test('session board templates and timer tiles work together', async () => {
		const app = await launchWithSeed(async (adapter) => {
			await adapter.saveNote(
				buildNote('note-template-anchor', 'Template Anchor', 'Template seed content.') as never,
			);
		});
		try {
			await app.page.getByRole('link', { name: 'Session Board' }).first().click();
			await app.page.getByRole('button', { name: 'Edit' }).first().click();

			const createBoardSection = app.page.locator('section').filter({ hasText: 'Create Board' });
			await createBoardSection.getByPlaceholder('Board name').fill('Template Driven Board');
			await createBoardSection.getByLabel('Template').selectOption({ label: 'Combat Scene' });
			await createBoardSection.getByRole('button', { name: 'Create Session Board' }).click();

			const addNotesSection = app.page
				.locator('section')
				.filter({ hasText: 'Add Tiles and Notes' });
			await addNotesSection
				.getByRole('button', { name: /Template Anchor/ })
				.first()
				.click();
			await expect
				.poll(async () => {
					const board = await app.page.evaluate(async () => {
						const boards = (await window.dndtoolsDesktop?.getSessionBoards()) ?? [];
						return boards.find((entry) => entry.name === 'Template Driven Board') ?? null;
					});
					return board?.tiles.some((tile) => tile.noteId === 'note-template-anchor') ?? false;
				})
				.toBe(true);
			await expect(app.page.getByText('Session Timer').first()).toBeVisible();

			const boardState = await app.page.evaluate(async () => {
				const boards = (await window.dndtoolsDesktop?.getSessionBoards()) ?? [];
				return boards.find((board) => board.name === 'Template Driven Board') ?? null;
			});
			expect(boardState).not.toBeNull();
			expect(boardState?.tiles.some((tile) => tile.type === 'timer')).toBe(true);
		} finally {
			await closeDesktopApp(app);
		}
	});

	test('encounter builder route renders and supports encounter tile creation', async () => {
		const app = await launchWithSeed(async (adapter) => {
			const now = new Date().toISOString();
			await adapter.saveSessionBoard({
				id: 'board-encounter' as never,
				name: 'Encounter Coverage Board',
				description: 'Board seeded for encounter route coverage',
				tiles: [],
				createdAt: now,
				updatedAt: now,
			});
		});
		try {
			if ((await app.page.getByRole('link', { name: 'Encounter Builder' }).count()) === 0) {
				await app.page.getByRole('button', { name: 'Toggle sidebar' }).first().click();
			}
			await app.page.getByRole('link', { name: 'Encounter Builder' }).first().click();
			await expect(app.page).toHaveURL(/\/encounter\/new$/);
			await expect(app.page.getByRole('heading', { name: 'Encounter Builder' })).toBeVisible();

			await app.page.getByRole('button', { name: 'Add Encounter Tile' }).first().click();
			await expect(app.page.getByText('Difficulty Budget')).toBeVisible();
		} finally {
			await closeDesktopApp(app);
		}
	});

	test('object creation workflow embeds object content and persists object metadata', async () => {
		const app = await launchWithSeed();
		try {
			await startNewNote(app.page);
			const match = app.page.url().match(/\/notes\/([^/]+)\/edit$/);
			expect(match).toBeTruthy();
			const noteId = decodeURIComponent(match![1]!);

			await app.page.getByPlaceholder('Note title...').fill('Object Workflow Note');
			await app.page.locator('.cm-content').first().click();
			await app.page.keyboard.type('Encounter prep:\n');
			await app.page.getByRole('button', { name: 'Embeds' }).click();
			await app.page.getByPlaceholder('Object name').fill('Captain Aria');
			await app.page.getByRole('button', { name: 'Create + Embed' }).click();
			await app.page.getByRole('button', { name: 'Done' }).click();
			await expect(app.page).toHaveURL(new RegExp(`/notes/${noteId}$`));

			await expect
				.poll(
					async () => {
						const objects =
							(await app.page.evaluate(async () => window.dndtoolsDesktop?.getAllObjects())) ?? [];
						return objects.some((entry) => entry.name === 'Captain Aria');
					},
					{ timeout: 20_000, intervals: [250, 500, 1_000] },
				)
				.toBe(true);

			const createdObjectId = await app.page.evaluate(async () => {
				const objects = (await window.dndtoolsDesktop?.getAllObjects()) ?? [];
				return objects.find((entry) => entry.name === 'Captain Aria')?.id ?? '';
			});

			await expect
				.poll(
					async () => {
						const note = await app.page.evaluate(
							async (id) => window.dndtoolsDesktop?.getNote(id as never),
							noteId,
						);
						return note?.content ?? '';
					},
					{ timeout: 20_000, intervals: [250, 500, 1_000] },
				)
				.toMatch(new RegExp(`Captain Aria|${createdObjectId}`));
		} finally {
			await closeDesktopApp(app);
		}
	});

	test('timeline route shows world events and linked session logs with filters', async () => {
		const app = await launchWithSeed(async (adapter) => {
			await adapter.saveNote({
				...buildNote('npc-scout', 'Scout Captain', 'NPC profile'),
				frontmatter: {
					dndtools: {
						object: {
							kind: 'npc',
							data: {
								disposition: 'active',
							},
						},
					},
				},
			} as never);
			await adapter.saveNote({
				...buildNote('timeline-siege', 'Siege of Blackspire', 'Major timeline event'),
				tags: ['timeline', 'arc:warfront', 'pending-resolution'],
				frontmatter: {
					dndtools: {
						object: {
							kind: 'timeline_event',
							summary: 'The siege begins.',
							data: {
								worldDateOffset: 15,
								summary: 'The siege begins.',
								involvedObjectIds: ['npc-scout'],
								arcTag: 'warfront',
								resolutionStatus: 'pending_resolution',
							},
						},
					},
				},
			} as never);
			await adapter.saveNote({
				...buildNote('session-10', 'Session 10', 'Players scouted the siege perimeter.'),
				tags: ['session'],
				frontmatter: {
					worldDate: 15,
					timelineEventId: 'timeline-siege',
				},
			} as never);
		});

		try {
			if ((await app.page.getByRole('link', { name: 'Timeline' }).count()) === 0) {
				await app.page.getByRole('button', { name: 'Toggle sidebar' }).first().click();
			}
			await app.page.getByRole('link', { name: 'Timeline' }).first().click();
			await expect(app.page).toHaveURL(/\/timeline$/);
			await expect(app.page.getByRole('heading', { name: 'Campaign Timeline' })).toBeVisible();
			await expect(app.page.getByRole('link', { name: 'Siege of Blackspire' })).toBeVisible();
			await expect(app.page.getByRole('link', { name: 'Session 10' })).toBeVisible();
			await expect(app.page.getByText('Pending', { exact: true })).toBeVisible();

			await app.page.locator('label:has-text("Arc") select').selectOption({ label: 'warfront' });
			await app.page
				.locator('label:has-text("Participant") select')
				.selectOption({ label: 'Scout Captain' });
			await expect(app.page.getByText('No timeline entries match the active filters.')).toHaveCount(
				0,
			);
			await expect(app.page.getByRole('link', { name: 'Siege of Blackspire' })).toBeVisible();
		} finally {
			await closeDesktopApp(app);
		}
	});
});
