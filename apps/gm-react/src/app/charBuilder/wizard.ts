/**
 * The wizard's shared state bag.
 *
 * The from-scratch wizard is one controlled form spread over six steps, so every step needs a slice
 * of the same state. Rather than thread three dozen individual props through each step component,
 * `index.tsx` builds one `Wizard` object and hands it to the step it is showing — the values and
 * setters are exactly the locals the single-file `CharBuilder` used before RC-STB-2.4 split it.
 */
import type { Dispatch, SetStateAction } from 'react';
import type { Actor, validateDraftStep } from '@dndtools/core';
import type {
	AbilityKey,
	AttackRow,
	BuilderBackground,
	BuilderClass,
	BuilderRace,
	CharKind,
	ScoreMethod,
} from './data';

export interface Wizard {
	isPhone: boolean;
	/** `kind === 'pc'` — the guided-draft path, which the core constrains far more tightly. */
	isPc: boolean;
	players: Actor[];

	kind: CharKind;
	setKind: Dispatch<SetStateAction<CharKind>>;
	name: string;
	setName: Dispatch<SetStateAction<string>>;
	align: string;
	setAlign: Dispatch<SetStateAction<string>>;
	grad: number;
	setGrad: Dispatch<SetStateAction<number>>;
	race: string;
	setRace: Dispatch<SetStateAction<string>>;
	/** The owner that will actually be used (falls back to the first player). */
	ownerId: string;
	setOwner: Dispatch<SetStateAction<string>>;

	setCls: Dispatch<SetStateAction<string>>;
	subclass: string;
	setSubclass: Dispatch<SetStateAction<string>>;
	level: number;
	setLevel: Dispatch<SetStateAction<number>>;
	setBackground: Dispatch<SetStateAction<string>>;
	/** The effective (legal-for-this-kind) class / background picks and their table rows. */
	clsId: string;
	bgId: string;
	clsChoices: BuilderClass[];
	bgChoices: BuilderBackground[];
	raceObj: BuilderRace;
	clsObj: BuilderClass;
	bgObj: BuilderBackground;

	method: ScoreMethod;
	setMethod: Dispatch<SetStateAction<ScoreMethod>>;
	scores: Record<AbilityKey, number>;
	assign: Record<AbilityKey, string>;
	setAssign: Dispatch<SetStateAction<Record<AbilityKey, string>>>;
	remainingArray: (forKey: AbilityKey) => number[];
	pointsLeft: number;
	scoreMin: number;
	scoreMax: number;
	setScore: (k: AbilityKey, v: number) => void;
	raiseBlocked: (k: AbilityKey) => boolean;
	effScores: Record<AbilityKey, number>;
	abilityValidation: ReturnType<typeof validateDraftStep> | null;
	standardIncomplete: boolean;

	ac: number;
	setAc: Dispatch<SetStateAction<number>>;
	hp: number;
	setHp: Dispatch<SetStateAction<number>>;
	speed: number;
	setSpeed: Dispatch<SetStateAction<number>>;
	attacks: AttackRow[];
	setAttacks: Dispatch<SetStateAction<AttackRow[]>>;

	bio: string;
	setBio: Dispatch<SetStateAction<string>>;
	dmNotes: string;
	setDmNotes: Dispatch<SetStateAction<string>>;
	vis: 'players' | 'dm-only';
	setVis: Dispatch<SetStateAction<'players' | 'dm-only'>>;

	subLine: string;
	error: string | null;
}
