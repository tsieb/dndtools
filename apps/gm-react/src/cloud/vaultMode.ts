// PER-VAULT PRIVACY MODE (ADR-026). Device-local record of the user's explicit onboarding choice
// between Private (E2EE) and Cloud-Enhanced (server-readable, consented). This flag is UX state and
// consent bookkeeping, NOT the security authority: the core's mode selectors + release gates decide
// what any mode may actually do, and the Cloud-Enhanced record ships unapproved (phase 1), so a
// tampered flag cannot widen any trust boundary. Absent or unrecognized values ALWAYS resolve to
// Private — trust never widens by accident (fail closed).

import { isVaultPrivacyMode, type VaultPrivacyMode } from '@dndtools/core';

export const VAULT_PRIVACY_MODE_KEY = 'dndtools:react:vault-privacy-mode';

/** The recorded explicit choice, or null when none was ever made (legacy install / fresh profile). */
export function storedVaultPrivacyMode(): VaultPrivacyMode | null {
	try {
		if (typeof window === 'undefined') return null;
		const raw = window.localStorage.getItem(VAULT_PRIVACY_MODE_KEY);
		return isVaultPrivacyMode(raw) ? raw : null;
	} catch {
		return null;
	}
}

/** The effective mode. No recorded choice ⇒ Private (fail closed). */
export function vaultPrivacyMode(): VaultPrivacyMode {
	return storedVaultPrivacyMode() ?? 'private-e2ee';
}

/** Record the user's explicit choice (onboarding forced step, or the Settings consent dialog). */
export function setVaultPrivacyMode(mode: VaultPrivacyMode): void {
	if (!isVaultPrivacyMode(mode)) return; // never persist an unrecognized value
	try {
		if (typeof window !== 'undefined') window.localStorage.setItem(VAULT_PRIVACY_MODE_KEY, mode);
	} catch {
		/* private mode — the effective mode simply stays Private next boot (fail closed) */
	}
}
