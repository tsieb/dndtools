import { hasDmAuthority } from '../state/permission-state';
import type { ActorId } from '../state/ids';
import type { Actor, PermissionState } from '../state/permission-state';
import { hasGrantedCapability } from '../permissions/grants';

/**
 * COLLAB-008 — AUTHORITATIVE session-command resolution (Architecture Contract 2, session merge
 * strategy: "Session live state … DM commands supersede non-DM commands where policy defines
 * authority"; Contract 3 DM Authority). When a DM command and one or more non-DM commands concurrently
 * target the SAME session field, this pure Processing-Core policy decides which command determines the
 * final state.
 *
 * The rule, fail-closed and deterministic:
 *
 *   - A VALID DM command SUPERSEDES concurrent non-DM commands ON A FIELD WHERE SESSION POLICY GRANTS
 *     THE DM AUTHORITY (`dm-authoritative`). The DM is inherently the authority (it is not a grant
 *     record — Contract 3 DM Authority); this is the "DM override on shared session live state" path.
 *   - WHERE POLICY DOES NOT GRANT DM AUTHORITY on the field (`shared-merge`), normal rules apply: no
 *     command is elevated merely because its actor is the DM; concurrent same-field edits surface as a
 *     CONFLICT for deterministic resolution (no silent override).
 *   - A non-DM command whose actor is OUTSIDE their grants is REJECTED — not conflicted (COLLAB-008
 *     AC2 / Contract 2 Conflict rule 4: "unauthorized remote operations are rejected, not conflicted").
 *   - A non-DM can NEVER override a DM (fail closed): there is no path by which a player/observer
 *     command supersedes a valid DM command.
 *
 * It REUSES the PERM authority model: a DM's authority is its base role; a non-DM's write authority is
 * `hasGrantedCapability` against the required capability set. It does NOT re-implement permissions.
 * Pure and deterministic over plain data — no DOM/storage/clock/entropy.
 */

/**
 * Whether session POLICY grants the DM final authority over a particular session field. A field is
 * either `dm-authoritative` (the DM's valid command supersedes concurrent non-DM commands) or
 * `shared-merge` (no DM override; concurrent same-field edits conflict and resolve by normal rules).
 * Fail closed: an UNKNOWN field defaults to `dm-authoritative` — the most protective stance for shared
 * session state, so an unclassified field can never be silently co-edited away from DM control.
 */
export type SessionFieldAuthority = 'dm-authoritative' | 'shared-merge';

export const DEFAULT_SESSION_FIELD_AUTHORITY: SessionFieldAuthority = 'dm-authoritative';

/**
 * A session command competing to set ONE session field. It carries the actor + role, the entity/field
 * target, and the capability set the write requires (for the non-DM grant check). `issuedAt` orders
 * commands of equal authority deterministically (earliest-issued, then command id, wins a `shared-merge`
 * tie only when there is exactly one valid non-DM command and no DM command).
 */
export interface SessionFieldCommand {
	commandId: string;
	actorId: ActorId;
	entityType: string;
	entityId: string;
	/** The session field being set (e.g. `timer.durationSeconds`). Used only for policy lookup. */
	field: string;
	/** The proposed value (carried through to the winning result; opaque to the resolver). */
	value: unknown;
	/** The capability set a NON-DM needs to write this field. Absent ⇒ DM-only (a non-DM is rejected). */
	requiredCapability?: string;
	/** ISO issue time, for a deterministic same-authority tie-break. */
	issuedAt: string;
}

/** The outcome of resolving concurrent commands on one session field. */
export type SessionAuthorityOutcome =
	| 'dm-supersedes' // a valid DM command won under `dm-authoritative` policy
	| 'sole-valid' // exactly one valid command (DM or permitted non-DM); it wins outright
	| 'conflict' // multiple valid commands under `shared-merge`; surface a conflict
	| 'no-valid-command'; // every command was unauthorized/invalid (fail closed: no winner)

/** A command that was rejected during resolution (unauthorized non-DM write — never conflicted). */
export interface RejectedSessionCommand {
	commandId: string;
	actorId: ActorId;
	reason: 'unknown-actor' | 'not-permitted' | 'observer-write';
}

export interface SessionAuthorityResolution {
	field: string;
	authority: SessionFieldAuthority;
	outcome: SessionAuthorityOutcome;
	/** The command that determines final state, when there is a single winner (`dm-supersedes`/`sole-valid`). */
	winningCommandId: string | null;
	/** The actor whose command won, when there is a winner. */
	winningActorId: ActorId | null;
	/** The winning value, when there is a winner (carried from the winning command). */
	winningValue: unknown;
	/** Command ids that are in conflict (only when `outcome` is `conflict`). */
	conflictingCommandIds: string[];
	/** Commands rejected as unauthorized (never elevated to a conflict). */
	rejected: RejectedSessionCommand[];
}

/**
 * Validate ONE command's authority to write the field. The DM is inherently authorized (base role —
 * Contract 3 DM Authority). A non-DM needs the required capability via `hasGrantedCapability`; an
 * observer is always rejected (Contract 3 observers cannot receive write grants); a non-DM command with
 * no `requiredCapability` is a DM-only field and is rejected for the non-DM. Returns the rejection
 * reason, or `null` when the command is authorized.
 */
function validateCommandAuthority(
	command: SessionFieldCommand,
	permission: PermissionState,
	now?: string,
): RejectedSessionCommand['reason'] | null {
	const actor: Actor | undefined = permission.actors[command.actorId];
	if (!actor) return 'unknown-actor';
	if (hasDmAuthority(actor.role)) return null;
	if (actor.role === 'observer') return 'observer-write';
	// Player: needs the required capability on the target. A DM-only field (no requiredCapability) is
	// never writable by a non-DM.
	if (command.requiredCapability === undefined) return 'not-permitted';
	const permitted = hasGrantedCapability(
		permission,
		actor,
		command.entityType,
		command.entityId,
		command.requiredCapability,
		now,
	);
	return permitted ? null : 'not-permitted';
}

function isDmCommand(command: SessionFieldCommand, permission: PermissionState): boolean {
	return hasDmAuthority(permission.actors[command.actorId]?.role);
}

/** Deterministic ordering for same-authority ties: earliest `issuedAt`, then lexicographic command id. */
function compareForTieBreak(a: SessionFieldCommand, b: SessionFieldCommand): number {
	if (a.issuedAt !== b.issuedAt) return a.issuedAt < b.issuedAt ? -1 : 1;
	return a.commandId < b.commandId ? -1 : a.commandId > b.commandId ? 1 : 0;
}

/**
 * RESOLVE concurrent commands targeting ONE session field (COLLAB-008). All commands MUST target the
 * same field; the caller groups by field first.
 *
 * Algorithm (fail closed):
 *
 *   1. Validate every command's authority. Unauthorized non-DM commands are REJECTED (never conflicted).
 *   2. From the VALID commands, partition into DM and non-DM.
 *   3. If the field is `dm-authoritative` AND there is ≥1 valid DM command: the DM SUPERSEDES — the
 *      latest-authority DM command wins (deterministic tie-break), every valid non-DM command is
 *      superseded (dropped, not conflicted). `dm-supersedes`.
 *   4. Otherwise (no valid DM command, or `shared-merge` policy):
 *        - 0 valid commands ⇒ `no-valid-command` (every command was unauthorized).
 *        - exactly 1 valid command ⇒ `sole-valid` (it wins outright).
 *        - ≥2 valid commands ⇒ `conflict` (deterministic resolution required; no silent override).
 *
 * This proves both required cases: DM-supersedes-non-DM under granted authority, AND the non-authority
 * case where normal rules apply (a DM command does not override; same-field edits conflict).
 */
export function resolveSessionFieldAuthority(
	commands: readonly SessionFieldCommand[],
	permission: PermissionState,
	authority: SessionFieldAuthority,
	now?: string,
): SessionAuthorityResolution {
	const field = commands[0]?.field ?? '';

	const rejected: RejectedSessionCommand[] = [];
	const valid: SessionFieldCommand[] = [];
	for (const command of commands) {
		const reason = validateCommandAuthority(command, permission, now);
		if (reason) {
			rejected.push({ commandId: command.commandId, actorId: command.actorId, reason });
		} else {
			valid.push(command);
		}
	}

	const base: SessionAuthorityResolution = {
		field,
		authority,
		outcome: 'no-valid-command',
		winningCommandId: null,
		winningActorId: null,
		winningValue: undefined,
		conflictingCommandIds: [],
		rejected,
	};

	if (valid.length === 0) return base;

	const dmCommands = valid.filter((command) => isDmCommand(command, permission));

	// DM-authoritative policy + at least one valid DM command ⇒ the DM supersedes every non-DM command.
	if (authority === 'dm-authoritative' && dmCommands.length > 0) {
		// Deterministic among multiple DM commands: latest issued wins (then command-id tie-break).
		const winner = [...dmCommands].sort(compareForTieBreak).at(-1)!;
		return {
			...base,
			outcome: 'dm-supersedes',
			winningCommandId: winner.commandId,
			winningActorId: winner.actorId,
			winningValue: winner.value,
		};
	}

	// No DM override applies. Normal rules:
	if (valid.length === 1) {
		const winner = valid[0]!;
		return {
			...base,
			outcome: 'sole-valid',
			winningCommandId: winner.commandId,
			winningActorId: winner.actorId,
			winningValue: winner.value,
		};
	}

	// ≥2 valid commands under shared-merge (or no valid DM command under dm-authoritative): conflict.
	return {
		...base,
		outcome: 'conflict',
		conflictingCommandIds: valid.map((command) => command.commandId).sort(),
	};
}
