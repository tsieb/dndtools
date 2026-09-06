import type { DurableStateDocumentId } from '../migration/schema-versions';
import type { RawErrorRecord } from './error-taxonomy';
import type { RawStorageUsageEntry } from './storage-usage';
import type { PerfDiagnosticSample } from '../perf/diagnostics-privacy';

/**
 * Shared, source-of-truth diagnostics inputs. These are produced by platform services
 * (the GUI/shell pass them in) and never carry secrets at this layer — the Processing
 * Core assembles status views and bundles, and redaction guarantees fail-closed output.
 */

export type SyncSourceState = 'connected' | 'degraded' | 'offline' | 'error' | 'disabled';

export interface SyncSourceStatusInput {
	sourceId: string;
	kind: 'local-vault' | 'obsidian-vault' | 'google-docs' | string;
	displayName: string;
	state: SyncSourceState;
	/** DM/admin-facing detail; may reference a path or message and is redacted on export. */
	detail: string | null;
	pendingOperations: number;
	lastSyncedAt: string | null;
}

export type CapabilityAvailability = 'available' | 'degraded' | 'unsupported';

export interface PlatformCapabilityInput {
	id: string;
	displayName: string;
	availability: CapabilityAvailability;
	/** DM/admin-facing fallback/remediation; redacted on export. */
	detail: string | null;
}

export interface SchemaHealthInput {
	documentId: DurableStateDocumentId;
	currentVersion: number | null;
	targetVersion: number;
	migrationRequired: boolean;
	blocked: boolean;
}

export interface DiagnosticsContextInput {
	appVersion: string;
	platformProfileId: string;
	generatedAt: string;
	online: boolean;
	syncSources: SyncSourceStatusInput[];
	capabilities: PlatformCapabilityInput[];
	schema: SchemaHealthInput[];
	/** Free-form environment facts (may contain paths/secrets; always redacted on export). */
	environment: Record<string, unknown>;
	/** RC-ENG-6.1 — raw error observations for the taxonomy count view. Optional/additive: absent
	 *  or empty means "no errors observed", never a denial. Raw messages never leave this input. */
	errorLog?: readonly RawErrorRecord[];
	/** RC-ENG-6.1 — raw storage measurements for the usage-by-category view. Optional/additive. */
	storageUsage?: readonly RawStorageUsageEntry[];
	/** RC-ENG-6.1 — local perf-mark samples (PERF-009's local UX diagnostics store) to surface
	 *  alongside the rest of the diagnostics view. Optional/additive. */
	perfMarks?: readonly PerfDiagnosticSample[];
}

/**
 * RC-ENG-6.1 — the most recent `lastSyncedAt` across all sync sources, or `null` when there are no
 * sources or none has ever synced. Pure string comparison: ISO-8601 timestamps sort lexically.
 */
export function deriveLastSyncAt(sources: readonly SyncSourceStatusInput[]): string | null {
	let latest: string | null = null;
	for (const source of sources) {
		if (source.lastSyncedAt && (!latest || source.lastSyncedAt > latest)) {
			latest = source.lastSyncedAt;
		}
	}
	return latest;
}

export type SystemHealthLevel = 'healthy' | 'degraded' | 'unhealthy';

export interface SyncSourceStatusView {
	sourceId: string;
	kind: string;
	displayName: string;
	state: SyncSourceState;
	detail: string | null;
	pendingOperations: number;
	lastSyncedAt: string | null;
	/** Action-oriented remediation surfaced when the source is not healthy. */
	remediation: string | null;
}

export interface CapabilityStatusView {
	id: string;
	displayName: string;
	availability: CapabilityAvailability;
	detail: string | null;
}

function syncSourceRemediation(state: SyncSourceState): string | null {
	switch (state) {
		case 'connected':
			return null;
		case 'degraded':
			return 'Sync is degraded. Pending changes are queued locally and will retry.';
		case 'offline':
			return 'Source is offline. Reconnect the network or the source to resume sync.';
		case 'error':
			return 'Source reported an error. Re-authenticate or reconnect the source.';
		case 'disabled':
			return 'Source is disabled. Enable it in sync settings to resume.';
	}
}

export function toSyncSourceStatusView(input: SyncSourceStatusInput): SyncSourceStatusView {
	return {
		sourceId: input.sourceId,
		kind: input.kind,
		displayName: input.displayName,
		state: input.state,
		detail: input.detail,
		pendingOperations: input.pendingOperations,
		lastSyncedAt: input.lastSyncedAt,
		remediation: syncSourceRemediation(input.state),
	};
}

export function deriveHealthLevel(context: DiagnosticsContextInput): SystemHealthLevel {
	const schemaBlocked = context.schema.some((entry) => entry.blocked);
	const sourceError = context.syncSources.some((source) => source.state === 'error');
	if (schemaBlocked || sourceError) return 'unhealthy';

	const schemaPending = context.schema.some((entry) => entry.migrationRequired);
	const sourceDegraded = context.syncSources.some(
		(source) => source.state === 'degraded' || source.state === 'offline',
	);
	const capabilityDegraded = context.capabilities.some(
		(capability) =>
			capability.availability === 'degraded' || capability.availability === 'unsupported',
	);
	if (schemaPending || sourceDegraded || capabilityDegraded || !context.online) {
		return 'degraded';
	}
	return 'healthy';
}
