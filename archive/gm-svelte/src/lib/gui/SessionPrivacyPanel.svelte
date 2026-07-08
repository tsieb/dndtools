<script lang="ts">
	import {
		computeParticipantCachePrivacyStatus,
		evaluateCachePrivacy,
		filterReplicationStream,
		resolveSessionFieldAuthority,
		type EntityVisibilityMetadata,
		type ParticipantCacheEntry,
		type PermissionState,
		type SessionFieldAuthority,
		type SyncOperation,
	} from '@dndtools/core';

	/**
	 * COLLAB-008 / COLLAB-009 / COLLAB-010 / COLLAB-014 — the SESSION PRIVACY inspection surface.
	 *
	 * It renders the Processing-Core collaboration privacy policy: the FILTER-BEFORE-SEND replication
	 * stream (a player's/observer's outbound stream contains ZERO hidden content), the DM-authority
	 * resolution of concurrent session commands, and the explicit session-cache policy (purge/seal on
	 * leave unless persistent grant; offline-revocation sealing). It reads NOTHING from raw storage or
	 * network and dispatches NO command (Contract 1) — per ADR-014 the live replication/cache transport
	 * is deferred, so this is the seam + visibility only. The demo uses fixed local actors so the
	 * computed models are deterministic regardless of vault state.
	 */

	const SECRET = 'The vampire is the mayor.';

	const permission: PermissionState = {
		actors: {
			'demo-dm': { id: 'demo-dm', role: 'dm', displayName: 'DM' },
			'demo-player': { id: 'demo-player', role: 'player', displayName: 'Player' },
			'demo-observer': { id: 'demo-observer', role: 'observer', displayName: 'Observer' },
		},
		grants: [
			{
				id: 'demo-grant-handout',
				entityType: 'handout',
				entityId: 'handout-keep',
				playerActorId: 'demo-player',
				capabilitySet: 'viewer',
				createdBy: 'demo-dm',
				createdAt: '2026-06-04T00:00:00.000Z',
				expiresAt: null,
			},
			{
				id: 'demo-grant-timer',
				entityType: 'timer-widget',
				entityId: 'timer-1',
				playerActorId: 'demo-player',
				capabilitySet: 'operator',
				createdBy: 'demo-dm',
				createdAt: '2026-06-04T00:00:00.000Z',
				expiresAt: null,
			},
		],
		schemaVersion: 1,
	};

	function op(o: Partial<SyncOperation> & Pick<SyncOperation, 'id' | 'entityType' | 'entityId'>): SyncOperation {
		return {
			vaultId: 'vault-demo',
			sourceId: 'local-vault',
			actorId: 'demo-dm',
			opType: 'update',
			dependencies: [],
			issuedAt: '2026-06-05T00:00:00.000Z',
			schemaVersion: 1,
			...o,
		};
	}

	const stream: SyncOperation[] = [
		op({ id: 'op-public', entityType: 'note', entityId: 'note-square', value: { body: 'The town square is busy.' } }),
		op({ id: 'op-secret', entityType: 'note', entityId: 'note-secret', value: { body: SECRET } }),
		op({ id: 'op-handout', entityType: 'handout', entityId: 'handout-keep', value: { body: 'A torn map fragment.' } }),
	];

	const visibilityRecords: EntityVisibilityMetadata[] = [
		{ entityType: 'note', entityId: 'note-square', entity: { level: 'player-visible' } },
		{ entityType: 'note', entityId: 'note-secret', entity: { level: 'dm-only' } },
		{ entityType: 'handout', entityId: 'handout-keep', entity: { level: 'shared', sharedWith: ['demo-player'] } },
	];
	const visibilityByKey = new Map(visibilityRecords.map((r) => [`${r.entityType}:${r.entityId}`, r]));
	const resolveVisibility = (o: SyncOperation): EntityVisibilityMetadata | undefined =>
		visibilityByKey.get(`${o.entityType}:${o.entityId}`);

	// COLLAB-009 — the recipient's filtered outbound stream. The serialized payload NEVER contains the
	// secret for a player/observer (filtered at the source).
	let recipientId = $state<'demo-dm' | 'demo-player' | 'demo-observer'>('demo-player');
	const recipient = $derived(permission.actors[recipientId]);
	const replication = $derived(filterReplicationStream(stream, recipient, resolveVisibility, permission));
	const deliveredWire = $derived(JSON.stringify(replication.delivered));
	const streamContainsSecret = $derived(deliveredWire.includes(SECRET));

	// COLLAB-008 — concurrent DM + player timer commands resolved under the selected policy.
	let fieldAuthority = $state<SessionFieldAuthority>('dm-authoritative');
	const authority = $derived(
		resolveSessionFieldAuthority(
			[
				{ commandId: 'cmd-player', actorId: 'demo-player', entityType: 'timer-widget', entityId: 'timer-1', field: 'timer.durationSeconds', value: 30, requiredCapability: 'operator', issuedAt: '2026-06-05T00:00:00.000Z' },
				{ commandId: 'cmd-dm', actorId: 'demo-dm', entityType: 'timer-widget', entityId: 'timer-1', field: 'timer.durationSeconds', value: 60, issuedAt: '2026-06-05T00:00:01.000Z' },
			],
			permission,
			fieldAuthority,
		),
	);

	// COLLAB-010 + COLLAB-014 — the participant cache evaluated on leave. The persistent-granted handout
	// is retained; the projected scene is purged (online) or sealed (offline).
	let cacheOnline = $state(true);
	const cacheEntries: ParticipantCacheEntry[] = [
		{ cacheKey: 'handout:handout-keep', entityType: 'handout', entityId: 'handout-keep', sessionOnly: true },
		{ cacheKey: 'scene:scene-boss', entityType: 'scene', entityId: 'scene-boss', sessionOnly: true },
	];
	const cache = $derived(
		evaluateCachePrivacy(
			{ participant: permission.actors['demo-player']!, entries: cacheEntries, permission, online: cacheOnline },
			'left',
			{ ttlMs: 60_000, issuedAt: '2026-06-05T00:00:00.000Z' },
		),
	);

	// COLLAB-010 AC4 / COLLAB-014 AC4 — purge confirmation status (no device secrets leaked).
	const privacyStatus = computeParticipantCachePrivacyStatus(
		['demo-player', 'demo-observer'],
		new Set(['demo-player']),
	);
</script>

<section class="cwrap" data-testid="session-privacy-panel" aria-label="Session privacy">
	<h2>Session privacy</h2>
	<p class="meta">
		Player and observer replication streams are filtered before data leaves the host, concurrent
		session commands resolve with DM authority where policy grants it, and participant device caches
		are purged or sealed when a player leaves. The Processing Core owns every decision; this surface
		renders the computed models and reaches no storage or transport (live transport deferred).
	</p>

	<!-- COLLAB-009: filter-before-send. -->
	<section aria-label="Filtered replication stream">
		<h3>Replication stream (filter-before-send)</h3>
		<div class="controls">
			<label>
				Recipient
				<select data-testid="replication-recipient" bind:value={recipientId}>
					<option value="demo-dm">DM</option>
					<option value="demo-player">Player</option>
					<option value="demo-observer">Observer</option>
				</select>
			</label>
		</div>
		<p class="meta">
			Delivered operations:
			<strong data-testid="replication-delivered">{replication.delivered.map((o) => o.id).join(', ') || 'none'}</strong>
		</p>
		<p class="meta">
			Withheld at source:
			<strong data-testid="replication-withheld">{replication.withheld.map((w) => w.operationId).join(', ') || 'none'}</strong>
		</p>
		<p class="meta" data-testid="replication-secret-present">
			Outbound stream contains the DM-only secret: {streamContainsSecret ? 'yes' : 'no'}
		</p>
	</section>

	<!-- COLLAB-008: DM authority resolution. -->
	<section aria-label="DM authority resolution">
		<h3>Concurrent command authority</h3>
		<div class="controls">
			<label>
				Field policy
				<select data-testid="authority-policy" bind:value={fieldAuthority}>
					<option value="dm-authoritative">dm-authoritative</option>
					<option value="shared-merge">shared-merge</option>
				</select>
			</label>
		</div>
		<p class="meta">
			DM sets 60s, player sets 30s on the same timer. Outcome:
			<strong data-testid="authority-outcome">{authority.outcome}</strong>
		</p>
		<p class="meta" data-testid="authority-winner">
			Winning actor: {authority.winningActorId ?? 'none'} • value: {authority.winningValue ?? 'n/a'}
		</p>
	</section>

	<!-- COLLAB-010 + COLLAB-014: cache purge/seal. -->
	<section aria-label="Participant cache privacy">
		<h3>Participant cache on leave</h3>
		<div class="controls">
			<label>
				<input type="checkbox" data-testid="cache-online" bind:checked={cacheOnline} /> participant online
			</label>
		</div>
		<p class="meta" data-testid="cache-retained">Retained (persistent grant): {cache.retainedKeys.join(', ') || 'none'}</p>
		<p class="meta" data-testid="cache-purged">Purged: {cache.purgedKeys.join(', ') || 'none'}</p>
		<p class="meta" data-testid="cache-sealed">Sealed: {cache.sealedKeys.join(', ') || 'none'}</p>
		<p class="meta" data-testid="cache-ttl">Cache TTL (ms): {cache.policy.ttlMs} • key invalidation: {cache.policy.invalidatesSessionKey ? 'on' : 'off'}</p>
	</section>

	<!-- COLLAB-010 AC4 / COLLAB-014 AC4: purge-unconfirmed status (no device secrets). -->
	<section aria-label="Participant purge status">
		<h3>Purge confirmation</h3>
		<ul class="scene-list" data-testid="cache-purge-status">
			{#each privacyStatus as entry (entry.participantActorId)}
				<li class="scene-card" data-testid={`purge-status-${entry.participantActorId}`}>
					<div>
						<strong>{entry.participantActorId}</strong>
						<div class="meta">{entry.message}</div>
					</div>
					<span class="meta" class:unavailable={entry.status === 'purge-unconfirmed'}>{entry.status}</span>
				</li>
			{/each}
		</ul>
	</section>
</section>

<style>
	/* CANONICAL secondary card recipe; the demo controls + status rows are tokenized to the warm set. */
	.cwrap {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--space-5);
		box-shadow: var(--shadow-sm);
	}
	.cwrap h2 {
		margin: 0;
		font-family: var(--font-display);
		font-weight: var(--font-weight-bold);
		font-size: var(--text-lg);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text-primary);
	}
	.cwrap :global(h3) {
		margin: 0 0 var(--space-1);
		font-size: var(--text-md);
	}
	.cwrap :global(.meta) {
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
	}
	.cwrap :global(.scene-list) {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1-5);
	}
	.cwrap :global(.scene-card) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		flex-wrap: wrap;
		padding: var(--space-2) var(--space-3);
		background: var(--color-surface-alt);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}
	.cwrap :global(.unavailable) {
		color: var(--color-status-warning-text);
		font-weight: var(--font-weight-semibold);
	}
	.cwrap :global(select) {
		min-height: var(--touch-target-min);
		padding: 0 var(--space-3);
		background: var(--color-surface-sunken);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font: inherit;
	}
	.cwrap :global(label) {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-4);
		align-items: center;
		margin: var(--space-2) 0;
	}
</style>
