/**
 * Lazy SRD spell lookup for the spell-detail AUTO-FILL affordance: when an added/edited spell's
 * name matches the bundled SRD, the UI offers to fill its detail fields — the user always
 * confirms, the fill never happens silently. The ~350KB `assets/srd/spells.json` is loaded via a
 * dynamic `import()` so it stays a separate chunk, fetched only when a lookup is first needed.
 */

export interface SrdSpellEntry {
	key: string;
	name: string;
	level: number;
	school: string;
	castingTime: string;
	range: string;
	components: string;
	duration: string;
	concentration?: boolean;
	ritual?: boolean;
	classes: string[];
	desc: string;
	higherLevel?: string;
}

let indexPromise: Promise<Map<string, SrdSpellEntry>> | null = null;

function loadIndex(): Promise<Map<string, SrdSpellEntry>> {
	if (!indexPromise) {
		indexPromise = import('../../assets/srd/spells.json').then((mod) => {
			const entries = (mod.default as { entries: SrdSpellEntry[] }).entries;
			return new Map(entries.map((e) => [e.name.trim().toLowerCase(), e]));
		});
	}
	return indexPromise;
}

/** Case-insensitive SRD lookup by spell name. Null when the SRD has no such spell. */
export async function findSrdSpell(name: string): Promise<SrdSpellEntry | null> {
	const key = name.trim().toLowerCase();
	if (!key) return null;
	return (await loadIndex()).get(key) ?? null;
}

/** A one-line human summary for the confirm affordance. */
export function srdSpellSummary(s: SrdSpellEntry): string {
	const level = s.level === 0 ? `${s.school} cantrip` : `level ${s.level} ${s.school.toLowerCase()}`;
	return [level, s.castingTime, s.range, s.components, s.duration].filter(Boolean).join(' · ');
}

/** The `character.set-spell` detail fields from an SRD entry (only non-empty ones — the core
 *  schema requires min-length-1 strings when present). */
export function srdSpellDetailFields(s: SrdSpellEntry): {
	castingTime?: string;
	range?: string;
	components?: string;
	duration?: string;
	school?: string;
} {
	return {
		...(s.castingTime ? { castingTime: s.castingTime } : {}),
		...(s.range ? { range: s.range } : {}),
		...(s.components ? { components: s.components } : {}),
		...(s.duration ? { duration: s.duration } : {}),
		...(s.school ? { school: s.school } : {}),
	};
}
