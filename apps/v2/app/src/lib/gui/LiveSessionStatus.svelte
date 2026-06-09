<script lang="ts">
	import {
		buildPresenceEntry,
		deriveLiveSessionStatus,
		projectSessionPresence,
		sessionStatusAnnouncement,
		type PresenceEntry,
		type PresenceState,
	} from '@dndtools/v2-core';
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
	<section data-testid="live-session-status" aria-label="Live session status and presence">
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
	.meta {
		color: var(--color-text-muted, #666);
	}
	.stale {
		color: var(--color-danger, #b00020);
	}
	.status-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-1, 0.25rem);
		border: 1px solid var(--color-border, #ddd);
		border-radius: var(--radius-1, 0.25rem);
		padding: var(--space-2, 0.5rem);
		margin: var(--space-1, 0.25rem) 0;
	}
	.sim {
		display: flex;
		flex-direction: column;
		gap: var(--space-1, 0.25rem);
		margin: var(--space-2, 0.5rem) 0;
	}
	.presence-list {
		margin: 0;
		padding-left: var(--space-3, 1rem);
	}
</style>
