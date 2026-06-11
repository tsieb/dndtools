<script lang="ts">
	import {
		resolveSessionPrivacy,
		type DepartedParticipantRecord,
		type PurgeOutcome,
	} from '@dndtools/core';
	import Icon from '$lib/gui/Icon.svelte';
	import { useRuntime } from '$lib/state/runtime-context';

	/**
	 * UX-PERM-008 — cache purge and session privacy status (DM view): per-departed-participant
	 * purge-status rows (Purged / Purge unconfirmed / Purge failed) with the advisory copy, a
	 * "Review grants" remediation link for failures, the 24 h archive window, and the all-clear
	 * empty state. The Processing Core resolves the entire model (`resolveSessionPrivacy`) and is
	 * DM-ONLY DEFAULT-DENY: for a player/observer the resolver returns `null` and this surface
	 * renders NOTHING (the panel must not exist for them — PERM-014). No device secrets exist
	 * anywhere in the model by construction.
	 *
	 * The live participant-departure transport is deferred (ADR-014), so the departures rendered
	 * here are deterministic local demo records with DM-only simulation controls — the same seam +
	 * visibility idiom the COLLAB privacy surfaces use.
	 */
	const runtime = useRuntime();

	// Deterministic demo clock so the 24 h window logic is stable (no platform clock in the GUI).
	const DEMO_NOW = '2026-06-10T12:00:00.000Z';

	// Demo departures: one recent unconfirmed (the AC1 case), one recent purged, and one departed
	// 25 h ago that the 24 h window has archived. Outcomes are switchable below to demo all states.
	let outcomes = $state<Record<string, PurgeOutcome>>({
		'actor-player': 'purge-unconfirmed',
		'actor-player-2': 'purged',
	});

	const departures = $derived<DepartedParticipantRecord[]>([
		{
			actorId: 'actor-player',
			displayName: 'Demo Player',
			departedAt: '2026-06-10T10:00:00.000Z',
			outcome: outcomes['actor-player'] ?? 'purge-unconfirmed',
		},
		{
			actorId: 'actor-player-2',
			displayName: 'Demo Player 2',
			departedAt: '2026-06-10T09:00:00.000Z',
			outcome: outcomes['actor-player-2'] ?? 'purged',
		},
		// Archived by the 24 h window: departed 25 h before the demo clock — never rendered.
		{
			actorId: 'actor-player-3',
			displayName: 'Demo Player 3',
			departedAt: '2026-06-09T11:00:00.000Z',
			outcome: 'purged',
		},
	]);

	// The single DM-gated choke point: null ⇒ this surface does not exist for the active actor.
	const view = $derived(
		resolveSessionPrivacy(runtime.state.permissions, runtime.activeActorId, departures, DEMO_NOW),
	);

	function setOutcome(actorId: string, outcome: PurgeOutcome): void {
		outcomes = { ...outcomes, [actorId]: outcome };
	}
</script>

{#if view}
	<section
		class="scene-card"
		data-testid="session-privacy-status"
		aria-label="Session privacy status"
	>
		<h3>Session privacy</h3>
		<p class="meta">
			Cache-purge confirmation for participants who left or were removed in the last 24 hours.
			Older rows are archived automatically{view.archivedCount > 0
				? ` (${view.archivedCount} archived)`
				: ''}.
		</p>

		{#if view.allClear}
			<!-- UX-PERM-008 AC2: every departed participant confirmed purged ⇒ the empty-state copy. -->
			<p class="meta" data-testid="privacy-empty-state" role="status">
				{view.emptyStateMessage}
			</p>
		{/if}

		{#if !view.allClear}
			<ul class="scene-list" data-testid="privacy-rows">
				{#each view.rows as row (row.actorId)}
					<li class="scene-card privacy-row" data-testid={`privacy-row-${row.actorId}`}>
						<div class="privacy-row-head">
							<strong>{row.displayName}</strong>
							<!-- Status chip: distinct icon shape + text label, never color alone. -->
							<span
								class={`privacy-chip privacy-chip-${row.tone}`}
								role="status"
								data-testid={`privacy-status-${row.actorId}`}
							>
								<Icon
									name={row.tone === 'positive'
										? 'success'
										: row.tone === 'warning'
											? 'warning'
											: 'error'}
									size="micro"
								/>
								{row.statusLabel}
							</span>
						</div>
						{#if row.advisory}
							<!-- Advisory copy only — never keys, paths, or device identifiers (AC1). -->
							<p class="meta" data-testid={`privacy-advisory-${row.actorId}`}>{row.advisory}</p>
						{/if}
						{#if row.reviewGrants}
							<a href="#grant-manager" data-testid={`privacy-review-grants-${row.actorId}`}>
								Review grants
							</a>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}

		<!-- DM-only demo controls (transport deferred per ADR-014): simulate each device's outcome. -->
		<div class="privacy-demo-controls">
			{#each ['actor-player', 'actor-player-2'] as actorId (actorId)}
				<label class="meta">
					Simulate {actorId} purge result
					<select
						data-testid={`privacy-simulate-${actorId}`}
						value={outcomes[actorId]}
						onchange={(event) => setOutcome(actorId, event.currentTarget.value as PurgeOutcome)}
					>
						<option value="purged">purged</option>
						<option value="purge-unconfirmed">purge-unconfirmed</option>
						<option value="purge-failed">purge-failed</option>
					</select>
				</label>
			{/each}
		</div>
	</section>
{/if}

<style>
	.privacy-row-head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.privacy-chip {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		height: 20px;
		padding: 0 var(--space-1);
		border-radius: var(--radius-sm);
		border: 1px solid var(--color-border);
		font-size: var(--text-xs);
		line-height: 1;
	}
	.privacy-chip-positive {
		border-color: var(--color-status-success);
		background: var(--color-status-success-subtle);
		color: var(--color-status-success-text);
	}
	.privacy-chip-warning {
		border-color: var(--color-status-warning);
		background: var(--color-status-warning-subtle);
		color: var(--color-status-warning-text);
	}
	.privacy-chip-critical {
		border-color: var(--color-status-error);
		background: var(--color-status-error-subtle);
		color: var(--color-status-error-text);
	}
	.privacy-demo-controls {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
		margin-top: var(--space-2);
	}
	.privacy-demo-controls select {
		min-height: 32px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-surface-raised);
		color: var(--color-text-primary);
	}
	:global(html[data-input-modality='touch']) .privacy-demo-controls select {
		min-height: var(--touch-target-min);
	}
</style>
