/**
 * Redundant-entry + accessible-authentication primitives (UX-A11Y-015, WCAG 3.3.7 / 3.3.8).
 *
 * Redundant entry (3.3.7): information a user already typed in the current flow must not be
 * re-requested. A `SessionEntryCache` remembers values by field key within the session so a later
 * form (e.g. the display name in a join flow) pre-fills from the earlier entry while staying
 * editable (UX-A11Y-015 AC1).
 *
 * Accessible authentication (3.3.8): no step may rely on a cognitive-function test (image CAPTCHA /
 * visual puzzle) as the SOLE way to proceed. `isAccessibleAuthMethod` encodes that rule for any
 * future join/sync auth surface; the local-first persona has no auth step (local-first exemption).
 *
 * Pure — no DOM, no storage primitives (session-scoped, in-memory) — so it never persists identity
 * and is unit-tested directly.
 */

/** A device/session-scoped cache of values the user has entered, keyed by a stable field id. */
export class SessionEntryCache {
	readonly #values = new Map<string, string>();

	/** Record a non-empty value the user entered for `field`. Empty values clear the memory. */
	remember(field: string, value: string): void {
		const trimmed = value.trim();
		if (trimmed) this.#values.set(field, value);
		else this.#values.delete(field);
	}

	/** The remembered value for `field`, or `undefined` if none was entered this session. */
	recall(field: string): string | undefined {
		return this.#values.get(field);
	}

	/**
	 * Resolve the value a field should display: keep a non-empty current value, otherwise fall back
	 * to what the user already entered this session (3.3.7 — do not re-request). Pre-filled values
	 * remain fully editable by the caller (it is just the initial value).
	 */
	prefill(field: string, currentValue = ''): string {
		if (currentValue.trim()) return currentValue;
		return this.#values.get(field) ?? '';
	}

	has(field: string): boolean {
		return this.#values.has(field);
	}

	clear(): void {
		this.#values.clear();
	}
}

/** Authentication method kinds a join/sync flow might offer. */
export type AuthMethod =
	| 'link' // emailed / shared magic link
	| 'passkey' // WebAuthn
	| 'audio-captcha' // CAPTCHA with an audio alternative
	| 'image-captcha' // image-only CAPTCHA / visual puzzle (cognitive test)
	| 'recognize-objects'; // "select all images with…" cognitive test

const COGNITIVE_FUNCTION_TESTS: ReadonlySet<AuthMethod> = new Set([
	'image-captcha',
	'recognize-objects',
]);

/**
 * WCAG 3.3.8: an authentication step must NOT depend on a cognitive-function test as its only
 * option. Returns true when the offered methods include at least one non-cognitive path (link,
 * passkey, audio alternative). An empty set (no auth — local-first) is accessible by definition.
 */
export function isAccessibleAuthMethod(methods: readonly AuthMethod[]): boolean {
	if (methods.length === 0) return true; // local-first exemption: no auth step
	return methods.some((method) => !COGNITIVE_FUNCTION_TESTS.has(method));
}
