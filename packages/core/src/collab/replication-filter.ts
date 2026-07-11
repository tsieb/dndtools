import { hasDmAuthority } from '../state/permission-state';
import type { ActorId } from '../state/ids';
import type { Actor, PermissionState } from '../state/permission-state';
import type { SyncOperation } from '../sync/operation-log';
import {
	evaluateVisibility,
	type EntityVisibilityMetadata,
} from '../permissions/visibility-filter';

/**
 * COLLAB-009 — FILTER-BEFORE-SEND: the replication-stream privacy KEYSTONE (Architecture Contract 2,
 * "Sync Security and Privacy" rule 3 — "Player replication streams are filtered by visibility and
 * grants before data leaves the sync service or host device"; Contract 2 Cloud-storage-must-not-
 * contain "Hidden player content in a player-readable replication stream"; Cross-Contract
 * Non-Negotiable 2).
 *
 * THE SECURITY CRUX: hidden content must NOT be delivered to a participant and then hidden in the UI.
 * It must NEVER ENTER that participant's stream. This module is the pure Processing-Core policy that,
 * given the FULL op stream + a recipient actor, emits ONLY the operations that actor may see — so a
 * player's / observer's outbound stream contains ZERO dm-only/hidden content. Filtering happens HERE,
 * at the source, before serialization; the serialized stream a participant receives is a STRICT subset
 * of the full stream.
 *
 * It REUSES the visibility-filter engine (`evaluateVisibility` / the same fail-closed
 * field>section>entity precedence with hidden-ancestor-wins) — it does NOT re-implement visibility.
 * The DM stream is unfiltered (the DM sees everything). A non-DM op is delivered iff the recipient can
 * SEE its target entity (and, when the op is path-scoped, the targeted field/section).
 *
 * Per ADR-014 the LIVE replication TRANSPORT is deferred. This is the policy a transport plugs into:
 * the transport hands the full op batch + the recipient + the per-entity visibility metadata to
 * {@link filterReplicationStream}, and replicates ONLY the returned ops. It is pure and deterministic
 * over plain data — no DOM/storage/clock/entropy/network.
 *
 * Fail closed:
 *
 *   - An op whose target has NO supplied visibility metadata is treated as `dm-only` (the visibility-
 *     filter default), so it is delivered to NO non-DM recipient. Absence never widens delivery.
 *   - An unknown / unauthenticated recipient receives the EMPTY stream (no actor ⇒ nothing visible).
 *   - The recipient stream NEVER contains an op the recipient cannot see; a withheld op is OMITTED
 *     entirely (not redacted-in-place), so its existence is not probeable from the delivered stream.
 */

/** Why a single operation was withheld from a recipient's replication stream (the structured reason). */
export type ReplicationWithholdReason =
	| 'unknown-recipient'
	| 'target-not-visible'
	| 'field-not-visible';

/**
 * How the filter resolves the visibility of an op's target. The transport supplies a lookup keyed by
 * `entityType:entityId` (the recorded, namespaced sidecar visibility metadata applied BEFORE reads —
 * Contract 3 Axis 1 rule 6). A target absent from the lookup fails closed to `dm-only`, so an op
 * against an entity with no recorded metadata is delivered only to the DM.
 */
export interface ReplicationVisibilitySource {
	/** Resolve the visibility metadata for an op's target, or `undefined` ⇒ fail closed to `dm-only`. */
	(op: SyncOperation): EntityVisibilityMetadata | undefined;
}

/** The default per-op metadata when the source returns nothing: a bare record ⇒ entity is `dm-only`. */
function defaultMetadata(op: SyncOperation): EntityVisibilityMetadata {
	return { entityType: op.entityType, entityId: op.entityId };
}

/**
 * Decide whether a SINGLE operation may be delivered to a recipient actor. The DM always may. A non-DM
 * is decided by the visibility-filter engine against the op's target (and, when the op is path-scoped,
 * the targeted field). Returns the decision plus, when withheld, the structured reason.
 *
 * This is the per-op choke point {@link filterReplicationStream} applies to every op; it is exported so
 * a transport can also gate a single late-arriving op without re-filtering the whole batch.
 */
export function isOperationVisibleToRecipient(
	op: SyncOperation,
	recipient: Actor | undefined,
	metadata: EntityVisibilityMetadata,
	permission?: PermissionState,
): { visible: true } | { visible: false; reason: ReplicationWithholdReason } {
	if (!recipient) return { visible: false, reason: 'unknown-recipient' };
	if (hasDmAuthority(recipient.role)) return { visible: true };

	// Entity-level visibility first: if the recipient cannot see the target entity, the op is withheld.
	const entityDecision = evaluateVisibility(metadata, {}, recipient, permission);
	if (!entityDecision.visible) return { visible: false, reason: 'target-not-visible' };

	// Path-scoped op: the recipient must additionally be able to see the targeted field/section.
	if (op.path !== undefined) {
		const fieldDecision = evaluateVisibility(metadata, { fieldPath: op.path }, recipient, permission);
		if (!fieldDecision.visible) return { visible: false, reason: 'field-not-visible' };
	}

	return { visible: true };
}

/** One withheld operation, recorded for the SENDER's diagnostics — never delivered to the recipient. */
export interface WithheldOperation {
	operationId: SyncOperation['id'];
	entityType: string;
	entityId: string;
	reason: ReplicationWithholdReason;
}

/**
 * The result of filtering a full op stream for ONE recipient. `delivered` is the EXACT, ordered subset
 * of the input that the recipient may receive — this is what the transport replicates. `withheld` is
 * the sender-side record of what was filtered out (for DM diagnostics); it carries only entity
 * references + a generic reason, never the op `value`/hidden content, so the record itself cannot leak.
 */
export interface ReplicationStreamResult {
	recipientActorId: ActorId | null;
	/** The ops the recipient may receive, in input order. A STRICT subset of the input stream. */
	delivered: SyncOperation[];
	/** The ops withheld from the recipient (sender diagnostics only — never sent). */
	withheld: WithheldOperation[];
}

/**
 * FILTER A FULL OPERATION STREAM FOR A RECIPIENT (COLLAB-009 keystone). Given the FULL op stream and a
 * recipient actor, return ONLY the ops that actor may see. Every op is gated by
 * {@link isOperationVisibleToRecipient} against its (fail-closed-to-`dm-only`) visibility metadata.
 *
 *   - DM recipient ⇒ the full stream is delivered unchanged (the DM sees everything).
 *   - A non-DM recipient ⇒ delivered = ops whose target (and path, when path-scoped) is visible; every
 *     dm-only / not-shared / hidden-ancestor op is OMITTED from `delivered` and recorded in `withheld`.
 *   - Unknown/unauthenticated recipient ⇒ empty `delivered`, every op recorded as `unknown-recipient`.
 *
 * Input order is preserved (dependency order is carried by the ops themselves; filtering never reorders).
 * Pure and deterministic. The serialized `delivered` array a participant receives is, by construction, a
 * subset that NEVER contains a hidden op — so a test can serialize it and assert a secret is absent.
 */
export function filterReplicationStream(
	operations: readonly SyncOperation[],
	recipient: Actor | undefined,
	resolveVisibility: ReplicationVisibilitySource,
	permission?: PermissionState,
): ReplicationStreamResult {
	const recipientActorId = recipient?.id ?? null;

	// DM: unfiltered. Copy to keep the result independent of the caller's array.
	if (recipient && hasDmAuthority(recipient.role)) {
		return { recipientActorId, delivered: [...operations], withheld: [] };
	}

	const delivered: SyncOperation[] = [];
	const withheld: WithheldOperation[] = [];
	for (const op of operations) {
		const metadata = resolveVisibility(op) ?? defaultMetadata(op);
		const decision = isOperationVisibleToRecipient(op, recipient, metadata, permission);
		if (decision.visible) {
			delivered.push(op);
		} else {
			withheld.push({
				operationId: op.id,
				entityType: op.entityType,
				entityId: op.entityId,
				reason: decision.reason,
			});
		}
	}
	return { recipientActorId, delivered, withheld };
}

/**
 * CATCH-UP filter (COLLAB-009 AC2): "Given a player gains visibility later, when catch-up sync runs,
 * then only newly authorized content is delivered." Filters the full stream against the CURRENT
 * visibility/grants (so a now-visible entity's ops become deliverable) AND excludes everything the
 * participant has ALREADY received (`alreadyDeliveredOperationIds`). The catch-up batch is therefore
 * exactly the ops that are NOW visible AND not yet delivered — never re-sending content, and never
 * sending content that became visible only after a grant the participant no longer holds, because the
 * gate re-evaluates against current permission state every time.
 */
export function filterCatchUpStream(
	operations: readonly SyncOperation[],
	recipient: Actor | undefined,
	resolveVisibility: ReplicationVisibilitySource,
	alreadyDeliveredOperationIds: ReadonlySet<string>,
	permission?: PermissionState,
): ReplicationStreamResult {
	const full = filterReplicationStream(operations, recipient, resolveVisibility, permission);
	const delivered = full.delivered.filter((op) => !alreadyDeliveredOperationIds.has(op.id));
	return { recipientActorId: full.recipientActorId, delivered, withheld: full.withheld };
}

/**
 * Hard assertion the SENDER can run before replicating: prove a delivered stream carries NO op the
 * recipient cannot see. Re-checks every delivered op against the visibility source and throws if any
 * op is not visible to the recipient — a fail-closed guard so a buggy transport that bypassed the
 * filter is caught at the boundary rather than leaking. Pure (apart from throwing).
 */
export function assertStreamCarriesNoHiddenContent(
	delivered: readonly SyncOperation[],
	recipient: Actor | undefined,
	resolveVisibility: ReplicationVisibilitySource,
	permission?: PermissionState,
): void {
	if (recipient && hasDmAuthority(recipient.role)) return;
	for (const op of delivered) {
		const metadata = resolveVisibility(op) ?? defaultMetadata(op);
		const decision = isOperationVisibleToRecipient(op, recipient, metadata, permission);
		if (!decision.visible) {
			throw new Error(
				`Replication stream leak: operation "${op.id}" (${decision.reason}) must not be delivered to recipient "${recipient?.id ?? 'unknown'}".`,
			);
		}
	}
}
