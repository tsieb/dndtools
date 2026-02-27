import { describe, expect, it } from 'vitest';
import {
	ONBOARDING_STEPS,
	ONBOARDING_TIPS,
	completeOnboardingStep,
	dismissOnboardingTip,
	isOnboardingStepComplete,
} from './onboarding.js';

describe('onboarding definitions', () => {
	it('includes the five guided checklist steps', () => {
		expect(ONBOARDING_STEPS).toHaveLength(5);
	});

	it('includes core concept tips', () => {
		expect(ONBOARDING_TIPS.map((tip) => tip.id).sort()).toEqual([
			'backlinks',
			'object_embeds',
			'wikilinks',
		]);
	});
});

describe('onboarding helpers', () => {
	it('completes a step without duplicates', () => {
		const once = completeOnboardingStep([], 'create_first_note');
		const twice = completeOnboardingStep(once, 'create_first_note');
		expect(twice).toEqual(['create_first_note']);
	});

	it('dismisses tips without duplicates', () => {
		const once = dismissOnboardingTip([], 'wikilinks');
		const twice = dismissOnboardingTip(once, 'wikilinks');
		expect(twice).toEqual(['wikilinks']);
	});

	it('checks step completion', () => {
		expect(isOnboardingStepComplete(['open_settings'], 'open_settings')).toBe(true);
		expect(isOnboardingStepComplete([], 'open_settings')).toBe(false);
	});
});
