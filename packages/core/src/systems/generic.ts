/**
 * RC-SYS-1.2 — the built-in Generic/narrative `SystemPackage`.
 *
 * The counterweight to 5e: a table that runs on fiction rather than arithmetic. No attributes, no
 * levels, no turn order — health and stress, four broad conditions, a pool of d6s, and advancement
 * that happens when the story says so. It exists so the interface has to survive a system with
 * almost nothing in it, which is the honest test of whether the SystemPackage model actually
 * decouples the app from D&D.
 *
 * A table that does want a little structure can turn on three APPROACHES (force, finesse, focus) via
 * `createGenericSystemPackage({ approaches: true })`. They are attributes with no derivation: a
 * pool system counts dice, it does not add a modifier.
 */
import type { SystemAttribute, SystemPackage, SystemSkill } from '../state/system-package';

/** The id of the built-in Generic/narrative package. */
export const GENERIC_SYSTEM_PACKAGE_ID = 'builtin:generic' as const;

/**
 * The optional three approaches. Off by default: the plain Generic package has no attributes at
 * all, which is the case the rest of the interface most needs to handle.
 */
export const GENERIC_APPROACHES: readonly SystemAttribute[] = Object.freeze([
	Object.freeze({
		key: 'force',
		label: 'Force',
		abbreviation: 'FRC',
		derivation: Object.freeze({ kind: 'none' as const }),
	}),
	Object.freeze({
		key: 'finesse',
		label: 'Finesse',
		abbreviation: 'FIN',
		derivation: Object.freeze({ kind: 'none' as const }),
	}),
	Object.freeze({
		key: 'focus',
		label: 'Focus',
		abbreviation: 'FOC',
		derivation: Object.freeze({ kind: 'none' as const }),
	}),
]) as readonly SystemAttribute[];

/** One skill per approach, offered only when approaches are on so a skill always has its attribute. */
const APPROACH_SKILLS: readonly SystemSkill[] = Object.freeze([
	Object.freeze({ key: 'overcome', label: 'Overcome', attribute: 'force' }),
	Object.freeze({ key: 'manoeuvre', label: 'Manoeuvre', attribute: 'finesse' }),
	Object.freeze({ key: 'discern', label: 'Discern', attribute: 'focus' }),
]) as readonly SystemSkill[];

/** How the Generic package is built. */
export interface GenericSystemPackageOptions {
	/** Turn on the three approaches and their skills. Default `false` — no attributes at all. */
	approaches?: boolean;
}

/**
 * Build the Generic/narrative package. Pure: returns a fresh, fully-populated package every call, so
 * a caller can hand it straight to `system.fork` without cloning first.
 */
export function createGenericSystemPackage(
	options: GenericSystemPackageOptions = {},
): SystemPackage {
	const approaches = options.approaches === true;
	return {
		id: GENERIC_SYSTEM_PACKAGE_ID,
		version: '1.0.0',
		displayName: 'Generic',
		summary:
			'A light narrative system: health and stress, a pool of d6s, no levels and no turn order.',
		vocabulary: {
			gameMaster: 'GM',
			player: 'Player',
			character: 'Character',
			ability: 'Ability',
			abilityPlural: 'Abilities',
			levelUpVerb: 'Advance',
			levelNoun: 'Milestone',
			hitPoints: 'Health',
			session: 'Session',
			campaign: 'Story',
		},
		attributes: approaches
			? GENERIC_APPROACHES.map((a) => ({ ...a, derivation: { ...a.derivation } }))
			: [],
		resources: [
			{
				key: 'hp',
				label: 'Health',
				kind: 'pool',
				maxFormula: null,
				recovery: 'long',
				diceNotation: null,
			},
			{
				key: 'stress',
				label: 'Stress',
				kind: 'track',
				maxFormula: '6',
				recovery: 'scene',
				diceNotation: null,
			},
		],
		conditions: [
			{
				key: 'hindered',
				label: 'Hindered',
				icon: 'cond-restrained',
				severity: 'major',
				defaultDuration: 'scene',
				defaultRounds: null,
				maxStacks: null,
			},
			{
				key: 'afraid',
				label: 'Afraid',
				icon: 'cond-frightened',
				severity: 'major',
				defaultDuration: 'scene',
				defaultRounds: null,
				maxStacks: null,
			},
			{
				key: 'hidden',
				label: 'Hidden',
				icon: 'cond-invisible',
				severity: 'minor',
				defaultDuration: 'until-removed',
				defaultRounds: null,
				maxStacks: null,
			},
			{
				key: 'inspired',
				label: 'Inspired',
				icon: 'cond-blessed',
				severity: 'boon',
				defaultDuration: 'scene',
				defaultRounds: null,
				maxStacks: null,
			},
		],
		dice: {
			model: 'dice-pool',
			notation: '1d6',
			advantage: 'extra-die',
			successThreshold: 4,
			crit: { naturalHigh: 6, naturalLow: null, effect: 'extra-effect' },
		},
		turnModel: { kind: 'none' },
		creatureSchema: [
			{ key: 'name', label: 'Name', type: 'string', required: true, options: null },
			{ key: 'concept', label: 'Concept', type: 'string', required: false, options: null },
			{ key: 'hp', label: 'Health', type: 'number', required: false, options: null },
			{ key: 'notes', label: 'Notes', type: 'text', required: false, options: null },
		],
		advancement: { model: 'milestone', levelCap: null, xpThresholds: [] },
		skills: approaches ? APPROACH_SKILLS.map((s) => ({ ...s })) : [],
		derived: [],
	};
}

/** The built-in Generic/narrative package, approaches off. */
export const GENERIC_SYSTEM_PACKAGE: SystemPackage = Object.freeze(
	createGenericSystemPackage(),
) as SystemPackage;
