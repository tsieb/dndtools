import { getStorage } from '$lib/platform/storage/index.js';
import { DEFAULT_SETTINGS } from '$lib/types/settings.js';
import type { OnboardingStepId, OnboardingTipId } from '$lib/types/settings.js';
import {
	ONBOARDING_STEPS,
	completeOnboardingStep,
	dismissOnboardingTip,
} from '$lib/domain/onboarding.js';

class OnboardingState {
	dismissed = $state(DEFAULT_SETTINGS.onboarding.dismissed);
	completedSteps = $state<OnboardingStepId[]>([...DEFAULT_SETTINGS.onboarding.completedSteps]);
	dismissedTips = $state<OnboardingTipId[]>([...DEFAULT_SETTINGS.onboarding.dismissedTips]);

	completedCount = $derived(this.completedSteps.length);
	allStepsComplete = $derived(this.completedCount >= ONBOARDING_STEPS.length);

	private async save(): Promise<void> {
		await getStorage().setSetting('onboarding', {
			dismissed: this.dismissed,
			completedSteps: [...this.completedSteps],
			dismissedTips: [...this.dismissedTips],
		});
	}

	async loadFromStorage(): Promise<void> {
		const onboarding = await getStorage().getSetting('onboarding');
		this.dismissed = onboarding.dismissed ?? DEFAULT_SETTINGS.onboarding.dismissed;
		this.completedSteps = [...(onboarding.completedSteps ?? [])];
		this.dismissedTips = [...(onboarding.dismissedTips ?? [])];
	}

	async completeStep(step: OnboardingStepId): Promise<void> {
		const next = completeOnboardingStep(this.completedSteps, step);
		if (next.length === this.completedSteps.length) return;
		this.completedSteps = next;
		await this.save();
	}

	async dismissChecklist(): Promise<void> {
		if (this.dismissed) return;
		this.dismissed = true;
		await this.save();
	}

	async reopenChecklist(): Promise<void> {
		if (!this.dismissed) return;
		this.dismissed = false;
		await this.save();
	}

	async dismissTip(tip: OnboardingTipId): Promise<void> {
		const next = dismissOnboardingTip(this.dismissedTips, tip);
		if (next.length === this.dismissedTips.length) return;
		this.dismissedTips = next;
		await this.save();
	}

	async reset(): Promise<void> {
		this.dismissed = DEFAULT_SETTINGS.onboarding.dismissed;
		this.completedSteps = [...DEFAULT_SETTINGS.onboarding.completedSteps];
		this.dismissedTips = [...DEFAULT_SETTINGS.onboarding.dismissedTips];
		await this.save();
	}
}

export const onboardingState = new OnboardingState();
