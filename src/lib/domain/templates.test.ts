import { describe, it, expect } from 'vitest';
import { DND_TEMPLATES, type NoteTemplate } from './templates.js';

describe('DND_TEMPLATES', () => {
	it('has 20 templates', () => {
		expect(DND_TEMPLATES).toHaveLength(20);
	});

	it('each template has a unique id', () => {
		const ids = DND_TEMPLATES.map((t) => t.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('each template has required fields', () => {
		for (const template of DND_TEMPLATES) {
			expect(template.id).toBeTruthy();
			expect(template.name).toBeTruthy();
			expect(template.description).toBeTruthy();
			expect(template.icon).toBeTruthy();
			expect(template.content).toBeTruthy();
			expect(template.defaultFolder).toBeTruthy();
			expect(Array.isArray(template.defaultTags)).toBe(true);
			expect(template.defaultTags.length).toBeGreaterThan(0);
		}
	});

	it('includes expected template types', () => {
		const ids = DND_TEMPLATES.map((t) => t.id);
		expect(ids).toContain('npc');
		expect(ids).toContain('major-npc');
		expect(ids).toContain('location');
		expect(ids).toContain('settlement');
		expect(ids).toContain('region');
		expect(ids).toContain('dungeon');
		expect(ids).toContain('session');
		expect(ids).toContain('session-prep');
		expect(ids).toContain('quest');
		expect(ids).toContain('adventure-hook');
		expect(ids).toContain('campaign-arc');
		expect(ids).toContain('timeline');
		expect(ids).toContain('item');
		expect(ids).toContain('spell-ritual');
		expect(ids).toContain('monster');
		expect(ids).toContain('encounter');
		expect(ids).toContain('faction');
		expect(ids).toContain('deity');
		expect(ids).toContain('culture');
		expect(ids).toContain('rumor-clue');
	});

	it('templates have markdown content with headings', () => {
		for (const template of DND_TEMPLATES) {
			expect(template.content).toContain('#');
		}
	});

	it('template folders start with /', () => {
		for (const template of DND_TEMPLATES) {
			expect(template.defaultFolder).toMatch(/^\//);
		}
	});

	it('NPC template includes expected sections', () => {
		const npc = DND_TEMPLATES.find((t) => t.id === 'npc') as NoteTemplate;
		expect(npc.content).toContain('## Description');
		expect(npc.content).toContain('## Personality');
		expect(npc.content).toContain('## Connections');
	});

	it('Session template includes task list items', () => {
		const session = DND_TEMPLATES.find((t) => t.id === 'session') as NoteTemplate;
		expect(session.content).toContain('- [ ]');
	});

	it('Quest template includes status field', () => {
		const quest = DND_TEMPLATES.find((t) => t.id === 'quest') as NoteTemplate;
		expect(quest.content).toContain('status: active');
	});
});
