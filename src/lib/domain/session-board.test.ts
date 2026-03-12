// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
	BUILT_IN_SESSION_BOARD_TEMPLATES,
	DEFAULT_SESSION_CONTEXT,
	TILE_TYPE_METADATA,
	createDefaultSessionBoardScene,
	createDefaultTimerState,
	moveSessionBoardTileByRow,
	normalizeBoardTemplatesSetting,
	normalizeSessionBoardHandoutHistory,
	normalizeSessionBoardScenes,
	normalizeSessionContextState,
	normalizeSessionBoardTile,
	repackSessionBoardTiles,
} from './session-board.js';

describe('session-board domain', () => {
	it('provides built-in templates for common session layouts', () => {
		expect(BUILT_IN_SESSION_BOARD_TEMPLATES.length).toBeGreaterThanOrEqual(4);
		expect(BUILT_IN_SESSION_BOARD_TEMPLATES.map((template) => template.name)).toEqual(
			expect.arrayContaining(['Combat Scene', 'NPC Encounter', 'Exploration', 'Town Visit']),
		);
	});

	it('defines semantic metadata for all session board tile visuals', () => {
		expect(TILE_TYPE_METADATA.note.iconName).toBe('scroll');
		expect(TILE_TYPE_METADATA.combat.colorToken).toBe('--color-tile-combat');
		expect(TILE_TYPE_METADATA.map.iconName).toBe('map');
	});

	it('merges custom templates with built-ins when normalizing settings', () => {
		const now = '2026-03-02T00:00:00.000Z';
		const templates = normalizeBoardTemplatesSetting([
			{
				id: 'custom-test',
				name: 'Custom Test',
				description: 'A custom board layout.',
				tiles: [{ id: 'slot', type: 'note', x: 0, y: 0, w: 4, h: 3 }],
				layout: { columns: 12, rowHeight: 120, minRows: 12, gap: 12 },
				style: { backgroundPattern: 'none' },
				builtIn: false,
				createdAt: now,
				updatedAt: now,
			},
		]);
		expect(templates.some((template) => template.id === 'custom-test')).toBe(true);
		expect(templates.some((template) => template.name === 'Combat Scene')).toBe(true);
	});

	it('normalizes note preview values and timer state for tiles', () => {
		const normalizedNote = normalizeSessionBoardTile({
			id: 'note-tile',
			type: 'note',
			x: 0,
			y: 0,
			w: 4,
			h: 3,
			previewDepth: 'summary',
			previewLineCount: 400,
		});
		expect(normalizedNote.type).toBe('note');
		if ((normalizedNote.type ?? 'note') === 'note') {
			expect(normalizedNote.previewLineCount).toBe(40);
		}
		const titleDepthNote = normalizeSessionBoardTile({
			id: 'note-title-depth',
			type: 'note',
			x: 0,
			y: 0,
			w: 4,
			h: 0,
			previewDepth: 'title',
		});
		const summaryDepthNote = normalizeSessionBoardTile({
			id: 'note-summary-depth',
			type: 'note',
			x: 0,
			y: 0,
			w: 4,
			h: 1,
			previewDepth: 'summary',
		});
		const fullDepthNote = normalizeSessionBoardTile({
			id: 'note-full-depth',
			type: 'note',
			x: 0,
			y: 0,
			w: 4,
			h: 2,
			previewDepth: 'full',
		});
		expect(titleDepthNote.h).toBe(1);
		expect(summaryDepthNote.h).toBe(2);
		expect(fullDepthNote.h).toBe(3);

		const normalizedTimer = normalizeSessionBoardTile({
			id: 'timer-tile',
			type: 'timer',
			x: 0,
			y: 0,
			w: 4,
			h: 3,
			timer: {
				...createDefaultTimerState(),
				mode: 'countdown',
				countdownMs: 120_000,
				lapsMs: [5_000],
				minimalDisplay: true,
			},
		});
		expect(normalizedTimer.type).toBe('timer');
		if (normalizedTimer.type === 'timer') {
			expect(normalizedTimer.timer?.mode).toBe('countdown');
			expect(normalizedTimer.timer?.countdownMs).toBe(120_000);
			expect(normalizedTimer.timer?.minimalDisplay).toBe(true);
		}

		const normalizedCombat = normalizeSessionBoardTile({
			id: 'combat-tile',
			type: 'combat',
			x: 0,
			y: 0,
			w: 6,
			h: 4,
			combat: {
				encounterName: 'Bridge Fight',
				systemId: 'dnd5e',
				round: 3,
				activeCombatantId: 'a',
				combatants: [{ id: 'a', name: 'A', initiative: 14, tieRank: 1 }],
				notes: '',
				loot: '',
				startedAt: '2026-03-02T00:00:00.000Z',
				endedAt: null,
				lastLogNoteId: null,
			},
		} as never);
		expect(normalizedCombat.type).toBe('combat');
		if (normalizedCombat.type === 'combat') {
			expect(normalizedCombat.combat?.encounterName).toBe('Bridge Fight');
			expect(normalizedCombat.combat?.combatants).toHaveLength(1);
			expect(normalizedCombat.combat?.combatants[0]?.name).toBe('A');
		}

		const normalizedDice = normalizeSessionBoardTile({
			id: 'dice-tile',
			type: 'dice',
			x: 0,
			y: 0,
			w: 5,
			h: 4,
		});
		expect(normalizedDice.type).toBe('dice');

		const normalizedGenerator = normalizeSessionBoardTile({
			id: 'generator-tile',
			type: 'generator',
			x: 0,
			y: 0,
			w: 5,
			h: 4,
		});
		expect(normalizedGenerator.type).toBe('generator');

		const normalizedHandouts = normalizeSessionBoardTile({
			id: 'handouts-tile',
			type: 'handouts',
			x: 0,
			y: 0,
			w: 6,
			h: 4,
		});
		expect(normalizedHandouts.type).toBe('handouts');

		const normalizedEncounter = normalizeSessionBoardTile({
			id: 'encounter-tile',
			type: 'encounter',
			x: 0,
			y: 0,
			w: 6,
			h: 5,
			encounter: {
				encounterName: 'Ridge Ambush',
				partyMembers: [{ id: 'party-1', name: 'Elyra', level: 5 }],
				combatants: [],
				environmentType: 'forest',
				environmentNoteId: null,
				environmentName: '',
				tacticalChecklist: [],
				budget: {
					easy: 250,
					medium: 500,
					hard: 750,
					deadly: 1100,
					baseXp: 200,
					adjustedXp: 200,
					multiplier: 1,
					difficulty: 'easy',
				},
				round: 1,
				activeCombatantEntryId: null,
				legendaryTrackers: [],
				lairTracker: { enabled: false, initiativeCount: 20, lastTriggeredRound: null, actions: [] },
				notableRolls: [],
				notes: '',
				outcome: '',
				startedAt: '2026-03-02T00:00:00.000Z',
				endedAt: null,
				lastLogNoteId: null,
			},
		} as never);
		expect(normalizedEncounter.type).toBe('encounter');
		if (normalizedEncounter.type === 'encounter') {
			expect(normalizedEncounter.encounter?.encounterName).toBe('Ridge Ambush');
			expect(normalizedEncounter.encounter?.environmentType).toBe('forest');
		}
	});

	it('normalizes session context state and enforces category uniqueness by note id', () => {
		const normalized = normalizeSessionContextState({
			collapsed: true,
			items: [
				{ noteId: 'npc-a', category: 'npc', pinnedAt: '2026-03-02T00:00:00.000Z' },
				{ noteId: 'npc-a', category: 'npc', pinnedAt: '2026-03-01T00:00:00.000Z' },
				{ noteId: 'loc-a', category: 'location', pinnedAt: '2026-03-02T01:00:00.000Z' },
				{ noteId: '', category: 'quest', pinnedAt: '2026-03-02T01:00:00.000Z' },
				{ noteId: 'bad-category', category: 'other', pinnedAt: '2026-03-02T01:00:00.000Z' },
			],
		});
		expect(normalized.collapsed).toBe(true);
		expect(normalized.items).toHaveLength(2);
		expect(normalized.items.map((item) => item.noteId)).toEqual(['loc-a', 'npc-a']);
	});

	it('falls back to default context state for invalid input', () => {
		expect(normalizeSessionContextState(null)).toEqual(DEFAULT_SESSION_CONTEXT);
	});

	it('normalizes scene payloads and guarantees an active scene', () => {
		const normalized = normalizeSessionBoardScenes(
			[
				{
					id: 'scene-2',
					title: 'Market Chase',
					description: 'A running chase through crowded stalls.',
					referenceNoteIds: ['note-a', 'note-a', 'note-b'],
					threadNoteIds: ['quest-1'],
				},
			],
			'missing-scene-id',
			'Session Board',
		);
		expect(normalized.scenes).toHaveLength(1);
		expect(normalized.scenes[0]?.title).toBe('Market Chase');
		expect(normalized.scenes[0]?.referenceNoteIds).toEqual(['note-a', 'note-b']);
		expect(normalized.activeSceneId).toBe('scene-2');

		const fallback = normalizeSessionBoardScenes([], null, 'Board');
		expect(fallback.scenes).toHaveLength(1);
		expect(fallback.scenes[0]?.title).toContain('Board');
		expect(fallback.activeSceneId).toBe(fallback.scenes[0]?.id ?? null);

		const created = createDefaultSessionBoardScene('Custom Opening', '2026-03-08T00:00:00.000Z');
		expect(created.title).toBe('Custom Opening');
		expect(created.entityNoteIds).toEqual([]);
	});

	it('normalizes handout delivery history entries', () => {
		const normalized = normalizeSessionBoardHandoutHistory([
			{
				id: 'delivery-1',
				handoutId: 'handout-1',
				title: 'Duke Letter',
				sourceKind: 'note',
				deliveredAt: '2026-03-08T09:12:00.000Z',
			},
			{
				id: 'delivery-2',
				handoutId: 'handout-2',
				title: 'City Map',
				sourceKind: 'map_region',
				deliveredAt: '2026-03-08T10:12:00.000Z',
			},
			{
				id: '',
				handoutId: '',
				title: '',
				deliveredAt: '',
			},
		]);
		expect(normalized).toHaveLength(2);
		expect(normalized[0]?.id).toBe('delivery-2');
		expect(normalized[0]?.sourceKind).toBe('map_region');
		expect(normalized[1]?.sourceKind).toBe('note');
	});

	it('moves session board tiles up and down by row with bounds clamping', () => {
		const tiles = [
			{ id: 'tile-a', type: 'note', x: 0, y: 3, w: 4, h: 3 },
			{ id: 'tile-b', type: 'timer', x: 4, y: 0, w: 4, h: 3 },
		] as const;

		const movedDown = moveSessionBoardTileByRow(tiles, 'tile-a', 2);
		expect(movedDown.find((tile) => tile.id === 'tile-a')?.y).toBe(5);

		const movedUp = moveSessionBoardTileByRow(movedDown, 'tile-a', -9);
		expect(movedUp.find((tile) => tile.id === 'tile-a')?.y).toBe(0);

		const unchanged = moveSessionBoardTileByRow(tiles, 'missing-tile', 1);
		expect(unchanged).toEqual(tiles);
	});

	it('re-packs tiles into valid board columns without overlap', () => {
		const source = [
			{ id: 'tile-a', type: 'note', x: 10, y: 0, w: 4, h: 2 },
			{ id: 'tile-b', type: 'timer', x: 0, y: 0, w: 4, h: 2 },
			{ id: 'tile-c', type: 'dice', x: 8, y: 1, w: 4, h: 2 },
		] as const;

		const repacked = repackSessionBoardTiles(source, 10);
		expect(repacked).toHaveLength(3);
		for (const tile of repacked) {
			expect(tile.x).toBeGreaterThanOrEqual(0);
			expect(tile.x + tile.w).toBeLessThanOrEqual(10);
		}
		for (let i = 0; i < repacked.length; i += 1) {
			const a = repacked[i]!;
			for (let j = i + 1; j < repacked.length; j += 1) {
				const b = repacked[j]!;
				const overlaps = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
				expect(overlaps).toBe(false);
			}
		}
		expect(repacked.map((tile) => tile.id)).toEqual(
			expect.arrayContaining(['tile-a', 'tile-b', 'tile-c']),
		);
	});
});
