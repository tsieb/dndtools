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
	/**
	 * True when the combatant's current HP is at or below half their maximum HP (and above 0).
	 * A11Y-007 AC2: this explicit boolean enables non-color state indicators for screen readers.
	 * Always false for redacted/hidden combatants whose resources are withheld.
	 */
	isBloodied: boolean;
	/**
	 * True when the combatant is concentrating on a spell or effect.
	 * A11Y-011 AC2: explicit boolean so renderers surface a non-color badge/aria cue for
	 * concentrating state rather than relying on color alone.
	 * Always false for redacted/hidden combatants whose resources are withheld.
	 */
	isConcentrating: boolean;
	/**
	 * True when the combatant's current HP is at or below 0 (down/dying) AND the DM has not chosen
	 * "No — keep at 0" for them (UX-SES-005 defeated confirmation). A combatant kept at 0 is DYING,
	 * not defeated — its death-save track is the active surface (UX-SES-007 AC3, see {@link isDying}).
	 * A11Y-011 AC2: explicit boolean so renderers surface a non-color badge/aria cue for
	 * defeated state rather than relying on color alone.
	 * Always false for redacted/hidden combatants whose resources are withheld.
	 */
	isDefeated: boolean;
	/**
	 * UX-SES-007 AC3 — true when the combatant is at 0 HP but NOT defeated (the DM chose "No — keep
	 * at 0"): the death-save success/failure track renders for this combatant. Always false for
	 * redacted/hidden combatants whose resources are withheld.
	 */
	isDying: boolean;
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
	/**
	 * Present when {@link kind} === `'roll'`: the session dice-history id for cross-referencing
	 * the full roll record. Null for all other entry kinds (SES-002 AC5).
	 */
	rollId: string | null;
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

/**
 * Whether the actor may fully see a combatant's identity + stat block (DM, or its combat-participant).
 * `now` (from `env.clock()`) MUST be passed so an EXPIRED combat-participant grant is inert — omitting
 * it lets a stale grant keep revealing a hidden combatant's identity/stats (PERM-004 fail closed).
 */
function actorCanSeeCombatant(
	permissions: PermissionState,
	actor: Actor,
	combatant: Combatant,
	now?: string,
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
			now,
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
	now?: string,
): CombatTrackerView {
	const actor = getActor(permissions, actorId);
	const isDm = actor?.role === 'dm';
	const activeId = combat.order[combat.turn] ?? null;

	const combatants: CombatantView[] = [];
	// DM-only metric: how many combatants are hidden from players (counted regardless of the DM's own
	// full visibility). For a non-DM viewer this stays 0 so the count never reveals a hidden combatant.
	let dmHiddenCount = 0;
	const visibleIds = new Set<string>();
	// The combatants the viewer may FULLY see (identity + stats). A placeholder row's id is in
	// `visibleIds` (its position is visible) but NOT here — log labels carry REAL NAMES, so an entry
	// about a placeholder-visible hidden combatant must still be withheld (NO-LEAK, UX-SES-008 AC2).
	const fullyVisibleIds = new Set<string>();

	for (const id of combat.order) {
		const combatant = combat.combatants[id];
		if (!combatant) continue;
		if (combatant.hidden) dmHiddenCount += 1;
		const fullyVisible = actor ? actorCanSeeCombatant(permissions, actor, combatant, now) : false;
		if (fullyVisible) {
			visibleIds.add(id);
			fullyVisibleIds.add(id);
			const res = resourcesView(combatant.resources);
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
				resources: res,
				hidden: combatant.hidden,
				isActive: combatant.id === activeId,
				// A11Y-007 AC2: explicit non-color state indicator for screen readers.
				isBloodied: res.hp > 0 && res.hp <= Math.floor(res.maxHp / 2),
				// A11Y-011 AC2: explicit non-color state indicators for concentrating and defeated.
				isConcentrating: !!res.concentration.effect,
				// UX-SES-005 — "No — keep at 0" suppresses the defeated treatment (dying instead).
				isDefeated: res.hp <= 0 && !combatant.resources.notDefeated,
				// UX-SES-007 AC3 — at 0 HP and explicitly NOT defeated: the death-save track renders.
				isDying: res.hp <= 0 && combatant.resources.notDefeated === true,
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
				isBloodied: false, // stat data withheld; no derived status exposed
				isConcentrating: false, // stat data withheld; no derived status exposed
				isDefeated: false, // stat data withheld; no derived status exposed
				isDying: false, // stat data withheld; no derived status exposed
			});
		}
		// Otherwise: omitted entirely (no row, no leak).
	}

	// The encounter log, redacted: an entry that names a combatant the actor cannot see is omitted,
	// and a 'roll' entry is filtered by its recorded visibility (fail closed to dm-only when absent)
	// so a hidden roll never leaks to players or observers (SES-002 AC5).
	const log: CombatLogEntryView[] = combat.log
		.filter((entry) => {
			if (isDm) return true;
			// Roll entries: apply roll-visibility semantics analogous to dice-history filtering.
			if (entry.kind === 'roll') {
				const vis = entry.rollVisibility ?? 'dm-only'; // fail closed
				if (vis === 'dm-only') return false;
				if (vis === 'shared') {
					// The rolling actor always sees their own entry; listed shared participants see it.
					return (
						entry.actorActorId === actorId ||
						(entry.rollSharedWith ?? []).includes(actorId)
					);
				}
				// session-visible: all participants see it.
				return true;
			}
			// Non-roll entries: omit when the entry names a combatant the actor cannot FULLY see.
			// A placeholder-visible hidden combatant is excluded too: log labels carry the REAL name
			// (e.g. "X is now hidden from players"), so they must never reach a non-DM (NO-LEAK).
			if (entry.combatantId === null) return true;
			return fullyVisibleIds.has(entry.combatantId);
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
			rollId: entry.rollId ?? null,
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
