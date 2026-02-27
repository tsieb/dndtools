import { describe, expect, it } from 'vitest';
import { DND_VAULT_TEMPLATES, getVaultTemplateById } from './vault-templates.js';

describe('DND_VAULT_TEMPLATES', () => {
	it('includes required starter templates', () => {
		expect(DND_VAULT_TEMPLATES.map((template) => template.id).sort()).toEqual([
			'campaign-starter',
			'one-shot',
			'player-journal',
		]);
	});

	it('ensures each template has at least two notes', () => {
		for (const template of DND_VAULT_TEMPLATES) {
			expect(template.notes.length).toBeGreaterThanOrEqual(2);
		}
	});

	it('resolves templates by id', () => {
		expect(getVaultTemplateById('campaign-starter')?.name).toBe('Campaign Starter');
	});
});
