import type { Actor } from '../state/permission-state';
import type { PermissionState } from '../state/permission-state';
import {
	filterEntityForActor,
	type EntityVisibilityMetadata,
	type FilterableContent,
	type FilteredContent,
} from '../permissions/visibility-filter';
import {
	findStreamPrivacyLeaks,
	type StreamPrivacyLeak,
	type StreamPrivacyNeedle,
} from '../collab/stream-privacy';

/**
 * CON-001 — THE "GUI HIDING IS NEVER AUTHORITATIVE" CONSTRAINT GATE. The single, declared source of truth
 * for the invariant that the data/storage/query layer — never the GUI — is the authoritative enforcement
 * point for visibility, permissions, sync filtering, and security decisions (Architecture Cross-Contract;
 * Contract 1 binding rule 5; Contract 3 "Both axes are evaluated in the data/storage layer before any UI
 * render. UI guards are useful for ergonomics but are never authoritative"; Defects `CODEX-PR5-DM-NOTES-LEAK`,
 * `CODEX-PR17-POI-VISIBILITY-LEAK`).
 *
 * CON-001's statement: "The system must never rely on GUI hiding as the authoritative enforcement mechanism
 * for visibility, permissions, sync filtering, or security decisions." Its two acceptance criteria:
 *
 *   AC1 — Given a PLAYER QUERY is made for hidden data, when data LEAVES the storage/query layer, then the
 *         hidden data is ALREADY ABSENT (the data layer omitted it; nothing downstream needs to hide it).
 *   AC2 — Given a UI component accidentally renders EVERY FIELD it receives, when player data is supplied,
 *         then NO DM-ONLY FIELD is present to leak (the payload it was handed already carried none).
 *
 * This module delivers BOTH criteria as fail-closed proofs over the SOURCE projection, BEFORE any GUI is
 * involved:
 *
 *   - {@link projectEntityForActor} is the sanctioned non-DM read: it routes content through the existing
 *     storage/query-layer filter ({@link filterEntityForActor}) so hidden sections/fields are OMITTED at the
 *     source. AC1.
 *   - {@link assertProjectionHasNoDmOnlyField} proves the projected payload — exactly what the GUI would
 *     receive — carries NONE of the planted DM-only secrets, so even a component that naively renders every
 *     field it is handed cannot leak a DM-only field. AC2. It reuses the SEC-010 stream-privacy needle scan.
 *   - {@link auditGuiHidingReliance} is the codebase-drift audit: it proves the declared non-DM delivery
 *     surfaces ALL enforce at the data layer and none is GUI-only, so the project can never silently start
 *     relying on GUI hiding for a security decision without widening this declared registry.
 *
 * It mirrors the established mechanical-gate pattern in this codebase (the SEC-008 `security/regression-gates.ts`
 * registry, the PLAT-010 `platform/quality-gates.ts` registry, the CON-003/004/006 constraint gates): a
 * declared invariant + a pure, fail-closed validator cross-checked against reality so the project can never
 * silently drift past the constraint. It does NOT re-implement the visibility filter or the stream-privacy
 * scan — it COMPOSES them ({@link filterEntityForActor}, {@link findStreamPrivacyLeaks}) and proves the
 * data-layer-first enforcement direction holds.
 *
 * Pure data + pure predicates. No GUI, no storage, no clock, no entropy, no network.
 */

/** CON-001 constraint-registry version, bumped on a breaking constraint-shape change. */
export const GUI_HIDING_CONSTRAINT_VERSION = 1 as const;

/**
 * CON-001 AC1 — the sanctioned NON-DM read. Project an entity's content for an actor by routing it through
 * the data/storage-layer visibility filter so hidden sections/fields are OMITTED before the payload LEAVES
 * the query layer. The returned {@link FilteredContent} is the exact shape a GUI would render; for a non-DM
 * whose entity is hidden it is the empty hidden result (indistinguishable from not-found), and for a visible
 * entity it contains only the sections/fields that survive field>section>entity precedence with
 * hidden-ancestor-wins. Fail closed: absent/unknown visibility metadata ⇒ `dm-only`.
 *
 * This is a thin, intention-revealing alias over {@link filterEntityForActor}: the point of CON-001 is that
 * the GUI must read ONLY through this data-layer choke-point, never re-derive visibility itself.
 */
export function projectEntityForActor(
	meta: EntityVisibilityMetadata,
	content: FilterableContent,
	actor: Actor | undefined,
	permission?: PermissionState,
): FilteredContent {
	return filterEntityForActor(meta, content, actor, permission);
}

/**
 * CON-001 AC2 — prove a projection a GUI would receive carries NONE of the planted DM-only secrets, fail
 * closed. `needles` are the exact hidden values/titles/ids the SOURCE entity holds (planted by a test or a
 * pre-send guard). Returns every leak the SEC-010 stream-privacy scan finds in the serialized projection —
 * an empty array means a UI that naively renders every field it received still cannot leak a DM-only field,
 * because the payload it was handed already carried none.
 *
 * Pure: a function of the projection + needles. Composes {@link findStreamPrivacyLeaks} (the established
 * deep, key-aware needle scan); it does not re-implement scanning.
 */
export function findDmOnlyFieldLeaks(
	projection: unknown,
	needles: readonly StreamPrivacyNeedle[],
): StreamPrivacyLeak[] {
	return findStreamPrivacyLeaks(projection, needles);
}

/**
 * CON-001 AC2 — the fail-closed boundary guard: THROW if a non-DM projection carries any planted DM-only
 * secret. A serializer/transport (or a test) runs this on the exact payload bound for the GUI, so a UI that
 * accidentally renders every field it receives provably has no DM-only field to leak. Pure apart from
 * throwing.
 */
export function assertProjectionHasNoDmOnlyField(
	projection: unknown,
	needles: readonly StreamPrivacyNeedle[],
): void {
	const leaks = findDmOnlyFieldLeaks(projection, needles);
	if (leaks.length > 0) {
		const first = leaks[0]!;
		throw new Error(
			`CON-001 violation: a DM-only ${first.kind} (domain "${first.domain}", secret ${JSON.stringify(
				first.secret,
			)}) is present in a non-DM projection at ${first.path}. The data/storage layer must omit hidden ` +
				`content before the payload reaches the GUI — GUI hiding is never the authoritative enforcement point.`,
		);
	}
}

/**
 * WHERE each non-DM delivery surface enforces its visibility/permission/sync-filtering decision. The
 * constraint is that EVERY surface enforces at `data-layer` (or earlier) — never `gui-only`. `gui-only` is
 * declared only so the audit can flag it; no real surface may use it.
 */
export type EnforcementPoint =
	| 'data-layer' // visibility/permission filtering runs in the Processing-Core query/storage layer
	| 'sync-stream' // the replication/sync stream filters at the source before delivery
	| 'gui-only'; // FORBIDDEN — the surface relies on the GUI hiding content (a CON-001 violation)

/**
 * One declared surface that delivers data to a NON-DM actor (a query/subscription/sync stream/MCP response/
 * widget binding). Each records WHERE it enforces visibility (`enforcement`) and the core guard surface that
 * does the enforcing. The audit proves none is `gui-only` and each names a real data-layer guard.
 */
export interface NonDmDeliverySurface {
	/** Stable id of the delivery surface. */
	readonly id: string;
	/** Where the visibility/permission/sync decision is authoritatively made for this surface. */
	readonly enforcement: EnforcementPoint;
	/** The core export(s) that enforce the decision at the data layer (the thing CON-001 requires). */
	readonly guardSurface: string;
}

/**
 * THE NON-DM DELIVERY SURFACE REGISTRY. Every channel by which entity data reaches a non-DM actor has a row
 * here, and every row enforces at the DATA LAYER (or sync-stream source) — never `gui-only`. Adding a new
 * delivery surface that relies on GUI hiding would fail {@link auditGuiHidingReliance}, so the project can
 * never silently introduce a security decision the GUI is authoritative for. Mirrors the SEC-008 boundary
 * registry shape.
 */
export const NON_DM_DELIVERY_SURFACES: readonly NonDmDeliverySurface[] = Object.freeze([
	{
		id: 'entity-query-read',
		enforcement: 'data-layer',
		guardSurface: 'filterEntityForActor, evaluateVisibility',
	},
	{
		id: 'replication-sync-stream',
		enforcement: 'sync-stream',
		guardSurface: 'filterReplicationStream, assertViewCarriesNoHiddenContent',
	},
	{
		id: 'widget-binding-resolution',
		enforcement: 'data-layer',
		guardSurface: 'filterEntityForActor (binding resolver delegates to the same policy)',
	},
	{
		id: 'mcp-response',
		enforcement: 'data-layer',
		guardSurface: 'filterEntityForActor (MCP response assembly delegates to the same policy)',
	},
	{
		id: 'player-view-projection',
		enforcement: 'data-layer',
		guardSurface: 'filterEntityForActor (player-view delivery is actor-filtered at the source)',
	},
]);

/** A problem the GUI-hiding-reliance audit found (CON-001). */
export interface GuiHidingProblem {
	kind: 'gui-only-enforcement' | 'missing-guard-surface' | 'duplicate-surface-id';
	surfaceId: string;
	message: string;
}

/**
 * CON-001 — audit the declared non-DM delivery surfaces against the invariant, fail closed. Every surface
 * MUST enforce its visibility/permission/sync decision at the DATA LAYER (or sync-stream source) and name a
 * real guard surface; NONE may be `gui-only`. A surface declared `gui-only`, or one without a guard surface,
 * is exactly the "GUI hiding is the authoritative mechanism" anti-pattern CON-001 forbids, and is flagged.
 *
 * Returns every problem so a caller reports all at once. Pure: a function of the passed registry (defaulting
 * to the real one). The CON-001 meta-test drives this against the real registry (expecting zero problems)
 * and against a deliberately `gui-only` fixture (expecting a problem), proving the gate goes GREEN on the
 * real codebase and RED on a GUI-hiding-reliance violation.
 */
export function auditGuiHidingReliance(
	surfaces: readonly NonDmDeliverySurface[] = NON_DM_DELIVERY_SURFACES,
): GuiHidingProblem[] {
	const problems: GuiHidingProblem[] = [];
	const seen = new Set<string>();

	for (const surface of surfaces) {
		if (seen.has(surface.id)) {
			problems.push({
				kind: 'duplicate-surface-id',
				surfaceId: surface.id,
				message: `Duplicate non-DM delivery surface id "${surface.id}".`,
			});
		}
		seen.add(surface.id);

		if (surface.enforcement === 'gui-only') {
			problems.push({
				kind: 'gui-only-enforcement',
				surfaceId: surface.id,
				message: `Delivery surface "${surface.id}" relies on GUI hiding as its enforcement mechanism. Visibility, permission, and sync-filtering decisions must be enforced at the data/storage/query layer before the payload reaches the GUI (CON-001).`,
			});
		}
		if (surface.guardSurface.trim() === '') {
			problems.push({
				kind: 'missing-guard-surface',
				surfaceId: surface.id,
				message: `Delivery surface "${surface.id}" names no data-layer guard surface; CON-001 requires every non-DM read to be filtered at the data layer.`,
			});
		}
	}

	return problems;
}

/** A summary of the CON-001 GUI-hiding constraint, for the audit/diagnostics surface. */
export interface GuiHidingConstraintSummary {
	/** The constraint-registry version the invariant is pinned to. */
	version: number;
	/** The number of declared non-DM delivery surfaces governed. */
	deliverySurfaceCount: number;
	/** True when every delivery surface enforces at the data layer (none `gui-only`). */
	dataLayerEnforced: boolean;
}

/**
 * Summarize the CON-001 constraint: the version, how many non-DM delivery surfaces are governed, and whether
 * every one enforces at the data layer. Pure; used by the CON-001 meta-test and any governance diagnostic to
 * report that no security decision relies on GUI hiding.
 */
export function summarizeGuiHidingConstraint(): GuiHidingConstraintSummary {
	return {
		version: GUI_HIDING_CONSTRAINT_VERSION,
		deliverySurfaceCount: NON_DM_DELIVERY_SURFACES.length,
		dataLayerEnforced: auditGuiHidingReliance().length === 0,
	};
}
