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

<section aria-label="Platform support status" data-testid="support-status" data-profile={profileId}>
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
