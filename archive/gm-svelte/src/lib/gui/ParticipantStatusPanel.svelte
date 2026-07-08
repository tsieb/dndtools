<script lang="ts">
	import {
		getParticipantStatus,
		type DiagnosticsContextInput,
		type ParticipantStatusInput,
	} from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';

	const {
		context,
		input,
	}: {
		context: Pick<DiagnosticsContextInput, 'capabilities'>;
		input: ParticipantStatusInput;
	} = $props();
	const runtime = useRuntime();

	// PLAT-017: participant-safe status. The Processing Core builds a view that contains
	// only generic, action-oriented states and messages — no hidden entity names, no
	// source paths, no DM diagnostics, and no support bundle. The DM is intentionally
	// denied here (they use the diagnostics panel instead).
	const status = $derived(
		getParticipantStatus(
			runtime.state.permissions,
			runtime.state.session,
			context,
			runtime.activeActorId,
			input,
		),
	);
</script>

{#if status.kind === 'participant-status'}
	<section class="cwrap" data-testid="participant-status" aria-label="Your session status">
		<h2>Your session status</h2>

		<div class="scene-list">
			<div class="scene-card" data-testid="participant-connection">
				<div>
					<strong>Connection</strong>
					<div class="meta" data-testid="participant-connection-message">
						{status.connectionMessage}
					</div>
				</div>
				<span class="meta" data-testid="participant-connection-state">{status.connection}</span>
			</div>

			<div class="scene-card" data-testid="participant-sync">
				<div>
					<strong>Sync</strong>
					<div class="meta">{status.syncMessage}</div>
				</div>
				<span class="meta" data-testid="participant-sync-state">{status.sync}</span>
			</div>

			<div class="scene-card" data-testid="participant-delivery">
				<div>
					<strong>Shared content</strong>
					<div class="meta" data-testid="participant-delivery-message">
						{status.deliveryMessage}
					</div>
				</div>
				<span class="meta" data-testid="participant-delivery-state">{status.delivery}</span>
			</div>
		</div>

		<section aria-label="Feature availability on your device">
			<h3>On your device</h3>
			<ul class="scene-list" data-testid="participant-capabilities">
				{#each status.capabilities as capability (capability.id)}
					<li class="scene-card" data-testid={`participant-capability-${capability.id}`}>
						<div>
							<strong>{capability.displayName}</strong>
							{#if capability.note}
								<div class="meta">{capability.note}</div>
							{/if}
						</div>
						<span class="meta" class:unavailable={capability.availability === 'unsupported'}>
							{capability.availability}
						</span>
					</li>
				{/each}
			</ul>
		</section>
	</section>
{/if}

<style>
	/* CANONICAL secondary card recipe; nested status rows recede onto the calm tier-3 surface. */
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
</style>
