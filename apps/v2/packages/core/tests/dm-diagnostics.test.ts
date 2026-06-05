import { describe, expect, it } from 'vitest';
import {
	DIAGNOSTICS_ENTITY_ID,
	DIAGNOSTICS_ENTITY_TYPE,
	DIAGNOSTIC_GRANT_CAPABILITY,
	PERMISSION_STATE_SCHEMA_VERSION,
	REDACTED_PATH,
	REDACTED_SECRET,
	containsSensitiveData,
	exportSupportBundle,
	getDmDiagnostics,
	type DiagnosticsContextInput,
	type PermissionGrant,
	type PermissionState,
} from '../src';
import { DM_ACTOR, OBSERVER_ACTOR, PLAYER_ACTOR } from '../src/testing/fixtures';

function permissions(grants: PermissionGrant[] = []): PermissionState {
	return {
		actors: {
			[DM_ACTOR.id]: DM_ACTOR,
			[PLAYER_ACTOR.id]: PLAYER_ACTOR,
			[OBSERVER_ACTOR.id]: OBSERVER_ACTOR,
		},
		grants,
		schemaVersion: PERMISSION_STATE_SCHEMA_VERSION,
	};
}

function diagnosticsContext(
	overrides: Partial<DiagnosticsContextInput> = {},
): DiagnosticsContextInput {
	return {
		appVersion: '0.2.0',
		platformProfileId: 'desktop',
		generatedAt: '2026-06-04T12:00:00.000Z',
		online: true,
		syncSources: [
			{
				sourceId: 'local-vault',
				kind: 'local-vault',
				displayName: 'Local Vault',
				state: 'connected',
				detail: 'Vault at /Users/dm/campaigns/vault',
				pendingOperations: 0,
				lastSyncedAt: '2026-06-04T11:59:00.000Z',
			},
		],
		capabilities: [
			{ id: 'filesystem', displayName: 'Filesystem', availability: 'available', detail: null },
		],
		schema: [
			{
				documentId: 'scenes',
				currentVersion: 1,
				targetVersion: 1,
				migrationRequired: false,
				blocked: false,
			},
		],
		environment: {
			vaultPath: '/Users/dm/campaigns/vault',
			authToken: 'sk-secret-token-value',
			userAgent: 'DNDTools/0.2.0',
		},
		...overrides,
	};
}

describe('PLAT-009 DM/admin diagnostics view (AC1: system health, source status, remediation)', () => {
	it('shows source status and remediation when a sync source fails', () => {
		const context = diagnosticsContext({
			syncSources: [
				{
					sourceId: 'gdocs',
					kind: 'google-docs',
					displayName: 'Google Docs',
					state: 'error',
					detail: 'auth expired',
					pendingOperations: 3,
					lastSyncedAt: null,
				},
			],
		});
		const result = getDmDiagnostics(permissions(), context, DM_ACTOR.id);
		expect(result.kind).toBe('available');
		if (result.kind !== 'available') return;
		expect(result.health).toBe('unhealthy');
		expect(result.syncSources[0]?.state).toBe('error');
		expect(result.syncSources[0]?.remediation).toMatch(/re-authenticate|reconnect/i);
	});

	it('derives degraded health from a migration-required schema document', () => {
		const context = diagnosticsContext({
			schema: [
				{
					documentId: 'scenes',
					currentVersion: 0,
					targetVersion: 1,
					migrationRequired: true,
					blocked: false,
				},
			],
		});
		const result = getDmDiagnostics(permissions(), context, DM_ACTOR.id);
		expect(result.kind === 'available' && result.health).toBe('degraded');
	});

	it('derives unhealthy health from a blocked schema document', () => {
		const context = diagnosticsContext({
			schema: [
				{
					documentId: 'maps',
					currentVersion: 9,
					targetVersion: 1,
					migrationRequired: false,
					blocked: true,
				},
			],
		});
		const result = getDmDiagnostics(permissions(), context, DM_ACTOR.id);
		expect(result.kind === 'available' && result.health).toBe('unhealthy');
	});
});

describe('PLAT-009 diagnostics permissions (AC3: deny export without DM/admin grant)', () => {
	it('denies a player the DM diagnostics view', () => {
		const result = getDmDiagnostics(permissions(), diagnosticsContext(), PLAYER_ACTOR.id);
		expect(result).toEqual({ kind: 'denied', reason: 'requires-dm-or-diagnostic-grant' });
	});

	it('denies an observer the DM diagnostics view', () => {
		const result = getDmDiagnostics(permissions(), diagnosticsContext(), OBSERVER_ACTOR.id);
		expect(result).toEqual({ kind: 'denied', reason: 'requires-dm-or-diagnostic-grant' });
	});

	it('denies a support bundle export to a player', () => {
		const result = exportSupportBundle(permissions(), diagnosticsContext(), PLAYER_ACTOR.id);
		expect(result).toEqual({ kind: 'denied', reason: 'requires-dm-or-diagnostic-grant' });
	});

	it('denies a support bundle export to an observer', () => {
		const result = exportSupportBundle(permissions(), diagnosticsContext(), OBSERVER_ACTOR.id);
		expect(result).toEqual({ kind: 'denied', reason: 'requires-dm-or-diagnostic-grant' });
	});

	it('denies an unknown actor', () => {
		const result = exportSupportBundle(permissions(), diagnosticsContext(), 'ghost');
		expect(result).toEqual({ kind: 'denied', reason: 'unknown-actor' });
	});

	it('allows export when an explicit diagnostics-admin grant exists', () => {
		const grant: PermissionGrant = {
			id: 'grant-diag',
			entityType: DIAGNOSTICS_ENTITY_TYPE,
			entityId: DIAGNOSTICS_ENTITY_ID,
			playerActorId: PLAYER_ACTOR.id,
			capabilitySet: DIAGNOSTIC_GRANT_CAPABILITY,
			createdBy: DM_ACTOR.id,
			createdAt: '2026-06-04T10:00:00.000Z',
		};
		const result = exportSupportBundle(permissions([grant]), diagnosticsContext(), PLAYER_ACTOR.id);
		expect(result.kind).toBe('bundle');
	});

	it('ignores a grant for the wrong entity or capability', () => {
		const wrongCapability: PermissionGrant = {
			id: 'grant-x',
			entityType: DIAGNOSTICS_ENTITY_TYPE,
			entityId: DIAGNOSTICS_ENTITY_ID,
			playerActorId: PLAYER_ACTOR.id,
			capabilitySet: 'viewer',
			createdBy: DM_ACTOR.id,
			createdAt: '2026-06-04T10:00:00.000Z',
		};
		const result = exportSupportBundle(
			permissions([wrongCapability]),
			diagnosticsContext(),
			PLAYER_ACTOR.id,
		);
		expect(result.kind).toBe('denied');
	});
});

describe('PLAT-009 support bundle redaction (AC2: redact secrets and raw paths by default)', () => {
	it('redacts secrets and absolute paths by default', () => {
		const result = exportSupportBundle(permissions(), diagnosticsContext(), DM_ACTOR.id);
		expect(result.kind).toBe('bundle');
		if (result.kind !== 'bundle') return;
		expect(result.secretsIncluded).toBe(false);
		const env = result.environment as Record<string, unknown>;
		expect(env.authToken).toBe(REDACTED_SECRET);
		expect(env.vaultPath).toBe(REDACTED_PATH);
		// The non-sensitive value survives.
		expect(env.userAgent).toBe('DNDTools/0.2.0');
		// The whole bundle contains no surviving secret/path.
		expect(containsSensitiveData(result.environment)).toBe(false);
		expect(containsSensitiveData(result.syncSources)).toBe(false);
	});

	it('redacts the source detail path inside the sync source view', () => {
		const result = exportSupportBundle(permissions(), diagnosticsContext(), DM_ACTOR.id);
		if (result.kind !== 'bundle') throw new Error('expected bundle');
		const sources = result.syncSources as Array<{ detail: string | null }>;
		expect(sources[0]?.detail).toContain(REDACTED_PATH);
		expect(sources[0]?.detail).not.toContain('/Users/dm');
	});

	it('includes raw secrets only when the user explicitly opts in', () => {
		const result = exportSupportBundle(permissions(), diagnosticsContext(), DM_ACTOR.id, {
			includeSecrets: true,
		});
		if (result.kind !== 'bundle') throw new Error('expected bundle');
		expect(result.secretsIncluded).toBe(true);
		const env = result.environment as Record<string, unknown>;
		expect(env.authToken).toBe('sk-secret-token-value');
		expect(env.vaultPath).toBe('/Users/dm/campaigns/vault');
	});
});
