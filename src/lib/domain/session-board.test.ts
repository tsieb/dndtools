// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
	BUILT_IN_SESSION_BOARD_TEMPLATES,
	DEFAULT_SESSION_CONTEXT,
	createDefaultTimerState,
	normalizeBoardTemplatesSetting,
	normalizeSessionContextState,
	normalizeSessionBoardTile,
} from './session-board.js';

describe('session-board domain', () => {
	it('provides built-in templates for common session layouts', () => {
		expect(BUILT_IN_SESSION_BOARD_TEMPLATES.length).toBeGreaterThanOrEqual(4);
		expect(BUILT_IN_SESSION_BOARD_TEMPLATES.map((template) => template.name)).toEqual(
			expect.arrayContaining(['Combat Scene', 'NPC Encounter', 'Exploration', 'Town Visit']),
		);
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
});
