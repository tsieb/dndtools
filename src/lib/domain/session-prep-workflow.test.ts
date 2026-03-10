import { describe, it, expect } from 'vitest';
import { buildSessionLogNoteContent, parseTagEntryInput } from './session-prep-workflow.js';

describe('parseTagEntryInput', () => {
	it('splits comma/newline values and removes duplicates', () => {
		expect(parseTagEntryInput('Captain Aria,  Stonehill Inn\nCaptain Aria; Old Ruins')).toEqual([
			'Captain Aria',
			'Stonehill Inn',
			'Old Ruins',
		]);
	});

	it('ignores empty entries', () => {
		expect(parseTagEntryInput(' , \n ; ')).toEqual([]);
	});
});

describe('buildSessionLogNoteContent', () => {
	it('renders all structured sections and board link', () => {
		const content = buildSessionLogNoteContent({
			sessionBoardId: 'board-1',
			startedAt: '2026-03-08T01:00:00.000Z',
			endedAt: '2026-03-08T04:00:00.000Z',
			whatHappened: 'The party escaped the ambush.',
			npcNames: ['Captain Aria'],
			locationNames: ['Stonehill Inn'],
			questNames: ['Recover the Crown'],
			followUp: 'Prepare siege map overlays.',
			rollLogMarkdown: '## Session Roll Log\n- 01:11 d20 -> 17',
		});

		expect(content).toContain('# Session Log');
		expect(content).toContain('## What Happened This Session');
		expect(content).toContain('## What Changed');
		expect(content).toContain('## Follow-Up');
		expect(content).toContain('[Open board](/session/boards?board=board-1)');
		expect(content).toContain('NPCs encountered: Captain Aria');
		expect(content).toContain('Locations visited: Stonehill Inn');
		expect(content).toContain('Quests advanced: Recover the Crown');
		expect(content).toContain('## Session Roll Log');
		expect(content).toContain('- 01:11 d20 -> 17');
	});
});
