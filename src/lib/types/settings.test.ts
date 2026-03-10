import { describe, expect, it } from 'vitest';
import {
	ADVANCED_FEATURE_IDS,
	normalizeFeatureSettings,
	type AdvancedFeatureId,
} from '$lib/types/settings.js';

describe('normalizeFeatureSettings', () => {
	it('returns defaults for missing input', () => {
		const normalized = normalizeFeatureSettings(null);
		expect(normalized.mcpAccessAcknowledged).toBe(false);
		expect(normalized.dismissedPrompts).toEqual([]);
		for (const id of ADVANCED_FEATURE_IDS) {
			expect(normalized.advanced[id]).toBe(false);
		}
	});

	it('keeps valid booleans and filters invalid prompt values', () => {
		const normalized = normalizeFeatureSettings({
			advanced: {
				knowledge_graph: true,
				timeline: true,
				inline_dice_rolls: false,
			},
			mcpAccessAcknowledged: true,
			dismissedPrompts: ['prompt-a', 12, null, 'prompt-b'],
		});
		expect(normalized.advanced.knowledge_graph).toBe(true);
		expect(normalized.advanced.timeline).toBe(true);
		expect(normalized.mcpAccessAcknowledged).toBe(true);
		expect(normalized.dismissedPrompts).toEqual(['prompt-a', 'prompt-b']);
	});

	it('ignores unknown advanced feature keys', () => {
		const normalized = normalizeFeatureSettings({
			advanced: {
				knowledge_graph: true,
				unknown_flag: true,
			},
		});
		expect(normalized.advanced.knowledge_graph).toBe(true);
		expect('unknown_flag' in normalized.advanced).toBe(false);
	});

	it('covers every feature id in the defaults object', () => {
		const normalized = normalizeFeatureSettings(null);
		const keys = Object.keys(normalized.advanced).sort();
		expect(keys).toEqual([...ADVANCED_FEATURE_IDS].sort());
	});

	it('supports dynamic feature access by typed key', () => {
		const normalized = normalizeFeatureSettings({
			advanced: { encounter_builder: true },
		});
		const key: AdvancedFeatureId = 'encounter_builder';
		expect(normalized.advanced[key]).toBe(true);
	});
});
