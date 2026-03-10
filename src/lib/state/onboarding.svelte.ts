import { getStorage } from '$lib/platform/storage/index.js';
import { DEFAULT_SETTINGS } from '$lib/types/settings.js';
import type {
	OnboardingGuidedPromptId,
	OnboardingMilestoneId,
	OnboardingPhase,
	OnboardingSettings,
} from '$lib/types/settings.js';
import {
	ONBOARDING_MILESTONES,
	completeOnboardingMilestone,
	countCompletedOnboardingMilestones,
	createEmptyOnboardingMilestones,
	shouldShowOnboardingWizard,
} from '$lib/domain/onboarding.js';

type MilestoneRecord = Record<OnboardingMilestoneId, boolean>;

function dedupePromptIds(values: readonly OnboardingGuidedPromptId[]): OnboardingGuidedPromptId[] {
	return Array.from(new Set(values));
}

function hasMilestoneDifferences(a: MilestoneRecord, b: MilestoneRecord): boolean {
	for (const milestone of ONBOARDING_MILESTONES) {
		if (a[milestone.id] !== b[milestone.id]) return true;
	}
	return false;
}

class OnboardingState {
	onboardingComplete = $state<OnboardingSettings['onboardingComplete']>(
		DEFAULT_SETTINGS.onboarding.onboardingComplete,
	);
	onboardingPhase = $state<OnboardingPhase>(DEFAULT_SETTINGS.onboarding.onboardingPhase);
	vaultName = $state(DEFAULT_SETTINGS.onboarding.vaultName);
	milestones = $state<MilestoneRecord>({ ...DEFAULT_SETTINGS.onboarding.milestones });
	shownPrompts = $state<OnboardingGuidedPromptId[]>([...DEFAULT_SETTINGS.onboarding.shownPrompts]);
	dismissedPrompts = $state<OnboardingGuidedPromptId[]>([
		...DEFAULT_SETTINGS.onboarding.dismissedPrompts,
	]);
	lastSeenWhatsNewVersion = $state(DEFAULT_SETTINGS.onboarding.lastSeenWhatsNewVersion);

	completedCount = $derived(countCompletedOnboardingMilestones(this.milestones));
	allMilestonesComplete = $derived(this.completedCount >= ONBOARDING_MILESTONES.length);

	private toSettings(): OnboardingSettings {
		return {
			onboardingComplete: this.onboardingComplete,
			onboardingPhase: this.onboardingPhase,
			vaultName: this.vaultName,
			milestones: { ...this.milestones },
			shownPrompts: [...this.shownPrompts],
			dismissedPrompts: [...this.dismissedPrompts],
			lastSeenWhatsNewVersion: this.lastSeenWhatsNewVersion,
		};
	}

	private async save(): Promise<void> {
		await getStorage().setSetting('onboarding', this.toSettings());
	}

	async loadFromStorage(): Promise<void> {
		const onboarding = await getStorage().getSetting('onboarding');
		this.onboardingComplete = onboarding.onboardingComplete;
		this.onboardingPhase = onboarding.onboardingPhase;
		this.vaultName = onboarding.vaultName;
		this.milestones = { ...onboarding.milestones };
		this.shownPrompts = [...onboarding.shownPrompts];
		this.dismissedPrompts = [...onboarding.dismissedPrompts];
		this.lastSeenWhatsNewVersion = onboarding.lastSeenWhatsNewVersion;
	}

	shouldShowSetupWizard(activeNoteCount: number): boolean {
		return shouldShowOnboardingWizard(this.toSettings(), activeNoteCount);
	}

	hasMilestone(milestoneId: OnboardingMilestoneId): boolean {
		return this.milestones[milestoneId];
	}

	async markVaultOpened(vaultName?: string): Promise<void> {
		const nextMilestones = completeOnboardingMilestone(this.milestones, 'vault_created');
		const nextVaultName = (vaultName ?? this.vaultName).trim();
		let phase = this.onboardingPhase;
		let complete = this.onboardingComplete;
		if (phase === 'not_started') {
			phase = 'started';
		}
		if (complete === null) {
			complete = false;
		}
		const changed =
			hasMilestoneDifferences(this.milestones, nextMilestones) ||
			phase !== this.onboardingPhase ||
			complete !== this.onboardingComplete ||
			nextVaultName !== this.vaultName;
		if (!changed) return;
		this.milestones = nextMilestones;
		this.onboardingPhase = phase;
		this.onboardingComplete = complete;
		this.vaultName = nextVaultName;
		await this.save();
	}

	async beginFromWizard(vaultName: string): Promise<void> {
		const nextMilestones = completeOnboardingMilestone(this.milestones, 'vault_created');
		const normalizedName = vaultName.trim();
		this.onboardingComplete = false;
		this.onboardingPhase = 'started';
		this.vaultName = normalizedName;
		this.milestones = nextMilestones;
		await this.save();
	}

	async completeMilestone(milestoneId: OnboardingMilestoneId): Promise<void> {
		const nextMilestones = completeOnboardingMilestone(this.milestones, milestoneId);
		if (!hasMilestoneDifferences(this.milestones, nextMilestones)) return;
		this.milestones = nextMilestones;
		if (this.onboardingPhase === 'not_started') {
			this.onboardingPhase = 'started';
		}
		if (this.onboardingComplete === null) {
			this.onboardingComplete = false;
		}
		if (countCompletedOnboardingMilestones(nextMilestones) >= ONBOARDING_MILESTONES.length) {
			this.onboardingComplete = true;
			this.onboardingPhase = 'completed';
		}
		await this.save();
	}

	async syncSignalMilestones(input: {
		noteCount: number;
		linkCount: number;
		tagCount: number;
	}): Promise<void> {
		let nextMilestones = this.milestones;
		if (input.noteCount >= 1) {
			nextMilestones = completeOnboardingMilestone(nextMilestones, 'first_note');
		}
		if (input.linkCount >= 1) {
			nextMilestones = completeOnboardingMilestone(nextMilestones, 'first_link');
		}
		if (input.tagCount >= 1) {
			nextMilestones = completeOnboardingMilestone(nextMilestones, 'first_tag');
		}
		if (!hasMilestoneDifferences(this.milestones, nextMilestones)) return;
		this.milestones = nextMilestones;
		if (this.onboardingPhase === 'not_started') {
			this.onboardingPhase = 'started';
		}
		if (this.onboardingComplete === null) {
			this.onboardingComplete = false;
		}
		await this.save();
	}

	canTriggerGuidedPrompt(promptId: OnboardingGuidedPromptId): boolean {
		if (this.shownPrompts.includes(promptId)) return false;
		if (this.dismissedPrompts.includes(promptId)) return false;
		return true;
	}

	async markGuidedPromptShown(promptId: OnboardingGuidedPromptId): Promise<void> {
		if (this.shownPrompts.includes(promptId)) return;
		this.shownPrompts = dedupePromptIds([...this.shownPrompts, promptId]);
		await this.save();
	}

	async dismissGuidedPrompt(promptId: OnboardingGuidedPromptId): Promise<void> {
		if (this.dismissedPrompts.includes(promptId)) return;
		this.dismissedPrompts = dedupePromptIds([...this.dismissedPrompts, promptId]);
		await this.save();
	}

	hasUnseenWhatsNew(version: string | null | undefined): boolean {
		if (!version) return false;
		return this.lastSeenWhatsNewVersion !== version;
	}

	async markWhatsNewSeen(version: string): Promise<void> {
		const normalized = version.trim();
		if (!normalized) return;
		if (this.lastSeenWhatsNewVersion === normalized) return;
		this.lastSeenWhatsNewVersion = normalized;
		await this.save();
	}

	async reset(): Promise<void> {
		this.onboardingComplete = DEFAULT_SETTINGS.onboarding.onboardingComplete;
		this.onboardingPhase = DEFAULT_SETTINGS.onboarding.onboardingPhase;
		this.vaultName = DEFAULT_SETTINGS.onboarding.vaultName;
		this.milestones = createEmptyOnboardingMilestones();
		this.shownPrompts = [...DEFAULT_SETTINGS.onboarding.shownPrompts];
		this.dismissedPrompts = [...DEFAULT_SETTINGS.onboarding.dismissedPrompts];
		this.lastSeenWhatsNewVersion = DEFAULT_SETTINGS.onboarding.lastSeenWhatsNewVersion;
		await this.save();
	}
}

export const onboardingState = new OnboardingState();
