import { hasDmAuthority } from '../state/permission-state';
import type { ActorId } from '../state/ids';
import type { PermissionGrant, PermissionState } from '../state/permission-state';
import {
	deriveHealthLevel,
	deriveLastSyncAt,
	toSyncSourceStatusView,
	type CapabilityStatusView,
	type DiagnosticsContextInput,
	type SyncSourceStatusView,
	type SystemHealthLevel,
} from './health';
import { redactValue } from './redaction';
import type { ParticipantSafeStatusSummary } from './participant-status';
import { countErrorsByCategory, type ErrorTaxonomyCounts } from './error-taxonomy';
import { summarizeStorageUsage, type StorageUsageView } from './storage-usage';
import type { PerfDiagnosticSample } from '../perf/diagnostics-privacy';

/**
 * The capability set a DM must grant for another actor to export a support bundle
 * (PLAT-009 AC3). Diagnostics export is denied unless an explicit grant of this set
 * exists on the diagnostics entity, or the actor is the DM.
 */
export const DIAGNOSTIC_GRANT_CAPABILITY = 'diagnostics-admin' as const;
export const DIAGNOSTICS_ENTITY_TYPE = 'diagnostics' as const;
export const DIAGNOSTICS_ENTITY_ID = 'system' as const;

export type DiagnosticsDenialReason = 'unknown-actor' | 'requires-dm-or-diagnostic-grant';

export interface SchemaHealthView {
	documentId: string;
	currentVersion: number | null;
	targetVersion: number;
	migrationRequired: boolean;
	blocked: boolean;
}

export interface DmDiagnosticsView {
	kind: 'available';
	actorId: ActorId;
	appVersion: string;
	platformProfileId: string;
	generatedAt: string;
	online: boolean;
	health: SystemHealthLevel;
	syncSources: SyncSourceStatusView[];
	capabilities: CapabilityStatusView[];
	schema: SchemaHealthView[];
	/** RC-ENG-6.1 — the most recent sync across all sources, or null if none has ever synced. */
	lastSyncAt: string | null;
	/** RC-ENG-6.1 — error observations by category. Counts only; never raw message text. */
	errorTaxonomy: ErrorTaxonomyCounts;
	/** RC-ENG-6.1 — local storage usage by category, in bytes. */
	storageUsage: StorageUsageView;
	/** RC-ENG-6.1 — local perf-mark samples (PERF-009 local UX diagnostics). */
	perfMarks: readonly PerfDiagnosticSample[];
}

export type DmDiagnosticsResult =
	| DmDiagnosticsView
	| { kind: 'denied'; reason: DiagnosticsDenialReason };

/**
 * True when the actor is the DM, or holds an explicit diagnostics-admin grant on the
 * diagnostics system entity. Observers can never receive a write-capable grant, so an
 * observer is only allowed here if explicitly granted the read-only diagnostics set.
 */
export function actorCanViewDmDiagnostics(permissions: PermissionState, actorId: ActorId): boolean {
	const actor = permissions.actors[actorId];
	if (!actor) return false;
	if (hasDmAuthority(actor.role)) return true;
	return permissions.grants.some(
		(grant: PermissionGrant) =>
			grant.playerActorId === actorId &&
			grant.entityType === DIAGNOSTICS_ENTITY_TYPE &&
			grant.entityId === DIAGNOSTICS_ENTITY_ID &&
			grant.capabilitySet === DIAGNOSTIC_GRANT_CAPABILITY,
	);
}

/**
 * Assemble the DM/admin diagnostics view: system health, sync/source status, platform
 * capability status, and schema/migration health (PLAT-009 AC1). Fails closed: a
 * non-DM actor without an explicit diagnostic grant is denied.
 */
export function getDmDiagnostics(
	permissions: PermissionState,
	context: DiagnosticsContextInput,
	actorId: ActorId,
): DmDiagnosticsResult {
	const actor = permissions.actors[actorId];
	if (!actor) return { kind: 'denied', reason: 'unknown-actor' };
	if (!actorCanViewDmDiagnostics(permissions, actorId)) {
		return { kind: 'denied', reason: 'requires-dm-or-diagnostic-grant' };
	}

	return {
		kind: 'available',
		actorId,
		appVersion: context.appVersion,
		platformProfileId: context.platformProfileId,
		generatedAt: context.generatedAt,
		online: context.online,
		health: deriveHealthLevel(context),
		syncSources: context.syncSources.map(toSyncSourceStatusView),
		capabilities: context.capabilities.map((capability) => ({
			id: capability.id,
			displayName: capability.displayName,
			availability: capability.availability,
			detail: capability.detail,
		})),
		schema: context.schema.map((entry) => ({
			documentId: entry.documentId,
			currentVersion: entry.currentVersion,
			targetVersion: entry.targetVersion,
			migrationRequired: entry.migrationRequired,
			blocked: entry.blocked,
		})),
		lastSyncAt: deriveLastSyncAt(context.syncSources),
		errorTaxonomy: countErrorsByCategory(context.errorLog ?? []),
		storageUsage: summarizeStorageUsage(context.storageUsage ?? []),
		perfMarks: context.perfMarks ?? [],
	};
}

export interface SupportBundleOptions {
	/** When true, the user explicitly opts into including raw secrets/paths. */
	includeSecrets?: boolean;
	/**
	 * Participant-safe status summaries to embed (PLAT-017 AC3). These are already
	 * generic by construction; even with `includeSecrets`, they carry no secrets, raw
	 * paths, hidden titles, or private player content.
	 */
	participantStatus?: ParticipantSafeStatusSummary[];
}

export interface SupportBundle {
	kind: 'bundle';
	schemaVersion: 1;
	generatedAt: string;
	generatedBy: ActorId;
	appVersion: string;
	platformProfileId: string;
	online: boolean;
	health: SystemHealthLevel;
	/** True when secrets/paths were intentionally included by the user. */
	secretsIncluded: boolean;
	syncSources: unknown;
	capabilities: unknown;
	schema: unknown;
	environment: unknown;
	/** Participant-safe status summaries; always generic, never identifying (PLAT-017 AC3). */
	participantStatus: ParticipantSafeStatusSummary[];
	/** RC-ENG-6.1 — the most recent sync across all sources, or null if none has ever synced. */
	lastSyncAt: string | null;
	/** RC-ENG-6.1 — error observations by category. Counts only, safe unconditionally. */
	errorTaxonomy: ErrorTaxonomyCounts;
	/** RC-ENG-6.1 — local storage usage by category, in bytes. Safe unconditionally (no paths). */
	storageUsage: StorageUsageView;
	/** RC-ENG-6.1 — local perf-mark samples. Metric id + number only, safe unconditionally. */
	perfMarks: readonly PerfDiagnosticSample[];
}

export type SupportBundleResult =
	| SupportBundle
	| { kind: 'denied'; reason: DiagnosticsDenialReason };

/**
 * Export a DM/admin support bundle (PLAT-009 AC2/AC3). Denied for actors without DM
 * authority or an explicit diagnostic grant. Secrets and raw absolute paths are redacted
 * by default and only included when the user explicitly opts in.
 */
export function exportSupportBundle(
	permissions: PermissionState,
	context: DiagnosticsContextInput,
	actorId: ActorId,
	options: SupportBundleOptions = {},
): SupportBundleResult {
	const actor = permissions.actors[actorId];
	if (!actor) return { kind: 'denied', reason: 'unknown-actor' };
	if (!actorCanViewDmDiagnostics(permissions, actorId)) {
		return { kind: 'denied', reason: 'requires-dm-or-diagnostic-grant' };
	}

	const includeSecrets = options.includeSecrets === true;
	return {
		kind: 'bundle',
		schemaVersion: 1,
		generatedAt: context.generatedAt,
		generatedBy: actorId,
		appVersion: context.appVersion,
		platformProfileId: context.platformProfileId,
		online: context.online,
		health: deriveHealthLevel(context),
		secretsIncluded: includeSecrets,
		syncSources: redactValue(context.syncSources.map(toSyncSourceStatusView), includeSecrets),
		capabilities: redactValue(context.capabilities, includeSecrets),
		schema: redactValue(context.schema, includeSecrets),
		environment: redactValue(context.environment, includeSecrets),
		// Participant-safe summaries are generic by construction, so they are never
		// un-redacted even when the user opts to include their own secrets/paths.
		participantStatus: [...(options.participantStatus ?? [])],
		lastSyncAt: deriveLastSyncAt(context.syncSources),
		// Counts, byte totals, and metric-id/number pairs carry no content — safe to include
		// unconditionally, with no dependency on the `includeSecrets` opt-in.
		errorTaxonomy: countErrorsByCategory(context.errorLog ?? []),
		storageUsage: summarizeStorageUsage(context.storageUsage ?? []),
		perfMarks: context.perfMarks ?? [],
	};
}
