import {
	DURABLE_STATE_DOCUMENT_IDS,
	TARGET_SCHEMA_VERSIONS,
	planMigration,
	type CoreStateSlice,
	type DiagnosticsContextInput,
	type PersistedDocumentVersion,
	type PlatformCapabilityInput,
	type SchemaHealthInput,
	type SyncSourceStatusInput,
} from '@dndtools/v2-core';

/**
 * Builds the diagnostics context (Contract 1: Platform Services derive system facts; the
 * Processing Core assembles status views and bundles). This stays in the app/platform
 * layer because it reads the platform profile, online state, and persisted schema
 * versions — none of which the pure core may observe directly.
 *
 * For the local single-device prototype the only sync source is the local vault. Schema
 * health is derived from the durable state slice's recorded schema versions against the
 * build's target versions via the core migration planner, so the diagnostics view and
 * the migration dry-run agree on what needs upgrading.
 */

export interface DiagnosticsEnvironmentInput {
	appVersion: string;
	platformProfileId: string;
	online: boolean;
	/** Whether the runtime persists to browser storage on this profile. */
	storageAvailable: boolean;
	/** Whether a native filesystem vault is reachable (false on web/PWA). */
	filesystemAvailable: boolean;
	/** Number of locally queued (unsynced) operations. */
	pendingOperations: number;
	now: string;
}

function persistedVersions(state: CoreStateSlice): PersistedDocumentVersion[] {
	const recorded: Record<string, number | null> = {
		scenes: state.scenes.schemaVersion ?? null,
		maps: state.maps.schemaVersion ?? null,
		permissions: state.permissions.schemaVersion ?? null,
		session: state.session.schemaVersion ?? null,
		widgets: state.widgets.schemaVersion ?? null,
		commandCenter: state.commandCenter.schemaVersion ?? null,
	};
	return DURABLE_STATE_DOCUMENT_IDS.map((documentId) => ({
		documentId,
		schemaVersion: recorded[documentId] ?? null,
		present: recorded[documentId] != null,
	}));
}

function schemaHealth(state: CoreStateSlice): SchemaHealthInput[] {
	const plan = planMigration(persistedVersions(state));
	return plan.documents.map((doc) => ({
		documentId: doc.documentId,
		currentVersion: doc.fromVersion,
		targetVersion: TARGET_SCHEMA_VERSIONS[doc.documentId],
		migrationRequired: doc.status === 'needs-upgrade',
		blocked: doc.blockingIssue !== null,
	}));
}

function syncSources(env: DiagnosticsEnvironmentInput): SyncSourceStatusInput[] {
	return [
		{
			sourceId: 'local-vault',
			kind: 'local-vault',
			displayName: 'Local Vault',
			state: env.storageAvailable ? (env.online ? 'connected' : 'degraded') : 'error',
			detail: env.storageAvailable
				? 'Browser-local IndexedDB store (prototype).'
				: 'Local storage is unavailable in this browser profile.',
			pendingOperations: env.pendingOperations,
			lastSyncedAt: env.storageAvailable ? env.now : null,
		},
	];
}

function capabilities(env: DiagnosticsEnvironmentInput): PlatformCapabilityInput[] {
	return [
		{
			id: 'local-storage',
			displayName: 'Local persistence',
			availability: env.storageAvailable ? 'available' : 'unsupported',
			detail: env.storageAvailable ? null : 'IndexedDB is blocked or unavailable.',
		},
		{
			id: 'filesystem-vault',
			displayName: 'Filesystem vault',
			availability: env.filesystemAvailable ? 'available' : 'unsupported',
			detail: env.filesystemAvailable
				? null
				: 'No native filesystem on this profile; the web prototype uses browser storage.',
		},
		{
			id: 'cloud-sync',
			displayName: 'Cloud sync',
			// Cloud sync is deferred for the prototype (ADR-014); report it as unsupported
			// rather than pretending it works.
			availability: 'unsupported',
			detail: 'Cloud sync is not enabled in the local prototype.',
		},
	];
}

export function buildDiagnosticsContext(
	state: CoreStateSlice,
	env: DiagnosticsEnvironmentInput,
): DiagnosticsContextInput {
	return {
		appVersion: env.appVersion,
		platformProfileId: env.platformProfileId,
		generatedAt: env.now,
		online: env.online,
		syncSources: syncSources(env),
		capabilities: capabilities(env),
		schema: schemaHealth(state),
		environment: {
			profile: env.platformProfileId,
			online: env.online,
			pendingOperations: env.pendingOperations,
		},
	};
}
