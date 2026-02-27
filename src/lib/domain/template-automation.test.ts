import { describe, expect, it } from 'vitest';
import { DND_TEMPLATES } from './templates.js';
import {
	buildTemplateContext,
	getScopedTemplates,
	renderNoteTemplate,
	renderTemplateVariables,
	resolveTemplateTitle,
} from './template-automation.js';

describe('template automation', () => {
	it('renders known variables', () => {
		const context = buildTemplateContext(
			{
				campaignName: 'Icewind Dale',
				sessionNumber: 7,
				characterNames: ['Aelar', 'Mira'],
			},
			new Date('2026-02-18T10:00:00Z'),
		);

		const rendered = renderTemplateVariables(
			'{{date_iso}} | {{campaign_name}} | {{session_number}} | {{character_names_csv}}',
			context,
		);
		expect(rendered).toContain('2026-02-18');
		expect(rendered).toContain('Icewind Dale');
		expect(rendered).toContain('7');
		expect(rendered).toContain('Aelar, Mira');
	});

	it('assigns global and folder-scoped templates', () => {
		const scoped = getScopedTemplates('/sessions');
		expect(scoped.some((entry) => entry.scope === 'global')).toBe(true);
		expect(
			scoped.some((entry) => entry.scope === 'folder' && entry.scopeFolder === '/sessions'),
		).toBe(true);
	});

	it('renders session recap template with context', () => {
		const recap = DND_TEMPLATES.find((entry) => entry.id === 'session-recap');
		expect(recap).toBeTruthy();
		const context = buildTemplateContext(
			{
				campaignName: 'Red Hand',
				sessionNumber: 12,
				characterNames: ['Bryn'],
			},
			new Date('2026-02-18T10:00:00Z'),
		);
		const title = resolveTemplateTitle(recap!, context);
		const rendered = renderNoteTemplate(recap!, context);
		expect(title).toContain('Session 12 Recap');
		expect(rendered.content).toContain('Red Hand');
		expect(rendered.content).toContain('Bryn');
	});
});
