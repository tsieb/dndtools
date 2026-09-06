import { MIN_RECOVERY_PASSPHRASE_CHARS } from '@dndtools/core';
import type { MessageKey } from '../i18n';

/** A blocked export, as a catalog key plus the numbers the message interpolates. The rule is a
 * pure function, so it names the message rather than rendering it — only a component knows the
 * active locale. */
export type PassphraseIssue = { key: MessageKey; values?: Record<string, number> };

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
export function recoveryPassphraseIssue(pass: string, confirm: string): PassphraseIssue | null {
	if (pass.length > 0 && pass.length < MIN_RECOVERY_PASSPHRASE_CHARS) {
		return {
			key: 'settings.recovery.tooShort',
			values: {
				min: MIN_RECOVERY_PASSPHRASE_CHARS,
				remaining: MIN_RECOVERY_PASSPHRASE_CHARS - pass.length,
			},
		};
	}
	if (confirm.length > 0 && pass !== confirm) return { key: 'settings.recovery.mismatch' };
	return null;
}

/** Whether the export may be attempted at all (long enough AND confirmed). */
export function recoveryPassphraseOk(pass: string, confirm: string): boolean {
	return pass.length >= MIN_RECOVERY_PASSPHRASE_CHARS && pass === confirm;
}

/** The themes the High-contrast switch can toggle back to. */
const RESTORABLE_THEMES = new Set(['tavern', 'parchment']);

/**
 * The theme the High-contrast switch should apply next, given the theme in effect and the one the
 * user was on before they last turned high contrast ON.
 *
 * Turning the switch off used to hard-code `'tavern'`, so a Parchment reader who tried high contrast
 * for one minute had their theme preference silently destroyed with no way to notice — the switch
 * looks like a reversible toggle and was not one. `previous` is only trusted when it names a real
 * non-high-contrast theme, so a corrupted or absent value still lands somewhere valid.
 */
export function nextHighContrastTheme(current: string, previous: string | null): string {
	if (current !== 'high-contrast') return 'high-contrast';
	return previous && RESTORABLE_THEMES.has(previous) ? previous : 'tavern';
}
