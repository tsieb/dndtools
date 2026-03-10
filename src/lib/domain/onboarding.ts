import {
	ONBOARDING_MILESTONE_IDS,
	type OnboardingGuidedPromptId,
	type OnboardingMilestoneId,
	type OnboardingSettings,
} from '$lib/types/settings.js';

export interface OnboardingMilestoneDefinition {
	id: OnboardingMilestoneId;
	label: string;
	description: string;
	firstActionHint: string;
}

export interface OnboardingGuidedPromptDefinition {
	id: OnboardingGuidedPromptId;
	message: string;
}

export const ONBOARDING_MILESTONES: readonly OnboardingMilestoneDefinition[] = [
	{
		id: 'vault_created',
		label: 'Vault created',
		description: 'You started your campaign vault.',
		firstActionHint: 'Open your vault and choose a starting note.',
	},
	{
		id: 'first_note',
		label: 'First note',
		description: 'You created your first note.',
		firstActionHint: 'Create a note from Knowledge > Notes.',
	},
	{
		id: 'first_link',
		label: 'First wikilink',
		description: 'You connected notes with a wikilink.',
		firstActionHint: 'Type [[Another Note]] in your note body.',
	},
	{
		id: 'first_tag',
		label: 'First tag',
		description: 'You tagged a note for quick filtering.',
		firstActionHint: 'Add a #tag in note frontmatter or content.',
	},
	{
		id: 'first_template',
		label: 'First template',
		description: 'You created a note from a template.',
		firstActionHint: 'Use New Note > template option.',
	},
	{
		id: 'first_search',
		label: 'First search',
		description: 'You searched your vault.',
		firstActionHint: 'Open Knowledge > Search and run a query.',
	},
	{
		id: 'first_session',
		label: 'First session',
		description: 'You started a live session.',
		firstActionHint: 'Open Session Boards and start a session.',
	},
];

export const ONBOARDING_GUIDED_PROMPTS: readonly OnboardingGuidedPromptDefinition[] = [
	{
		id: 'first_note_link_hint',
		message: 'Try linking to another note with [[double brackets]].',
	},
	{
		id: 'second_note_link_hint',
		message: 'Try linking this note to your second note using [[double brackets]].',
	},
];

export function createEmptyOnboardingMilestones(): Record<OnboardingMilestoneId, boolean> {
	return {
		vault_created: false,
		first_note: false,
		first_link: false,
		first_tag: false,
		first_template: false,
		first_search: false,
		first_session: false,
	};
}

export function completeOnboardingMilestone(
	current: Record<OnboardingMilestoneId, boolean>,
	milestoneId: OnboardingMilestoneId,
): Record<OnboardingMilestoneId, boolean> {
	if (current[milestoneId]) return current;
	return {
		...current,
		[milestoneId]: true,
	};
}

export function isOnboardingMilestoneComplete(
	current: Record<OnboardingMilestoneId, boolean>,
	milestoneId: OnboardingMilestoneId,
): boolean {
	return current[milestoneId];
}

export function countCompletedOnboardingMilestones(
	current: Record<OnboardingMilestoneId, boolean>,
): number {
	return ONBOARDING_MILESTONE_IDS.reduce(
		(count, milestoneId) => count + (current[milestoneId] ? 1 : 0),
		0,
	);
}

export function shouldShowOnboardingWizard(
	onboarding: OnboardingSettings,
	activeNoteCount: number,
): boolean {
	if (activeNoteCount > 0) return false;
	if (onboarding.onboardingComplete !== null) return false;
	return onboarding.onboardingPhase === 'not_started';
}

export function nextOnboardingMilestone(
	current: Record<OnboardingMilestoneId, boolean>,
): OnboardingMilestoneDefinition | null {
	return ONBOARDING_MILESTONES.find((milestone) => !current[milestone.id]) ?? null;
}
