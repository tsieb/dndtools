import type { Actor, PermissionState } from '../state/permission-state';
import { getActor } from '../state/permission-state';
import { hasGrantedCapability } from '../permissions/grants';
import { CHARACTER_ENTITY_TYPE } from '../state/character-state';
import type {
	Combatant,
	CombatantResources,
	CombatLogEntry,
	CombatStatus,
	SessionCombatState,
} from '../state/combat-tracker';

/**
 * SES-002 — THE single actor-filtered COMBAT TRACKER read model.
 *
 * Combat is DM-run, but players/observers see the live tracker. This is the ONLY sanctioned read
 * path: visibility is decided in the data layer BEFORE anything is returned (Architecture Contract 3),
 * so a HIDDEN combatant's identity + stat-block data never leak to a non-DM viewer.
 *
 * Fail-closed hidden-combatant handling (SES-002 AC4):
 *
 *   - The DM sees every combatant, its stat-block preview, and its resources in full.
 *   - For a non-DM viewer a HIDDEN combatant is either OMITTED ENTIRELY (no name/stat/id/edge) when
 *     it has no DM-approved placeholder, or replaced by the DM-approved PLACEHOLDER name with its
 *     stat data and identity withheld. Either way the real name and stat block are never exposed.
 *   - The initiative ORDER returned to a non-DM viewer reflects only the combatants they may see, so
 *     the order itself does not reveal a hidden combatant's position by a gap.
 *
 * Pure + deterministic: a function of (combat state, permissions, actor) only. No GUI, no storage.
 */

/** The placeholder shown for a hidden combatant the viewer cannot fully see. */
export const HIDDEN_COMBATANT_NAME = 'Hidden combatant' as const;

/** A read-only stat-block preview projection. Hidden stat data is withheld for non-authorized viewers. */
export interface CombatantStatBlockView {
	ac: number | null;
	initiative: number | null;
	abilityScores: Record<string, number> | null;
	notes: string | null;
}

/** A read-only combatant resource view. */
export interface CombatantResourcesView {
	hp: number;
	maxHp: number;
	tempHp: number;
	conditions: string[];
	deathSaves: { successes: number; failures: number; stable: boolean };
	concentration: { effect: string | null };
}

/** A read-only combatant in the actor-filtered tracker view. */
export interface CombatantView {
	id: string;
	kind: Combatant['kind'];
	name: string;
	characterId: string | null;
	/** True when this row is a redacted placeholder for a combatant the viewer cannot fully see. */
	redacted: boolean;
	statBlock: CombatantStatBlockView;
	resources: CombatantResourcesView | null;
	hidden: boolean;
	isActive: boolean;
}

/** A read-only encounter-log entry view. */
export interface CombatLogEntryView {
	id: string;
	round: number;
	turn: number;
	kind: CombatLogEntry['kind'];
	label: string;
	combatantId: string | null;
	delta: number | null;
	at: string;
}

/** The actor-filtered combat tracker view. */
export interface CombatTrackerView {
	status: CombatStatus;
	encounterId: string | null;
	round: number;
	turn: number;
	/** The combatants in initiative order, already filtered/redacted for the actor. */
	combatants: CombatantView[];
	/** The active combatant's id (when visible to the actor), else null. */
	activeCombatantId: string | null;
	/** The encounter log, redacted: an entry naming a combatant the actor cannot see is omitted. */
	log: CombatLogEntryView[];
	/** DM-only: how many combatants were hidden/redacted from a non-DM viewer (0 for the DM). */
	hiddenCount: number;
	revision: number;
}

/** Whether the actor may fully see a combatant's identity + stat block (DM, or its combat-participant). */
function actorCanSeeCombatant(
	permissions: PermissionState,
	actor: Actor,
	combatant: Combatant,
): boolean {
	if (actor.role === 'dm') return true;
	if (!combatant.hidden) return true;
	// A hidden combatant that IS a character is visible to a player who is its combat-participant.
	if (combatant.kind === 'character' && combatant.characterId) {
		return hasGrantedCapability(
			permissions,
			actor,
			CHARACTER_ENTITY_TYPE,
			combatant.characterId,
			'combat-participant',
		);
	}
	return false;
}

function resourcesView(resources: CombatantResources): CombatantResourcesView {
	return {
		hp: resources.hp,
		maxHp: resources.maxHp,
		tempHp: resources.tempHp,
		conditions: [...resources.conditions],
		deathSaves: { ...resources.deathSaves },
		concentration: { effect: resources.concentration.effect },
	};
}

/**
 * SES-002 — build the actor-filtered combat tracker view. Hidden combatants are omitted or replaced
 * by a placeholder for non-DM viewers; the DM sees everything plus the hidden count.
 */
export function getCombatTrackerForActor(
	combat: SessionCombatState,
	permissions: PermissionState,
	actorId: string,
): CombatTrackerView {
	const actor = getActor(permissions, actorId);
	const isDm = actor?.role === 'dm';
	const activeId = combat.order[combat.turn] ?? null;

	const combatants: CombatantView[] = [];
	// DM-only metric: how many combatants are hidden from players (counted regardless of the DM's own
	// full visibility). For a non-DM viewer this stays 0 so the count never reveals a hidden combatant.
	let dmHiddenCount = 0;
	const visibleIds = new Set<string>();

	for (const id of combat.order) {
		const combatant = combat.combatants[id];
		if (!combatant) continue;
		if (combatant.hidden) dmHiddenCount += 1;
		const fullyVisible = actor ? actorCanSeeCombatant(permissions, actor, combatant) : false;
		if (fullyVisible) {
			visibleIds.add(id);
			combatants.push({
				id: combatant.id,
				kind: combatant.kind,
				name: combatant.name,
				characterId: combatant.characterId,
				redacted: false,
				statBlock: {
					ac: combatant.statBlock.ac,
					initiative: combatant.statBlock.initiative,
					abilityScores: combatant.statBlock.abilityScores
						? { ...combatant.statBlock.abilityScores }
						: null,
					notes: combatant.statBlock.notes,
				},
				resources: resourcesView(combatant.resources),
				hidden: combatant.hidden,
				isActive: combatant.id === activeId,
			});
			continue;
		}
		// A hidden combatant the actor cannot fully see.
		if (combatant.placeholder) {
			// A DM-approved placeholder ROW: identity + stat data withheld, position preserved.
			visibleIds.add(id);
			combatants.push({
				id: combatant.id,
				kind: combatant.kind,
				name: combatant.placeholder,
				characterId: null,
				redacted: true,
				statBlock: { ac: null, initiative: null, abilityScores: null, notes: null },
				resources: null,
				hidden: true,
				isActive: combatant.id === activeId,
			});
		}
		// Otherwise: omitted entirely (no row, no leak).
	}

	// The encounter log, redacted: an entry that names a combatant the actor cannot see is omitted so
	// the log does not reveal a hidden combatant by reference.
	const log: CombatLogEntryView[] = combat.log
		.filter((entry) => {
			if (isDm) return true;
			if (entry.combatantId === null) return true;
			return visibleIds.has(entry.combatantId);
		})
		.map((entry) => ({
			id: entry.id,
			round: entry.round,
			turn: entry.turn,
			kind: entry.kind,
			label: entry.label,
			combatantId: entry.combatantId,
			delta: entry.delta,
			at: entry.at,
		}));

	return {
		status: combat.status,
		encounterId: combat.encounterId,
		round: combat.round,
		turn: combat.turn,
		combatants,
		activeCombatantId: activeId && visibleIds.has(activeId) ? activeId : null,
		log,
		hiddenCount: isDm ? dmHiddenCount : 0,
		revision: combat.revision,
	};
}
