import { MIN_RECOVERY_PASSPHRASE_CHARS } from '@dndtools/core';

/**
 * Why the recovery-key export cannot proceed yet, in the user's words — or `null` when it can.
 *
 * Both fields are `type="password"`, so a mismatch is invisible by construction: the panel used to
 * express the whole rule as an inert Export button and nothing else, which is exactly the WCAG 3.3.1
 * (error identification) failure. Lives out here as a pure function because the panel it belongs to
 * only renders for a signed-in cloud account and so is unreachable from the e2e suite.
 *
 * Returns `null` for a field the user has not filled in yet: "you have typed nothing" is a prompt,
 * not an error, and shouting at an empty form is its own defect.
 */
export function recoveryPassphraseIssue(pass: string, confirm: string): string | null {
	if (pass.length > 0 && pass.length < MIN_RECOVERY_PASSPHRASE_CHARS) {
		const short = MIN_RECOVERY_PASSPHRASE_CHARS - pass.length;
		return `Use at least ${MIN_RECOVERY_PASSPHRASE_CHARS} characters — ${short} to go.`;
	}
	if (confirm.length > 0 && pass !== confirm) return 'The two passphrases don’t match.';
	return null;
}

/** Whether the export may be attempted at all (long enough AND confirmed). */
export function recoveryPassphraseOk(pass: string, confirm: string): boolean {
	return pass.length >= MIN_RECOVERY_PASSPHRASE_CHARS && pass === confirm;
}
