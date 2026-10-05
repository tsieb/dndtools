import type { ReactNode } from 'react';
import {
	advancementStateOf,
	checkAdvancementEligibility,
	computeEncumbrance,
	effectiveProficiencyBonus,
	getActiveSystemForActor,
	getCharacterForActor,
	getCharacterJournalForActor,
	hasDmAuthority,
	inventoryOf,
	passivePerception,
	resourcesOf,
	searchVaultForActor,
	type Actor,
	type AdvancementState,
	type CharacterInventory,
	type CharacterResources,
	type CharacterView,
	type CoreCommand,
	type CoreStateSlice,
	type EligibilityResult,
	type EncumbranceState,
	type JournalEntryView,
	type SearchHit,
} from '@dndtools/core';

/**
 * RC-CHR-6.2 — everything the sheet body reads about one character, resolved for one viewer. Every
 * route fills the same shape: the DM shell from its own core state ({@link buildSheetSubject}), the
 * companion from the view-model the host built for the joined player.
 */
export interface SheetSubject {
	id: string;
	view: CharacterView;
	level: number | null;
	resources: CharacterResources | null;
	/** Pure derived reads (after the visibility gate): effective proficiency bonus, passive perception. */
	profBonus: number | null;
	passive: number | null;
	inventory: CharacterInventory | null;
	encumbrance: EncumbranceState | null;
	advancement: AdvancementState | null;
	xpEligible: EligibilityResult | null;
	milestoneEligible: EligibilityResult | null;
	journal: JournalEntryView[];
	/** Notes and story entries that name this character, from the viewer's own search. */
	mentions: SearchHit[];
	/** The current audience and the players it may name — read only where the plan admits Sharing. */
	sharing: { visibility: string; sharedWith: string[]; players: Actor[] } | null;
}

/** A validation slot a refusal can be shown beside, instead of the frame's alert. */
export type SheetField = 'ac' | 'slots' | 'xp';

/**
 * How the body writes and speaks. The frame supplies it, so each route keeps its own status and
 * alert regions (one polite status per frame) and its own transport (a local dispatch or a command
 * request over the session).
 */
export interface SheetIO {
	/** One write; resolves false when refused, after the frame has said why. `okNote` is announced. */
	dispatch: (command: CoreCommand, okNote?: string) => Promise<boolean>;
	/** A refusal raised before any write: shown beside `field`'s control, else in the frame alert. */
	refuse: (text: string, field?: SheetField) => void;
	/** The refusal raised for `field`, rendered beside its control, or null. */
	fieldError: (field: SheetField) => ReactNode;
	/** Announce a change that needed no write of its own (e.g. a multi-write undo finishing). */
	announce: (text: string) => void;
	/** Mints ids for new rows (spells, homebrew resources). */
	newId: () => string;
}

/** The sheet subject for `characterId` as `actorId` reads it, or null when the actor may not see it. */
export function buildSheetSubject(
	state: CoreStateSlice,
	actorId: string,
	characterId: string,
): SheetSubject | null {
	// RC-CHR-1.1 — package-scoped reads: the view's resources are what the ACTIVE system declares.
	const activePackage = getActiveSystemForActor(
		state.systems,
		state.permissions,
		actorId,
	).activePackage;
	const view = getCharacterForActor(
		state.characters,
		state.permissions,
		actorId,
		characterId,
		activePackage,
	);
	if (!view) return null;
	// The raw record is read ONLY after the visibility gate above passed, so its resources,
	// inventory and advancement never reach an actor who may not see the character.
	const record = state.characters.characters[characterId];
	if (!record) return null;
	const advancement = advancementStateOf(record);
	const name = view.name.trim();
	const mentions = name
		? searchVaultForActor(state.content, state.maps, state.permissions, state.session, actorId, {
				query: name,
			})
				.hits.filter((h) => h.type === 'note' || h.type === 'object')
				.slice(0, 6)
		: [];
	return {
		id: characterId,
		view,
		level: advancement.level,
		resources: resourcesOf(record),
		profBonus: effectiveProficiencyBonus(record),
		passive: passivePerception(record),
		inventory: inventoryOf(record),
		encumbrance: computeEncumbrance(record),
		advancement,
		xpEligible: checkAdvancementEligibility(record, 'xp'),
		milestoneEligible: checkAdvancementEligibility(record, 'milestone'),
		journal:
			getCharacterJournalForActor(state.characters, state.permissions, actorId, characterId)
				?.entries ?? [],
		mentions,
		// Fail closed: only an actor with DM authority ever receives the audience list.
		sharing: hasDmAuthority(state.permissions.actors[actorId]?.role)
			? {
					visibility: record.visibility,
					sharedWith: [...record.sharedWith],
					players: Object.values(state.permissions.actors).filter((a) => a.role === 'player'),
				}
			: null,
	};
}
