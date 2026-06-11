import { describe, expect, it } from 'vitest';
import {
	BUILT_IN_TEMPLATES,
	buildTemplateLibrary,
	builtInById,
	instantiatedSceneName,
	missingBindingBanner,
	templateNameSuggestion,
	templateThumbAlt,
} from '../../src/lib/gui/ux-canvas/canvas-templates';

// UX-CANVAS-010: the unified template library (read-only built-ins + the DM's saved templates).

describe('buildTemplateLibrary', () => {
	it('lists built-ins first (read-only, non-deletable), then user templates sorted by name', () => {
		const lib = buildTemplateLibrary([
			{ id: 'u2', name: 'Zephyr Board', updatedAt: '2026-01-02' },
			{ id: 'u1', name: 'Alpha Board', updatedAt: '2026-01-01' },
		]);
		const builtInCount = BUILT_IN_TEMPLATES.length;
		expect(lib.slice(0, builtInCount).every((e) => e.kind === 'built-in')).toBe(true);
		expect(lib.slice(0, builtInCount).every((e) => e.deletable === false)).toBe(true);
		expect(lib.slice(builtInCount).map((e) => e.name)).toEqual(['Alpha Board', 'Zephyr Board']);
	});

	it('exposes a widget count for built-ins but not user templates', () => {
		const lib = buildTemplateLibrary([{ id: 'u1', name: 'A', updatedAt: '2026-01-01' }]);
		expect(lib.find((e) => e.kind === 'built-in')?.widgetCount).toBeGreaterThan(0);
		expect(lib.find((e) => e.kind === 'user')?.widgetCount).toBeNull();
	});
});

describe('builtInById', () => {
	it('resolves a built-in recipe by id, and ships the three required starters', () => {
		expect(BUILT_IN_TEMPLATES.map((t) => t.name)).toEqual([
			'Combat Session',
			'Prep Board',
			'Player Handout Canvas',
		]);
		expect(builtInById('builtin.combat-session')?.widgets.length).toBeGreaterThan(0);
		expect(builtInById('nope')).toBeUndefined();
	});
});

describe('naming + alt text', () => {
	it('suggests a template name and an instantiated scene name', () => {
		expect(templateNameSuggestion('Goblin Ambush')).toBe('Goblin Ambush template');
		expect(instantiatedSceneName('Combat Session')).toBe('Combat Session (new)');
	});

	it('builds descriptive thumbnail alt text', () => {
		const lib = buildTemplateLibrary([]);
		expect(templateThumbAlt(lib[0]!)).toContain('built-in template');
	});
});

describe('missingBindingBanner', () => {
	it('returns null when all bindings resolve, else a count message', () => {
		expect(missingBindingBanner(0)).toBeNull();
		expect(missingBindingBanner(1)).toContain('1 binding');
		expect(missingBindingBanner(3)).toContain('3 bindings');
	});
});
