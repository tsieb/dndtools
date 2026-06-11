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
	<section data-testid="participant-status" aria-label="Your session status">
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
