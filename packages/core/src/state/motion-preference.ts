/**
 * A11Y-005 — the SINGLE resolved motion preference state.
 *
 * All animated surfaces — map transitions, dice effects, audio visuals, reveal effects, and focus
 * changes — SHALL consume this one resolved state. No surface reads `prefers-reduced-motion`
 * directly; the platform layer probes the OS preference once (Contract 1 / PLAT-006) and this
 * resolver maps the (OS preference, user override) pair to a deterministic output that the shell
 * emits to the document as the `data-motion` token. Every animated surface inherits the token via
 * CSS instead of each making its own media-query or preference decision.
 *
 * PRECEDENCE (documented, tested in a11y-005-motion-preference.test.ts):
 *
 *   1. User override `'no-motion'`     → always `'none'`    (full motion suppression; user wins).
 *   2. User override `'reduce'`        → always `'reduced'` (user explicitly requests reduced).
 *   3. User `'no-preference'` + OS reduce true  → `'reduced'`
 *      (OS setting takes effect when the user has not expressed an in-app preference — AC1).
 *   4. User `'no-preference'` + OS reduce false → `'full'`  (no restriction).
 *
 * AC1 case: OS reduced motion ENABLED + user override NO-PREFERENCE → `'reduced'`.
 *
 * The resolver is PURE + DETERMINISTIC: identical (osReducedMotion, override) pairs always yield
 * the same level, making it testable without a browser and reproducible on every device. The shell
 * owns the IMPURE work (calling `matchMedia`, listening for OS-preference changes, emitting the
 * document token); this module only encodes the policy.
 */

/**
 * The explicit in-app user motion override (A11Y-005). A user who has not changed anything is
 * `'no-preference'` (the OS preference then governs). `'reduce'` explicitly requests reduced
 * motion regardless of the OS setting; `'no-motion'` requests all animations be removed entirely.
 * This is a device-local preference — it changes what THIS device renders and never syncs as
 * authoritative session state.
 */
export type MotionOverride = 'no-preference' | 'reduce' | 'no-motion';

/**
 * The resolved motion level emitted as the document-level `data-motion` token. CSS surfaces
 * consume `[data-motion="reduced"]` / `[data-motion="none"]` selectors to replace animated effects
 * with reduced or instant transitions (A11Y-005 AC2).
 *
 *   - `'full'`    — animations/transitions run at full fidelity.
 *   - `'reduced'` — animated effects are replaced by shorter or instant transitions.
 *   - `'none'`    — all animations are removed; changes are instant.
 */
export type ResolvedMotionLevel = 'full' | 'reduced' | 'none';

/** All valid motion override values (closed set). */
export const MOTION_OVERRIDES: readonly MotionOverride[] = Object.freeze([
	'no-preference',
	'reduce',
	'no-motion',
]);

/** True when `value` is a declared motion override. Unknown values default to `'no-preference'`. */
export function isMotionOverride(value: unknown): value is MotionOverride {
	return typeof value === 'string' && (MOTION_OVERRIDES as readonly string[]).includes(value);
}

/**
 * A11Y-005 — resolve the SINGLE application motion preference from the OS `prefers-reduced-motion`
 * state and the user's explicit in-app override. The precedence is documented above.
 *
 * Key acceptance-criteria case:
 *   - `osReducedMotion = true`, `override = 'no-preference'` → `'reduced'`
 *     (OS preference applies because the user has not overridden it in-app).
 *
 * Fail closed: an absent/unknown override is treated as `'no-preference'` so that a deliberate
 * in-app choice is required to grant `'full'` motion against a reduced-motion OS setting. Pure.
 */
export function resolveMotionPreference(
	osReducedMotion: boolean,
	override: MotionOverride = 'no-preference',
): ResolvedMotionLevel {
	// (1-2) Explicit user override is the highest-priority signal.
	if (override === 'no-motion') return 'none';
	if (override === 'reduce') return 'reduced';
	// (3-4) No explicit user preference: OS setting is the authority.
	return osReducedMotion ? 'reduced' : 'full';
}
