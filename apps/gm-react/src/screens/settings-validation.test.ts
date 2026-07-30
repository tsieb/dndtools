import { describe, expect, it } from 'vitest';
import { MIN_RECOVERY_PASSPHRASE_CHARS } from '@dndtools/core';
import { recoveryPassphraseIssue, recoveryPassphraseOk } from './settings-validation';

// The recovery-key export panel only renders for a signed-in cloud account, so the e2e suite can
// never reach it. Before this, a too-short or MISMATCHED passphrase was expressed solely as an inert
// Export button — and because both fields are `type="password"`, a mismatch is invisible on screen.
// That is WCAG 3.3.1 (error identification) with a very high cost of being wrong: the user walks away
// believing they hold a working recovery key.
describe('recovery-key passphrase validation', () => {
	const long = 'a'.repeat(MIN_RECOVERY_PASSPHRASE_CHARS);

	it('says nothing while either field is still empty', () => {
		expect(recoveryPassphraseIssue('', '')).toBeNull();
		expect(recoveryPassphraseIssue(long, '')).toBeNull();
	});

	it('identifies a too-short passphrase and counts the remaining characters', () => {
		const issue = recoveryPassphraseIssue('a'.repeat(MIN_RECOVERY_PASSPHRASE_CHARS - 3), '');
		expect(issue).toContain(String(MIN_RECOVERY_PASSPHRASE_CHARS));
		expect(issue).toContain('3 to go');
	});

	it('identifies a mismatch — the failure the two password fields hide', () => {
		expect(recoveryPassphraseIssue(long, `${long}x`)).toBe('The two passphrases don’t match.');
	});

	it('prefers the length complaint over the mismatch complaint', () => {
		// Both are true here; reporting "too short" first is the actionable one, because fixing the
		// length necessarily means retyping the confirmation anyway.
		expect(recoveryPassphraseIssue('ab', 'zz')).toContain('at least');
	});

	it('clears once the two match at full length', () => {
		expect(recoveryPassphraseIssue(long, long)).toBeNull();
	});

	it('gates the export on length AND confirmation together', () => {
		expect(recoveryPassphraseOk(long, long)).toBe(true);
		expect(recoveryPassphraseOk(long, `${long}x`)).toBe(false);
		expect(recoveryPassphraseOk('ab', 'ab')).toBe(false);
		expect(recoveryPassphraseOk('', '')).toBe(false);
	});

	it('never leaves the button inert without a stated reason once both fields are filled', () => {
		// The invariant the panel relies on: whenever export is blocked and the user has typed into
		// both fields, `recoveryPassphraseIssue` has something to say.
		for (const [a, b] of [
			['ab', 'ab'],
			['ab', 'cd'],
			[long, `${long}!`],
		]) {
			expect(recoveryPassphraseOk(a, b)).toBe(false);
			expect(recoveryPassphraseIssue(a, b)).not.toBeNull();
		}
	});
});
