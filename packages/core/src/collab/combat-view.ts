import { hasDmAuthority } from '../state/permission-state';
import type { ActorId } from '../state/ids';
import type { Actor, PermissionState } from '../state/permission-state';
import { getActor } from '../state/permission-state';
import { hasGrantedCapability } from '../permissions/grants';
import { CHARACTER_ENTITY_TYPE } from '../state/character-state';
import type { Combatant, SessionCombatState } from '../state/combat-tracker';
import { COMBAT_ENTITY_TYPE } from '../state/combat-tracker';
import {
	getCombatTrackerForActor,
	type CombatTrackerView,
} from '../queries/combat-tracker-view';
import type { SyncOperation } from '../sync/operation-log';

/**
 * COLLAB-006 — the SHARED COMBAT VIEW participants see ACCORDING TO ROLE AND GRANTS (Architecture
 * Contract 3 Role/Visibility/Permission; Character capability sets). Combat is DM-run; players and
 * observers VIEW the live tracker. This module is the COLLAB layer ON TOP of the SES-002
 * `getCombatTrackerForActor` actor-filtered read — it does NOT re-implement combatant filtering. It adds
 * the two things COLLAB-006 requires beyond the SES tracker:
 *
 *   1. PERMITTED INTERACTION CONTROLS, role/grant-gated and FAIL CLOSED. Each viewer is told exactly which
 *      combat controls they may use (advance turn, edit a combatant's resources, end combat). A control is
 *      enabled ONLY when the viewer's role/grants permit the underlying command — mirroring the combat
 *      command authority (`combat.ts`): DM runs combat; a player may edit a combatant ONLY if it is a
 *      character they hold `combat-participant` on; observers get nothing. The control set is the SAME
 *      authority the command reducer enforces, surfaced for the GUI — never a wider GUI-only affordance.
 *   2. OFFLINE / STALE state (COLLAB-006 AC3). When the participant is viewing CACHED combat (remote
 *      delivery unavailable), the view is marked STALE and every control that requires LIVE AUTHORITY is
 *      DISABLED, so a stale client cannot submit a combat command it no longer has live authority for.
 *
 * The SES read already guarantees a hidden combatant's identity/stat data NEVER leak to a non-DM viewer
 * (omitted or DM-approved placeholder). COLLAB-006 reinforces this at the SOURCE via the COLLAB-009
 * replication filter (see {@link assertCombatStreamCarriesNoHiddenCombatant}) so a participant never even
 * RECEIVES a hidden combatant's ops, not merely hides them in the UI.
 *
 * Pure + deterministic: a function of (combat, permissions, actor[, liveness]) only. No GUI, no storage.
 */

/** Liveness of the combat data the participant is viewing (COLLAB-006 AC3). */
export type CombatViewLiveness =
	| 'live' // connected to the authoritative session; controls requiring live authority are allowed
	| 'stale'; // viewing cached combat (offline / catch-up pending); live-authority controls are disabled

/**
 * The interaction controls a viewer may use on the shared combat, each gated by role/grants and liveness.
 * Every flag is FAIL CLOSED: default false, enabled only when authority is proven AND (for live-authority
 * controls) the view is live.
 */
export interface CombatControlPermissions {
	/** Advance the turn / round. DM-only AND live (a stale client cannot advance authoritative turn order). */
	canAdvanceTurn: boolean;
	/** End combat. DM-only AND live. */
	canEndCombat: boolean;
	/** Edit ANY combatant's resources (true for the DM when live). */
	canEditAnyCombatant: boolean;
	/**
	 * Combatant ids whose resources THIS viewer may edit. For the DM (when live) this is every VISIBLE
	 * combatant; for a player it is the combatants they hold `combat-participant` on. Empty when stale or
	 * unauthorized. Always a subset of the combatants the viewer can SEE (no control for a hidden combatant).
	 */
	editableCombatantIds: string[];
}

const NO_CONTROLS: CombatControlPermissions = Object.freeze({
	canAdvanceTurn: false,
	canEndCombat: false,
	canEditAnyCombatant: false,
	editableCombatantIds: [],
});

/** The COLLAB-006 shared combat view: the SES actor-filtered tracker + permitted controls + liveness. */
export interface SharedCombatView {
	/** The SES-002 actor-filtered tracker (hidden combatants already omitted/redacted). */
	tracker: CombatTrackerView;
	/** Which combat controls this viewer may use (role/grant-gated, fail closed, liveness-aware). */
	controls: CombatControlPermissions;
	/** Whether the viewer is seeing LIVE or STALE (cached) combat (COLLAB-006 AC3). */
	liveness: CombatViewLiveness;
	/**
	 * True when the view is stale: the GUI must mark the combat stale and disable live-authority controls.
	 * (Equivalent to `liveness === 'stale'`; surfaced as a flag for the GUI.)
	 */
	stale: boolean;
	/** The viewing actor id (null for an unknown actor — who gets an empty, control-less view). */
	viewerActorId: ActorId | null;
}

/**
 * Whether a player holds combat-edit authority over a SPECIFIC combatant — the SAME rule the
 * `combat.apply-resource` command enforces (`actorMayEditCombatant`): the DM always; for a CHARACTER
 * combatant, a player with `combat-participant` on that character; never an observer; never for an
 * NPC/monster (no character owner). Reused here so the control set matches the command authority exactly.
 */
function actorMayEditCombatant(
	permissions: PermissionState,
	actor: Actor,
	combatant: { kind: string; characterId: string | null },
	now?: string,
): boolean {
	if (hasDmAuthority(actor.role)) return true;
	if (actor.role === 'observer') return false;
	if (combatant.kind !== 'character' || !combatant.characterId) return false;
	return hasGrantedCapability(
		permissions,
		actor,
		CHARACTER_ENTITY_TYPE,
		combatant.characterId,
		'combat-participant',
		now,
	);
}

/**
 * Compute the permitted controls for a viewer over the combat they can SEE. Fail closed: an unknown actor
 * or a stale view yields the control set that excludes every live-authority action. Controls are derived
 * from the SAME authority the command reducers enforce, and editable combatants are restricted to those
 * the viewer can both SEE (in the filtered tracker) and EDIT (combat authority).
 */
export function computeCombatControls(
	combat: SessionCombatState,
	permissions: PermissionState,
	tracker: CombatTrackerView,
	actor: Actor | undefined,
	liveness: CombatViewLiveness,
	now?: string,
): CombatControlPermissions {
	if (!actor) return NO_CONTROLS;
	const live = liveness === 'live';
	const isDm = hasDmAuthority(actor.role);

	// Editable combatants: only those the viewer can SEE (present in the filtered tracker, non-redacted)
	// AND has authority over. A redacted placeholder row is never editable (no leak of edit affordance).
	const editableCombatantIds = live
		? tracker.combatants
				.filter((row) => !row.redacted)
				.filter((row) => {
					const source = combat.combatants[row.id];
					if (!source) return false;
					return actorMayEditCombatant(permissions, actor, source, now);
				})
				.map((row) => row.id)
		: [];

	return {
		// Advancing/ending combat is DM-only AND requires live authority (a stale client cannot drive the
		// authoritative turn order).
		canAdvanceTurn: isDm && live,
		canEndCombat: isDm && live,
		canEditAnyCombatant: isDm && live,
		editableCombatantIds,
	};
}

/**
 * COLLAB-006 — build the SHARED COMBAT VIEW for a participant. Reuses the SES actor-filtered tracker for
 * combatant visibility (hidden combatants omitted/placeholdered) and adds role/grant-gated, liveness-aware
 * permitted controls. When `liveness` is `stale` (cached/offline view, COLLAB-006 AC3) every live-authority
 * control is disabled and the view is flagged stale.
 */
export function getSharedCombatView(
	combat: SessionCombatState,
	permissions: PermissionState,
	actorId: string,
	liveness: CombatViewLiveness = 'live',
	now?: string,
): SharedCombatView {
	const actor = getActor(permissions, actorId);
	const tracker = getCombatTrackerForActor(combat, permissions, actorId, now);
	const controls = computeCombatControls(combat, permissions, tracker, actor, liveness, now);
	return {
		tracker,
		controls,
		liveness,
		stale: liveness === 'stale',
		viewerActorId: actor?.id ?? null,
	};
}

// --- COLLAB-006 × COLLAB-009 — filter combat ops BEFORE they reach a participant ------------------

/**
 * Whether a non-DM recipient may SEE a given combatant — the SAME rule the SES tracker view uses: a
 * non-hidden combatant is visible; a HIDDEN combatant is visible only to a player who holds
 * `combat-participant` on it (a character combatant). Used to gate combat REPLICATION ops at the source.
 */
function recipientCanSeeCombatant(
	combatant: Combatant,
	permissions: PermissionState,
	recipient: Actor,
	now?: string,
): boolean {
	if (hasDmAuthority(recipient.role)) return true;
	if (!combatant.hidden) return true;
	if (combatant.kind === 'character' && combatant.characterId) {
		return hasGrantedCapability(
			permissions,
			recipient,
			CHARACTER_ENTITY_TYPE,
			combatant.characterId,
			'combat-participant',
			now,
		);
	}
	return false;
}

/** Extract the combatant id a combat op targets from its `path` (`combat/combatants/<id>/...`), or null. */
export function combatantIdFromOpPath(op: SyncOperation): string | null {
	if (op.entityType !== COMBAT_ENTITY_TYPE || !op.path) return null;
	const match = /^combat\/combatants\/([^/]+)/.exec(op.path);
	return match ? (match[1] ?? null) : null;
}

/**
 * REDACT a combat-level op's value for a non-DM recipient so it does not leak a hidden combatant's id OR
 * an aggregate count that betrays hidden-combatant volume:
 *
 *   - `order` (e.g. `combat.start`/`combat.add-combatants`) lists every combatant id, including hidden
 *     ones; it is filtered to the combatants the recipient may SEE, and `combatantCount` reduced to match.
 *   - `addedCount` (`combat.add-combatants`) and `logEntries` (`combat.end`) are AGGREGATE counts that
 *     include hidden combatants / hidden activity. A non-DM never needs them, so they are stripped — a
 *     count must not reveal that N combatants were added when the recipient may only see M of them.
 *
 * Only ever called for a NON-DM recipient (the stream filter delivers DMs every op unchanged). Pure
 * (returns the same op when nothing needed redacting).
 */
const HIDDEN_ACTIVITY_COUNT_FIELDS = ['addedCount', 'logEntries'] as const;

function redactCombatLevelOpForRecipient(
	op: SyncOperation,
	combat: SessionCombatState,
	permissions: PermissionState,
	recipient: Actor,
	now?: string,
): SyncOperation {
	const value = op.value;
	if (!value || typeof value !== 'object') return op;
	const record = value as Record<string, unknown>;
	let redacted: Record<string, unknown> | null = null;
	const draft = (): Record<string, unknown> => (redacted ??= { ...record });

	const order = record.order;
	if (Array.isArray(order)) {
		const visibleOrder = order.filter((id): id is string => {
			if (typeof id !== 'string') return false;
			const combatant = combat.combatants[id];
			return !!combatant && recipientCanSeeCombatant(combatant, permissions, recipient, now);
		});
		if (visibleOrder.length !== order.length) {
			draft().order = visibleOrder;
			draft().combatantCount = visibleOrder.length;
		}
	}

	for (const field of HIDDEN_ACTIVITY_COUNT_FIELDS) {
		if (field in record) delete draft()[field];
	}

	return redacted ? { ...op, value: redacted } : op;
}

/**
 * COLLAB-006 × COLLAB-009 — FILTER COMBAT OPS for a recipient BEFORE they leave the host (filter-before-
 * send). The DM receives every combat op. A non-DM receives a combat op ONLY when it does not concern a
 * combatant they cannot see: an op targeting a HIDDEN combatant the recipient may not see is OMITTED
 * entirely, so a player never RECEIVES a hidden combatant's resource/turn ops — the content never enters
 * their stream, it is not merely hidden in the UI. Combat-level ops (start/advance-turn/end — no specific
 * combatant) are delivered to all participants (they reveal no hidden identity). Fail closed: an op naming
 * a combatant absent from current state is withheld from non-DM recipients.
 *
 * Pure + deterministic; preserves input order (dependency order is carried by the ops themselves).
 */
export function filterCombatStreamForRecipient(
	operations: readonly SyncOperation[],
	combat: SessionCombatState,
	permissions: PermissionState,
	recipient: Actor | undefined,
	now?: string,
): SyncOperation[] {
	if (!recipient) return [];
	if (hasDmAuthority(recipient.role)) return [...operations];
	const delivered: SyncOperation[] = [];
	for (const op of operations) {
		if (op.entityType !== COMBAT_ENTITY_TYPE) {
			delivered.push(op); // not a combat op; this filter doesn't gate it
			continue;
		}
		const combatantId = combatantIdFromOpPath(op);
		if (combatantId === null) {
			// Combat-level op (start/advance/end): no per-combatant path, but its value may carry the
			// initiative order — redact it so a hidden combatant's id never reaches a non-DM recipient.
			delivered.push(redactCombatLevelOpForRecipient(op, combat, permissions, recipient, now));
			continue;
		}
		const combatant = combat.combatants[combatantId];
		if (!combatant) continue; // fail closed: unknown combatant ⇒ withhold from a non-DM
		if (recipientCanSeeCombatant(combatant, permissions, recipient, now)) delivered.push(op);
	}
	return delivered;
}

/**
 * HARD non-leak assertion (COLLAB-006): prove a combat stream about to be replicated to a recipient
 * carries NO op concerning a hidden combatant the recipient cannot see. Re-checks every op and THROWS if a
 * hidden-combatant op slipped through — a fail-closed boundary guard so a buggy transport that bypassed
 * {@link filterCombatStreamForRecipient} is caught at the source rather than leaking. Pure (apart from throwing).
 */
export function assertCombatStreamCarriesNoHiddenCombatant(
	delivered: readonly SyncOperation[],
	combat: SessionCombatState,
	permissions: PermissionState,
	recipient: Actor | undefined,
	now?: string,
): void {
	if (recipient && hasDmAuthority(recipient.role)) return;
	const canSee = (id: string): boolean => {
		const combatant = combat.combatants[id];
		return !!combatant && !!recipient && recipientCanSeeCombatant(combatant, permissions, recipient, now);
	};
	for (const op of delivered) {
		if (op.entityType !== COMBAT_ENTITY_TYPE) continue;
		const combatantId = combatantIdFromOpPath(op);
		if (combatantId !== null) {
			if (!canSee(combatantId)) {
				throw new Error(
					`Combat stream leak: operation "${op.id}" concerns hidden combatant "${combatantId}" and must not be delivered to recipient "${recipient?.id ?? 'unknown'}".`,
				);
			}
			continue;
		}
		// Combat-level op: its value's initiative order must not name a combatant the recipient cannot see.
		const order = (op.value as { order?: unknown } | undefined)?.order;
		if (Array.isArray(order)) {
			for (const id of order) {
				if (typeof id === 'string' && !canSee(id)) {
					throw new Error(
						`Combat stream leak: operation "${op.id}" lists hidden combatant "${id}" in its initiative order and must not be delivered to recipient "${recipient?.id ?? 'unknown'}".`,
					);
				}
			}
		}
	}
}
