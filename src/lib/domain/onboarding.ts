import type { OnboardingStepId, OnboardingTipId } from '$lib/types/settings.js';

export interface OnboardingStepDefinition {
	id: OnboardingStepId;
	label: string;
	description: string;
}

export interface OnboardingTipDefinition {
	id: OnboardingTipId;
	title: string;
	description: string;
}

export const ONBOARDING_STEPS: readonly OnboardingStepDefinition[] = [
	{
		id: 'create_first_note',
		label: 'Create your first note',
		description: 'Start with one idea, then expand your world from there.',
	},
	{
		id: 'add_link',
		label: 'Create a wikilink',
		description: 'Connect related notes with [[links]] to build campaign context.',
	},
	{
		id: 'add_tag',
		label: 'Tag a note',
		description: 'Use tags to group notes for quick filtering during sessions.',
	},
	{
		id: 'use_search',
		label: 'Try global search',
		description: 'Use fast search to find details under table-time pressure.',
	},
	{
		id: 'open_settings',
		label: 'Open settings',
		description: 'Customize behavior and review vault integrity in one place.',
	},
] as const;

export const ONBOARDING_TIPS: readonly OnboardingTipDefinition[] = [
	{
		id: 'wikilinks',
		title: 'Why wikilinks matter',
		description: 'Wikilinks turn isolated notes into a navigable campaign web.',
	},
	{
		id: 'backlinks',
		title: 'Why backlinks matter',
		description: 'Backlinks reveal every note that references your current note.',
	},
	{
		id: 'object_embeds',
		title: 'Why object embeds matter',
		description: 'Embeds keep stat blocks and reusable snippets consistent everywhere.',
	},
] as const;

function dedupe<T extends string>(values: readonly T[]): T[] {
	return Array.from(new Set(values));
}

export function completeOnboardingStep(
	completedSteps: readonly OnboardingStepId[],
	step: OnboardingStepId,
): OnboardingStepId[] {
	return dedupe([...completedSteps, step]);
}

export function dismissOnboardingTip(
	dismissedTips: readonly OnboardingTipId[],
	tip: OnboardingTipId,
): OnboardingTipId[] {
	return dedupe([...dismissedTips, tip]);
}

export function isOnboardingStepComplete(
	completedSteps: readonly OnboardingStepId[],
	step: OnboardingStepId,
): boolean {
	return completedSteps.includes(step);
}
