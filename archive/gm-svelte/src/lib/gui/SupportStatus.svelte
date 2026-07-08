<script lang="ts">
	import { summarizeProfileSupport, type PlatformProfileId } from '@dndtools/core';

	/**
	 * PLAT-014: the platform support-status surface. For the active platform profile it renders the
	 * declared parity / degradation / unsupported command lists from the core support-status
	 * artifact (`summarizeProfileSupport`). Degraded and unsupported entries show their reason and
	 * available fallback (PLAT-014 AC2). This view never derives support status itself — it renders
	 * the core artifact (Contract 1).
	 */
	const { profileId }: { profileId: PlatformProfileId } = $props();

	const summary = $derived(summarizeProfileSupport(profileId));
</script>

<section
	class="cwrap"
	aria-label="Platform support status"
	data-testid="support-status"
	data-profile={profileId}
>
	<h2>Platform support status</h2>
	<p class="meta">
		Command support for the <strong>{profileId}</strong> profile. Degraded and unsupported commands show
		why and what to do instead.
	</p>

	<h3>Parity</h3>
	<ul class="scene-list" data-testid="support-parity">
		{#each summary.parity as commandId (commandId)}
			<li class="scene-card" data-testid={`support-parity-${commandId}`}>
				<span>{commandId}</span>
				<span class="meta" data-status="parity">full parity</span>
			</li>
		{:else}
			<li class="meta" data-testid="support-parity-empty">No parity commands.</li>
		{/each}
	</ul>

	<h3>Degraded</h3>
	<ul class="scene-list" data-testid="support-degraded">
		{#each summary.degraded as entry (entry.commandId)}
			<li class="scene-card" data-testid={`support-degraded-${entry.commandId}`}>
				<div>
					<strong>{entry.label}</strong>
					<div class="meta" data-testid={`support-degraded-reason-${entry.commandId}`}>
						{entry.reason}
					</div>
					<div class="meta" data-testid={`support-degraded-fallback-${entry.commandId}`}>
						Fallback: {entry.fallback}
					</div>
				</div>
				<span class="meta unavailable" data-status="degraded">degraded</span>
			</li>
		{:else}
			<li class="meta" data-testid="support-degraded-empty">No degraded commands.</li>
		{/each}
	</ul>

	<h3>Unsupported</h3>
	<ul class="scene-list" data-testid="support-unsupported">
		{#each summary.unsupported as entry (entry.commandId)}
			<li class="scene-card" data-testid={`support-unsupported-${entry.commandId}`}>
				<div>
					<strong>{entry.label}</strong>
					<div class="meta" data-testid={`support-unsupported-reason-${entry.commandId}`}>
						{entry.reason}
					</div>
					<div class="meta" data-testid={`support-unsupported-fallback-${entry.commandId}`}>
						Fallback: {entry.fallback}
					</div>
				</div>
				<span class="meta unavailable" data-status="unsupported">
					unsupported{entry.exceptionAllowed ? ' (allowed)' : ''}
				</span>
			</li>
		{:else}
			<li class="meta" data-testid="support-unsupported-empty">No unsupported commands.</li>
		{/each}
	</ul>
</section>

<style>
	/* CANONICAL secondary card recipe; nested status rows recede onto the calm tier-3 surface. */
	.cwrap {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
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
	.cwrap h3 {
		margin: var(--space-2) 0 var(--space-1);
		font-size: var(--text-md);
	}
	.cwrap :global(.meta) {
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
	}
	/* Preserve the status colour cues (re-declared so they out-specify the .meta rule above). */
	.cwrap :global([data-status='parity']) {
		color: var(--color-status-success-text);
	}
	.cwrap :global(.unavailable) {
		color: var(--color-status-warning-text);
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
</style>
