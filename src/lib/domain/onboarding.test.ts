import { describe, expect, it } from 'vitest';
import {
	ONBOARDING_GUIDED_PROMPTS,
	ONBOARDING_MILESTONES,
	completeOnboardingMilestone,
	countCompletedOnboardingMilestones,
	createEmptyOnboardingMilestones,
	isOnboardingMilestoneComplete,
	nextOnboardingMilestone,
	shouldShowOnboardingWizard,
} from './onboarding.js';
import type { OnboardingSettings } from '$lib/types/settings.js';

function buildOnboardingSettings(overrides: Partial<OnboardingSettings> = {}): OnboardingSettings {
	return {
		onboardingComplete: null,
		onboardingPhase: 'not_started',
		vaultName: '',
		milestones: createEmptyOnboardingMilestones(),
		shownPrompts: [],
		dismissedPrompts: [],
		lastSeenWhatsNewVersion: null,
		...overrides,
	};
}

describe('onboarding definitions', () => {
	it('includes seven onboarding milestones', () => {
		expect(ONBOARDING_MILESTONES).toHaveLength(7);
	});

	it('includes guided first-action prompts', () => {
		expect(ONBOARDING_GUIDED_PROMPTS.map((prompt) => prompt.id).sort()).toEqual([
			'first_note_link_hint',
			'second_note_link_hint',
		]);
	});
});

describe('onboarding helper functions', () => {
	it('completes milestones without mutating already-complete states', () => {
		const base = createEmptyOnboardingMilestones();
		const once = completeOnboardingMilestone(base, 'first_note');
		const twice = completeOnboardingMilestone(once, 'first_note');
		expect(once.first_note).toBe(true);
		expect(twice).toBe(once);
	});

	it('counts completed milestones', () => {
		const milestones = completeOnboardingMilestone(
			completeOnboardingMilestone(createEmptyOnboardingMilestones(), 'vault_created'),
			'first_note',
		);
		expect(countCompletedOnboardingMilestones(milestones)).toBe(2);
	});

	it('reports milestone completion status', () => {
		const milestones = completeOnboardingMilestone(
			createEmptyOnboardingMilestones(),
			'first_search',
		);
		expect(isOnboardingMilestoneComplete(milestones, 'first_search')).toBe(true);
		expect(isOnboardingMilestoneComplete(milestones, 'first_session')).toBe(false);
	});

	it('returns the next incomplete milestone', () => {
		const milestones = createEmptyOnboardingMilestones();
		expect(nextOnboardingMilestone(milestones)?.id).toBe('vault_created');
		const withVault = completeOnboardingMilestone(milestones, 'vault_created');
		expect(nextOnboardingMilestone(withVault)?.id).toBe('first_note');
	});

	it('shows wizard only for first-run empty vaults', () => {
		expect(shouldShowOnboardingWizard(buildOnboardingSettings(), 0)).toBe(true);
		expect(
			shouldShowOnboardingWizard(buildOnboardingSettings({ onboardingComplete: false }), 0),
		).toBe(false);
		expect(shouldShowOnboardingWizard(buildOnboardingSettings(), 1)).toBe(false);
		expect(
			shouldShowOnboardingWizard(buildOnboardingSettings({ onboardingPhase: 'started' }), 0),
		).toBe(false);
	});
});
