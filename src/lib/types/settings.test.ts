import { describe, expect, it } from 'vitest';
import {
	ADVANCED_FEATURE_IDS,
	normalizeFeatureSettings,
	normalizeOnboardingSettings,
	ONBOARDING_MILESTONE_IDS,
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

describe('normalizeOnboardingSettings', () => {
	it('returns defaults for invalid input', () => {
		const normalized = normalizeOnboardingSettings(null);
		expect(normalized.onboardingComplete).toBeNull();
		expect(normalized.onboardingPhase).toBe('not_started');
		expect(normalized.shownPrompts).toEqual([]);
		expect(normalized.dismissedPrompts).toEqual([]);
		for (const milestoneId of ONBOARDING_MILESTONE_IDS) {
			expect(normalized.milestones[milestoneId]).toBe(false);
		}
	});

	it('migrates legacy completed step data into milestones', () => {
		const normalized = normalizeOnboardingSettings({
			completedSteps: ['create_first_note', 'add_link', 'use_search'],
		});
		expect(normalized.onboardingPhase).toBe('started');
		expect(normalized.onboardingComplete).toBe(false);
		expect(normalized.milestones.first_note).toBe(true);
		expect(normalized.milestones.first_link).toBe(true);
		expect(normalized.milestones.first_search).toBe(true);
	});

	it('keeps explicit modern onboarding fields', () => {
		const normalized = normalizeOnboardingSettings({
			onboardingComplete: false,
			onboardingPhase: 'started',
			vaultName: 'Storm Keep',
			milestones: {
				vault_created: true,
				first_note: true,
				first_link: false,
				first_tag: false,
				first_template: true,
				first_search: true,
				first_session: false,
			},
			shownPrompts: ['first_note_link_hint', 'first_note_link_hint'],
			dismissedPrompts: ['second_note_link_hint'],
			lastSeenWhatsNewVersion: '0.1.0',
		});
		expect(normalized.vaultName).toBe('Storm Keep');
		expect(normalized.milestones.first_template).toBe(true);
		expect(normalized.shownPrompts).toEqual(['first_note_link_hint']);
		expect(normalized.dismissedPrompts).toEqual(['second_note_link_hint']);
		expect(normalized.lastSeenWhatsNewVersion).toBe('0.1.0');
	});
});
