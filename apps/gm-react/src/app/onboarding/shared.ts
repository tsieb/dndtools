import type { FeatureTier } from '@dndtools/core';
import {
	PREFERENCE_KEYS,
	readPreference,
	writePreference,
	type PreferenceKey,
} from '../../platform/preferences';

/* The onboarding wizard's storage contract and three-step definition (RC-UX-3.6). */

export const ONBOARDED_KEY = PREFERENCE_KEYS.onboarded;
export const VAULT_CHOICE_KEY = PREFERENCE_KEYS.vaultChoice;
export const REPLAY_EVENT = 'dndtools:onboarding-replay';
export const TIER_KEY = PREFERENCE_KEYS.tier;
export const TIER_ATTR = 'data-feature-tier';

/* The wizard's device-local state goes through the platform preferences layer (RC-UX-4.1). */
export const readStorage = (key: PreferenceKey) => readPreference(key);
export const writeStorage = (key: PreferenceKey, value: string) => writePreference(key, value);

export function readStoredTier(): FeatureTier {
	const value = readStorage(TIER_KEY);
	return value === 'core' || value === 'intermediate' || value === 'advanced'
		? value
		: 'intermediate';
}

export const ONB_STEPS = [
	{ id: 'campaign', title: 'onboarding.v3.campaign', icon: 'vault' },
	{ id: 'experience', title: 'onboarding.v3.complexity', icon: 'sliders' },
	{ id: 'ready', title: 'onboarding.v3.ready', icon: 'flag' },
] as const;

/** ADR-026 — the typed acknowledgment for choosing Private (E2EE), mirroring AccountDangerPanel. */
export const PRIVACY_ACK_PHRASE = 'i hold the keys';

export const FOCUSABLE =
	'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
