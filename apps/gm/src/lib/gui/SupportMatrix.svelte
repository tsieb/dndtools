<script lang="ts">
	import { WEB_SUPPORT_MATRIX } from '@dndtools/core';

	// PLAT-016: render the published web/PWA cached read/write support matrix. The matrix is a
	// data artifact owned by the Processing Core (Contract 1); this view only presents it. Each
	// domain shows its support level and required fallback (AC1) plus the auth, cache/update,
	// and eviction-recovery policy (AC2). Native-only features are listed as unsupported with an
	// action-oriented reason, never attempting a native path (AC5, fail closed).
	const matrix = WEB_SUPPORT_MATRIX;

	function levelLabel(level: string): string {
		switch (level) {
			case 'cached-read-write':
				return 'Cached read + write';
			case 'cached-read':
				return 'Cached read';
			case 'queued-write':
				return 'Queued write';
			case 'unavailable':
				return 'Unavailable';
			default:
				return 'Unsupported';
		}
	}
</script>

<section class="cwrap" aria-label="Web/PWA support matrix" data-testid="support-matrix">
	<h2>Web / PWA support matrix</h2>
	<p class="meta">
		Published cached read/write support for the web release (v{matrix.version}). Each domain
		declares its support level, offline behavior, and the fallback shown when degraded.
	</p>

	<!-- The wide matrix scrolls horizontally inside its own track rather than forcing the centered
	     .app-main column wider on narrow viewports. A horizontally-scrollable region must be keyboard
	     reachable (axe scrollable-region-focusable): tabindex makes it focusable, role+label name it. -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<div class="table-scroll" tabindex="0" role="region" aria-label="Web / PWA support matrix (scroll horizontally to see all columns)">
	<table class="matrix-table">
		<thead>
			<tr>
				<th scope="col">Domain</th>
				<th scope="col">Support</th>
				<th scope="col">Offline</th>
				<th scope="col">Auth</th>
				<th scope="col">Fallback</th>
			</tr>
		</thead>
		<tbody>
			{#each matrix.domains as domain (domain.id)}
				<tr data-testid={`matrix-domain-${domain.id}`}>
					<th scope="row">{domain.label}</th>
					<td data-testid={`matrix-level-${domain.id}`} data-level={domain.support}>
						{levelLabel(domain.support)}
					</td>
					<td>{domain.offline}</td>
					<td data-testid={`matrix-auth-${domain.id}`}>{domain.auth}</td>
					<td>{domain.fallback}</td>
				</tr>
			{/each}
		</tbody>
	</table>
	</div>

	<details class="matrix-policy">
		<summary>Cache, quota, and eviction-recovery policy</summary>
		<ul class="scene-list">
			{#each matrix.domains as domain (domain.id)}
				<li class="scene-card" data-testid={`matrix-policy-${domain.id}`}>
					<strong>{domain.label}</strong>
					<div class="meta">queued writes: {domain.queuedWritePolicy}</div>
					<div class="meta">cache/update: {domain.cachePolicy}</div>
					<div class="meta">eviction recovery: {domain.evictionRecovery}</div>
				</li>
			{/each}
		</ul>
	</details>

	<h3>Unsupported platform features</h3>
	<p class="meta">
		These depend on native-only services and fail closed on web/PWA: they report unsupported
		rather than attempting a native path.
	</p>
	<ul class="scene-list" data-testid="matrix-unsupported">
		{#each matrix.unsupportedFeatures as feature (feature.id)}
			<li class="scene-card" data-testid={`matrix-unsupported-${feature.id}`}>
				<strong>{feature.label}</strong>
				<span class="meta unavailable"> unsupported</span>
				<div class="meta">{feature.reason}</div>
			</li>
		{/each}
	</ul>
</section>

<style>
	/* CANONICAL secondary card recipe. */
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
	.cwrap h3 {
		margin: var(--space-2) 0 var(--space-1);
		font-size: var(--text-md);
	}
	.cwrap :global(.meta) {
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
	}
	/* Preserve the "unsupported" warning cue (re-declared so it out-specifies the .meta rule). */
	.cwrap :global(.unavailable) {
		color: var(--color-status-warning-text);
	}
	.table-scroll {
		overflow-x: auto;
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
		flex-direction: column;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-3);
		background: var(--color-surface-alt);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}
	.cwrap :global(summary) {
		cursor: pointer;
		font-weight: var(--font-weight-semibold);
	}
</style>
