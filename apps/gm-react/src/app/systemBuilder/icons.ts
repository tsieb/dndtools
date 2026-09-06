import { ICON_REGISTRY } from '../../ds';

/**
 * The icon vocabulary a condition may pick from (RC-SYS-3.3).
 *
 * A package's `icon` is a free string as far as the schema is concerned — `Icon` falls back to
 * rendering the name as a Lucide glyph — so an authoring form with a text box would let a DM save a
 * condition that draws nothing. The picker is therefore restricted to names the registry actually
 * knows (`docs/reference/ICON_VOCABULARY.md`, guardrail 5: one icon family, reached through the
 * semantic vocabulary): every `cond-*` glyph, which is the set designed to read apart in grayscale,
 * plus the handful of status glyphs a non-5e condition tends to want.
 */

const EXTRA_CONDITION_ICONS = [
	'shield',
	'heart',
	'flame',
	'sparkle',
	'hourglass',
	'warning',
	'eye',
	'hidden',
	'lock',
	'sword',
	'wand',
] as const;

/** Every icon name a condition may carry, in a stable order. */
export const CONDITION_ICON_NAMES: readonly string[] = Object.freeze([
	...Object.keys(ICON_REGISTRY as Record<string, string>)
		.filter((name) => name.startsWith('cond-'))
		.sort(),
	...EXTRA_CONDITION_ICONS.filter((name) => name in (ICON_REGISTRY as Record<string, string>)),
]);

/** Whether a package's condition icon is one the picker can round-trip. */
export function isKnownConditionIcon(name: string): boolean {
	return CONDITION_ICON_NAMES.includes(name);
}
