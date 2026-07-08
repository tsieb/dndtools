<script lang="ts">
	import {
		buildPresenceEntry,
		deriveLiveSessionStatus,
		projectSessionPresence,
		sessionStatusAnnouncement,
		type PresenceEntry,
		type PresenceState,
	} from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';

	// COLLAB-003 / COLLAB-004: the PARTICIPANT-facing LIVE SESSION STATE + PRESENCE surface. When the DM
	// drives the live session (advances combat, rolls dice, advances a timer, delivers a handout, reveals a
	// map layer), connected participants share that state near-real-time. This surface renders, for the
	// active viewer:
	//   - the LIVE-SESSION STATUS (live / syncing / stale / reconnecting) the Processing Core derives from
	//     the connection + pending-update state (COLLAB-003 AC2). When the live channel is down or updates
	//     are pending/out-of-order, the surface is marked STALE so the participant knows their view may be
	//     behind.
	//   - the EPHEMERAL PRESENCE of co-participants (online status + device), projected FAIL CLOSED by the
	//     core so a participant the viewer may not see is never listed (COLLAB-004 AC1). Presence is rebuilt
	//     each connection and never replayed as authoritative history (COLLAB-004 AC2) — there is no durable
	//     presence here; it is a live snapshot.
	// Per ADR-014 there is no live transport in the first prototype, so connection state is a simulation
	// control and presence is a snapshot of the registered participants. All filtering/derivation happens in
	// the core; the GUI renders the computed view models only (Contract 1).
	const runtime = useRuntime();

	const actor = $derived(runtime.state.permissions.actors[runtime.activeActorId] ?? null);
	const isParticipant = $derived(actor?.role === 'player' || actor?.role === 'observer');

	// Simulated live-channel state for the prototype (no live transport per ADR-014).
	let connected = $state(true);
	let pendingUpdateCount = $state(0);
	let undeliverableUpdateCount = $state(0);

	const liveStatus = $derived(
		deriveLiveSessionStatus({
			connected,
			pendingUpdateCount,
			undeliverableUpdateCount,
		}),
	);

	// An ephemeral presence snapshot of the registered participants (online on a device). In the first
	// prototype this is derived from the actor list; a live transport would broadcast real presence. It is
	// NEVER persisted — it is rebuilt here every render, exactly the ephemeral contract.
	const NOW = '2026-06-05T12:00:00.000Z';
	const presence = $derived.by<PresenceState>(() => {
		const entries: Record<string, PresenceEntry> = {};
		for (const id of Object.keys(runtime.state.permissions.actors)) {
			entries[id] = buildPresenceEntry({ actorId: id, status: 'online', device: 'web', updatedAt: NOW });
		}
		return { entries, schemaVersion: 1 };
	});

	const projection = $derived(
		actor ? projectSessionPresence(presence, runtime.state.permissions, actor.id) : null,
	);

	// A11Y-006 — session event announcement. Nominal 'live' state is silent (sessionStatusAnnouncement
	// returns '' for the happy path) so the live region is only updated on degraded/stale transitions.
	let sessionAnnouncement = $state('');
	let _prevSessionKey = $state<string | null>(null);
	$effect(() => {
		const key = `${liveStatus.status}|${liveStatus.stale}`;
		if (key === _prevSessionKey) return;
		_prevSessionKey = key;
		sessionAnnouncement = sessionStatusAnnouncement(liveStatus.status, liveStatus.stale);
	});
</script>

<!-- A11Y-006 — session event live announcement. Nominal 'live' state is silent; stale/reconnecting
     transitions are announced once per distinct status change so the participant knows their view
     may be behind without being spammed on every render. -->
<div class="visually-hidden" aria-live="polite" aria-atomic="true" data-testid="session-announcement">{sessionAnnouncement}</div>

{#if isParticipant && actor}
	<section class="cwrap" data-testid="live-session-status" aria-label="Live session status and presence">
		<h2>Live session</h2>
		<p class="meta">
			Live session state (combat, dice, timers, handouts, and visible map updates) is shared in
			near-real-time. When the connection drops or updates are pending, your view is marked stale until
			it catches up.
		</p>

		<div class="status-card" data-testid="live-status">
			<strong>Status</strong>
			<span class="meta" data-testid="live-status-value" class:stale={liveStatus.stale}>
				{liveStatus.status}
			</span>
			<div class="meta" data-testid="live-status-message">{liveStatus.message}</div>
		</div>

		<fieldset class="sim">
			<legend>Simulate live channel</legend>
			<label>
				<input
					type="checkbox"
					data-testid="live-connected"
					checked={connected}
					onchange={(event) => {
						connected = (event.currentTarget as HTMLInputElement).checked;
					}}
				/>
				Connected
			</label>
			<label for="live-pending">Pending updates</label>
			<input
				id="live-pending"
				type="number"
				min="0"
				data-testid="live-pending"
				value={pendingUpdateCount}
				onchange={(event) => {
					pendingUpdateCount = Math.max(0, Number((event.currentTarget as HTMLInputElement).value) || 0);
				}}
			/>
			<label for="live-undeliverable">Out-of-order (held) updates</label>
			<input
				id="live-undeliverable"
				type="number"
				min="0"
				data-testid="live-undeliverable"
				value={undeliverableUpdateCount}
				onchange={(event) => {
					undeliverableUpdateCount = Math.max(0, Number((event.currentTarget as HTMLInputElement).value) || 0);
				}}
			/>
		</fieldset>

		{#if projection}
			<section aria-label="Participant presence">
				<h3>Who's here ({projection.visible.length})</h3>
				<ul class="presence-list" data-testid="presence-list">
					{#each projection.visible as presenceEntry (presenceEntry.actorId)}
						<li data-testid={`presence-${presenceEntry.actorId}`}>
							{runtime.state.permissions.actors[presenceEntry.actorId]?.displayName ??
								presenceEntry.actorId}
							<span class="meta">· {presenceEntry.status} · {presenceEntry.device}</span>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	</section>
{/if}

<style>
	/* Tier-3 "status strip": calmer than the tool cards (flat surface-alt fill, denser padding,
	   smaller title) — matches the package's session-live side panels. */
	.cwrap {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-4);
		background: var(--color-surface-alt);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
	}
	.cwrap :global(h2) {
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--text-base);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text-primary);
	}
	.cwrap :global(h3) {
		margin: 0;
		font-size: var(--text-md);
	}
	.meta {
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
	}
	.stale {
		color: var(--color-status-error-text);
	}
	.status-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface-raised);
		padding: var(--space-3);
	}
	.sim {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin: var(--space-2) 0;
	}
	.cwrap :global(button) {
		min-height: var(--touch-target-min);
		padding: 0 var(--space-3);
		background: var(--color-surface-sunken);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}
	.cwrap :global(select),
	.cwrap :global(input:not([type='checkbox'])) {
		min-height: var(--touch-target-min);
		padding: var(--space-1-5) var(--space-3);
		background: var(--color-surface-sunken);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
	}
	.sim {
		padding: var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}
	.sim legend {
		padding: 0 var(--space-1);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-secondary);
	}
	.presence-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.presence-list :global(li) {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1-5) var(--space-3);
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
	}
</style>
