// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
	BUILT_IN_SESSION_BOARD_TEMPLATES,
	createDefaultTimerState,
	normalizeBoardTemplatesSetting,
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
	});
});
