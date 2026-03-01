import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFolderId, createNoteId, type Note } from '$lib/types/note.js';
import { semanticSearchService } from './semantic-search.js';

const getDesktopMcpStatus = vi.fn();
const getDesktopEmbeddingStatus = vi.fn();
const embedDesktopTexts = vi.fn();

vi.mock('$lib/platform/desktop/bridge.js', () => ({
	getDesktopMcpStatus: (...args: unknown[]) => getDesktopMcpStatus(...args),
	getDesktopEmbeddingStatus: (...args: unknown[]) => getDesktopEmbeddingStatus(...args),
	embedDesktopTexts: (...args: unknown[]) => embedDesktopTexts(...args),
}));

function note(overrides: Partial<Note>): Note {
	return {
		id: createNoteId('note-1'),
		title: 'Default',
		content: 'Default content',
		folder: createFolderId('/'),
		tags: [],
		frontmatter: {},
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		deleted: false,
		deletedAt: null,
		pinned: false,
		pinnedAt: null,
		...overrides,
	};
}

describe('semanticSearchService', () => {
	beforeEach(() => {
		getDesktopMcpStatus.mockReset();
		getDesktopEmbeddingStatus.mockReset();
		embedDesktopTexts.mockReset();
		semanticSearchService.resetCaches();
		window.dndtoolsDesktop = {} as Window['dndtoolsDesktop'];
	});

	it('returns unavailable when sidecar is not running', async () => {
		getDesktopMcpStatus.mockResolvedValue({ state: 'stopped' });

		const status = await semanticSearchService.getAvailability(true);
		expect(status.enabled).toBe(false);
		expect(status.reason).toContain('sidecar');
	});

	it('returns unavailable when no embedding model is available', async () => {
		getDesktopMcpStatus.mockResolvedValue({ state: 'running' });
		getDesktopEmbeddingStatus.mockResolvedValue({
			available: false,
			model: null,
			reason: 'No embedding model found',
			models: [],
		});

		const status = await semanticSearchService.getAvailability(true);
		expect(status.enabled).toBe(false);
		expect(status.reason).toContain('embedding');
	});

	it('returns top semantic matches and excludes keyword result ids', async () => {
		getDesktopMcpStatus.mockResolvedValue({ state: 'running' });
		getDesktopEmbeddingStatus.mockResolvedValue({
			available: true,
			model: 'nomic-embed-text',
			reason: null,
			models: ['nomic-embed-text'],
		});
		embedDesktopTexts.mockImplementation(async (_model: string, texts: string[]) => {
			return texts.map((text) => {
				if (text.toLowerCase().includes('goblin ambush')) return [0.99, 0.01];
				if (text.toLowerCase().includes('goblin')) return [0.95, 0.05];
				return [0.05, 0.95];
			});
		});

		const results = await semanticSearchService.search({
			query: 'goblin ambush',
			notes: [
				note({
					id: createNoteId('keyword-id'),
					title: 'Goblin Ambush',
					content: 'Goblin ambush near the bridge',
				}),
				note({
					id: createNoteId('semantic-id'),
					title: 'Goblin Scouts',
					content: 'Scouting goblin patrol routes around town',
				}),
				note({
					id: createNoteId('other-id'),
					title: 'Waterdeep Politics',
					content: 'City politics and guild tensions',
				}),
			],
			excludeIds: new Set(['keyword-id']),
			limit: 5,
		});

		expect(results.map((entry) => String(entry.id))).toContain('semantic-id');
		expect(results.map((entry) => String(entry.id))).not.toContain('keyword-id');
	});
});
