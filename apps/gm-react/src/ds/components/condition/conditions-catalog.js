/**
 * RC-SYS-2.3 — the design system's condition tables, in their own module so the badge and the
 * `SystemProvider` that overrides it can both read them without importing each other.
 */

/**
 * The DEFAULT condition catalog: canonical key → label, distinct Lucide glyph, and a semantic tone.
 * Tone drives the color role; the glyph is the redundant non-color cue (A11Y-011). Most conditions
 * are debilitating (`danger`); a few are beneficial (`good`) or neutral. `concentration` is amber
 * because it is fragile state the DM must watch, not a debuff.
 *
 * RC-SYS-2.3 — this table is now only the FALLBACK. The active system package's `conditions[]`
 * arrive through `SystemProvider` and win; this keeps rendering honest for a key the active package
 * does not declare (5e `concentration`/`blessed`/`cursed`, or a leftover from a system the campaign
 * has switched away from). `CONDITIONS` remains exported under its old name for call sites that
 * only need "is this a condition key I recognise".
 */
export const DEFAULT_CONDITIONS = {
	blinded: { label: 'Blinded', icon: 'cond-blinded', tone: 'danger' },
	charmed: { label: 'Charmed', icon: 'cond-charmed', tone: 'warning' },
	deafened: { label: 'Deafened', icon: 'cond-deafened', tone: 'danger' },
	frightened: { label: 'Frightened', icon: 'cond-frightened', tone: 'danger' },
	grappled: { label: 'Grappled', icon: 'cond-grappled', tone: 'danger' },
	incapacitated: { label: 'Incapacitated', icon: 'cond-incapacitated', tone: 'danger' },
	invisible: { label: 'Invisible', icon: 'cond-invisible', tone: 'info' },
	paralyzed: { label: 'Paralyzed', icon: 'cond-paralyzed', tone: 'danger' },
	petrified: { label: 'Petrified', icon: 'cond-petrified', tone: 'danger' },
	poisoned: { label: 'Poisoned', icon: 'cond-poisoned', tone: 'danger' },
	prone: { label: 'Prone', icon: 'cond-prone', tone: 'warning' },
	restrained: { label: 'Restrained', icon: 'cond-restrained', tone: 'danger' },
	stunned: { label: 'Stunned', icon: 'cond-stunned', tone: 'danger' },
	unconscious: { label: 'Unconscious', icon: 'cond-unconscious', tone: 'danger' },
	exhaustion: { label: 'Exhaustion', icon: 'cond-exhaustion', tone: 'danger' },
	concentration: { label: 'Concentration', icon: 'cond-concentration', tone: 'warning' },
	blessed: { label: 'Blessed', icon: 'cond-blessed', tone: 'good' },
	cursed: { label: 'Cursed', icon: 'cond-cursed', tone: 'danger' },
};

/** Back-compatible alias for {@link DEFAULT_CONDITIONS}. */
export const CONDITIONS = DEFAULT_CONDITIONS;

/** Severity → the badge tone that carries it. `boon` is the only non-negative band. */
export const SEVERITY_TONE = {
	minor: 'warning',
	major: 'danger',
	severe: 'danger',
	boon: 'good',
};

/** Turn a package's `conditions[]` into the `{ key: { label, icon, tone } }` registry shape. Pure. */
export function conditionRegistry(conditions) {
	const registry = {};
	for (const c of conditions ?? []) {
		if (!c || !c.key) continue;
		registry[c.key] = {
			label: c.label || c.key,
			icon: c.icon || 'info',
			tone: SEVERITY_TONE[c.severity] || 'neutral',
		};
	}
	return registry;
}
