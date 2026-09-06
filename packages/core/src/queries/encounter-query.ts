import { hasDmAuthority } from '../state/permission-state';
import type { PermissionState } from '../state/permission-state';
import { getActor } from '../state/permission-state';
import {
	computeEncounterChallenge,
	type Encounter,
	type EncounterChallenge,
	type EncounterCombatantSelection,
	type EncounterLootItem,
	type EncounterSpecialAction,
	type EncounterState,
	type SessionLogLink,
} from '../state/encounter';
import {
	activeSystemPackage,
	type SystemPackage,
	type SystemsState,
} from '../state/system-package';

/**
 * SES-006 — THE single actor-filtered ENCOUNTER read model.
 *
 * Encounters are DM-authored prep. The DM sees the full encounter with its computed CHALLENGE
 * GUIDANCE; players/observers do NOT see DM prep (it is the v2 analogue of the `encounter` Vault
 * Object subtype's `dm-only` default visibility — CONTENT-013). This is the only sanctioned read
 * path: the data layer decides visibility BEFORE returning anything (Architecture Contract 3), so a
 * non-DM viewer receives an EMPTY encounter list — encounter prep, combatant rosters, terrain notes,
 * loot, and session-log link targets never leak.
 *
 * Pure + deterministic. No GUI, no storage. Challenge guidance is recomputed (not stored) so it
 * always reflects the current combatant selection + party — and is `null` when the caller passes a
 * `systems` state whose active package declares no challenge budget (RC-SYS-2.5).
 */

/** A read-only encounter view with its computed challenge guidance (DM-only). */
export interface EncounterView {
	id: string;
	title: string;
	combatants: EncounterCombatantSelection[];
	party: { size: number; averageLevel: number };
	terrainNotes: string;
	specialActions: EncounterSpecialAction[];
	loot: EncounterLootItem[];
	sessionLogLinks: SessionLogLink[];
	/**
	 * Deterministic CR / difficulty guidance computed from the current combatants + party, or `null`
	 * when the active system package declares no challenge/XP budget (RC-SYS-2.5).
	 */
	challenge: EncounterChallenge | null;
	createdAt: string;
	updatedAt: string;
	revision: number;
}

function toView(encounter: Encounter, pkg: SystemPackage | undefined): EncounterView {
	return {
		id: encounter.id,
		title: encounter.title,
		combatants: encounter.combatants.map((c) => ({ ...c })),
		party: { ...encounter.party },
		terrainNotes: encounter.terrainNotes,
		specialActions: encounter.specialActions.map((a) => ({ ...a })),
		loot: encounter.loot.map((l) => ({ ...l })),
		sessionLogLinks: encounter.sessionLogLinks.map((link) => ({ ...link })),
		challenge: computeEncounterChallenge(encounter.combatants, encounter.party, pkg),
		createdAt: encounter.createdAt,
		updatedAt: encounter.updatedAt,
		revision: encounter.revision,
	};
}

/**
 * SES-006 — list encounters for the actor. The DM gets every encounter (in stable id order); a
 * non-DM actor gets an EMPTY list (encounter prep is DM-only — fail closed, no leak).
 */
export function listEncountersForActor(
	state: EncounterState,
	permissions: PermissionState,
	actorId: string,
	systems?: SystemsState,
): EncounterView[] {
	const actor = getActor(permissions, actorId);
	if (!hasDmAuthority(actor?.role)) return [];
	const pkg = systems ? activeSystemPackage(systems) : undefined;
	return Object.values(state.encounters)
		.sort((a, b) => a.id.localeCompare(b.id))
		.map((encounter) => toView(encounter, pkg));
}

/**
 * SES-006 — read ONE encounter for the actor, or `null` when it does not exist OR the actor is not the
 * DM (fail closed: a non-DM never sees encounter prep, and a missing/hidden encounter is
 * indistinguishable from not-found — no leak).
 */
export function getEncounterForActor(
	state: EncounterState,
	permissions: PermissionState,
	actorId: string,
	encounterId: string,
	systems?: SystemsState,
): EncounterView | null {
	const actor = getActor(permissions, actorId);
	if (!hasDmAuthority(actor?.role)) return null;
	const encounter = state.encounters[encounterId];
	if (!encounter) return null;
	return toView(encounter, systems ? activeSystemPackage(systems) : undefined);
}
