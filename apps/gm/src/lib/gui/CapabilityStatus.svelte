<script lang="ts">
	import type { PlatformProfile, PlatformServiceCapabilities } from '@dndtools/core';

	// PLAT-004 / PLAT-002 / PLAT-005: render the resolved platform profile's capability
	// descriptor. Feature surfaces use these facts to show degraded capability status instead of
	// attempting an unavailable path (PLAT-004 AC2). The descriptor is resolved by the shell
	// (PLAT-001); this view never sniffs the platform itself.
	const { profile }: { profile: PlatformProfile } = $props();

	type ServiceKey = keyof PlatformServiceCapabilities;

	const SERVICE_LABELS: ReadonlyArray<{ key: ServiceKey; label: string }> = [
		{ key: 'trustedFilesystem', label: 'Trusted filesystem vault' },
		{ key: 'nativeFilePicker', label: 'Native file picker' },
		{ key: 'appUpdates', label: 'App updates' },
		{ key: 'protocolHandler', label: 'Protocol handler' },
		{ key: 'windowTitlebarControls', label: 'Titlebar controls' },
		{ key: 'nativeContextMenus', label: 'Native context menus' },
		{ key: 'fileWatching', label: 'File watching' },
		{ key: 'mcpSidecar', label: 'MCP sidecar' },
		{ key: 'osCredentialStore', label: 'OS credential store' },
		{ key: 'multiWindow', label: 'Multi-window' },
		{ key: 'nativeShareImport', label: 'Native share / import' },
		{ key: 'virtualKeyboardInsets', label: 'Virtual-keyboard insets' },
		{ key: 'serviceWorkerCache', label: 'Service-worker cache' },
		{ key: 'cloudCache', label: 'Cloud cache' },
	];

	function statusLabel(value: string): string {
		if (value === 'available') return 'available';
		if (value === 'unavailable') return 'unavailable (deferred)';
		return 'unsupported';
	}
</script>

<section class="cwrap" aria-label="Platform capability status" data-testid="capability-status">
	<h2>Platform capability status</h2>
	<p class="meta" data-testid="capability-profile">
		Active profile: <strong>{profile.id}</strong> • viewport {profile.viewportClass} • storage
		{profile.storage} • shell {profile.shellImplemented ? 'implemented' : 'deferred'}
	</p>
	<ul class="scene-list" data-testid="capability-list">
		{#each SERVICE_LABELS as service (service.key)}
			{@const status = profile.capabilities[service.key]}
			<li class="scene-card" data-testid={`capability-${service.key}`}>
				<span>{service.label}</span>
				<span
					class="meta"
					class:unavailable={status !== 'available'}
					data-status={status}
					data-testid={`capability-status-${service.key}`}
				>
					{statusLabel(status)}
				</span>
			</li>
		{/each}
	</ul>
</section>

<style>
	.cwrap {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.cwrap h2 {
		margin: 0;
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
		gap: var(--space-1);
	}
	.cwrap :global(.scene-card) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		padding: var(--space-1-5) var(--space-3);
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}
	.cwrap :global([data-status='available']) {
		color: var(--color-status-success-text);
	}
	.cwrap :global(.unavailable) {
		color: var(--color-status-warning-text);
	}
</style>
