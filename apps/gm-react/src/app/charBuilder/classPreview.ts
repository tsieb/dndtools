/**
 * CharBuilder class preview — what the ACTIVE system package gives the chosen class at the chosen
 * level (RC-CHR-5.2).
 *
 * The package declares its class resources (rage, ki, channel divinity, …) with a max formula over
 * `level`, but not which class owns which resource — that link lives here, as builder reference
 * data like the rest of `data.ts`. Every number shown is the PACKAGE's own formula evaluated, so a
 * campaign on a package that drops or reshapes a resource previews what it will actually track; a
 * resource the package doesn't declare is simply not listed.
 */
import { evaluateFormula, type SystemPackage, type SystemRecovery } from '@dndtools/core';
import type { AbilityKey } from './data';

interface ClassFeatureRef {
	resource: string;
	/** The ability whose modifier the formula's `modifier` identifier reads. */
	ability?: AbilityKey;
	/** Granted only by this subclass. */
	subclass?: string;
}

const CLASS_FEATURES: Record<string, readonly ClassFeatureRef[]> = {
	barbarian: [{ resource: 'rage' }],
	bard: [{ resource: 'bardicInspiration', ability: 'CHA' }],
	cleric: [{ resource: 'channelDivinity' }],
	druid: [{ resource: 'wildShape' }],
	fighter: [
		{ resource: 'secondWind' },
		{ resource: 'actionSurge' },
		{ resource: 'superiorityDice', subclass: 'Battle Master' },
	],
	monk: [{ resource: 'ki' }],
	paladin: [{ resource: 'layOnHands' }, { resource: 'channelDivinity' }],
	sorcerer: [{ resource: 'sorceryPoints' }],
};

/** The spellcasting ability of each class that casts. */
const CLASS_SPELLCASTING: Record<string, AbilityKey> = {
	bard: 'CHA',
	cleric: 'WIS',
	druid: 'WIS',
	paladin: 'CHA',
	ranger: 'WIS',
	sorcerer: 'CHA',
	warlock: 'CHA',
	wizard: 'INT',
};

export interface ClassFeaturePreview {
	key: string;
	label: string;
	recovery: SystemRecovery;
	diceNotation: string | null;
	/** The maximum at the previewed level; null when the package leaves it to the sheet. */
	value: number | null;
	/** The first level it comes online, when it hasn't yet at the previewed level. */
	unlocksAt: number | null;
	/** The subclass it needs, while a different (or no) subclass is picked. */
	needsSubclass: string | null;
}

export interface ClassPreview {
	features: ClassFeaturePreview[];
	/** The class's spellcasting ability, when it casts and the package tracks spell slots. */
	spellcasting: AbilityKey | null;
}

export function previewClass(
	pkg: Pick<SystemPackage, 'resources' | 'advancement'>,
	classId: string,
	opts: { level: number; scores: Record<AbilityKey, number>; subclass: string },
): ClassPreview {
	const cap = pkg.advancement.levelCap ?? 20;
	const features: ClassFeaturePreview[] = [];
	for (const ref of CLASS_FEATURES[classId] ?? []) {
		const resource = pkg.resources.find((r) => r.key === ref.resource);
		if (!resource) continue;
		const modifier = ref.ability ? Math.floor((opts.scores[ref.ability] - 10) / 2) : 0;
		const maxAt = (level: number): number | null => {
			if (resource.maxFormula === null) return null;
			const result = evaluateFormula(resource.maxFormula, { level, modifier });
			return result.ok ? result.value : null;
		};
		const value = maxAt(opts.level);
		let unlocksAt: number | null = null;
		if (value !== null && value <= 0) {
			for (let level = opts.level + 1; level <= cap; level += 1) {
				if ((maxAt(level) ?? 0) > 0) {
					unlocksAt = level;
					break;
				}
			}
		}
		features.push({
			key: resource.key,
			label: resource.label,
			recovery: resource.recovery,
			diceNotation: resource.diceNotation,
			value,
			unlocksAt,
			needsSubclass: ref.subclass && ref.subclass !== opts.subclass ? ref.subclass : null,
		});
	}
	const tracksSlots = pkg.resources.some((r) => r.kind === 'slots');
	return {
		features,
		spellcasting: tracksSlots ? (CLASS_SPELLCASTING[classId] ?? null) : null,
	};
}
