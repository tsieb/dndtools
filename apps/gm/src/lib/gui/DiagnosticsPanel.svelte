<script lang="ts">
	import {
		exportSupportBundle,
		getDmDiagnostics,
		type DiagnosticsContextInput,
		type SupportBundle,
	} from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';

	const { context }: { context: DiagnosticsContextInput } = $props();
	const runtime = useRuntime();

	// PLAT-009: the DM/admin diagnostics view. The Processing Core enforces the
	// permission boundary (Contract 1/3): a non-DM actor without an explicit
	// diagnostics-admin grant gets a `denied` result, so this surface fails closed even
	// though the /settings route itself is reachable by all roles.
	const diagnostics = $derived(
		getDmDiagnostics(runtime.state.permissions, context, runtime.activeActorId),
	);

	// Support-bundle export is a separate, opt-in action. Secrets/paths are redacted by
	// default; the toggle is the explicit user opt-in required by PLAT-009 AC2.
	let includeSecrets = $state(false);
	let bundle = $state<SupportBundle | null>(null);
	let exportError = $state<string | null>(null);

	function runExport(): void {
		const result = exportSupportBundle(runtime.state.permissions, context, runtime.activeActorId, {
			includeSecrets,
		});
		if (result.kind === 'bundle') {
			bundle = result;
			exportError = null;
		} else {
			bundle = null;
			exportError =
				result.reason === 'unknown-actor'
					? 'Unknown actor.'
					: 'Diagnostics export requires DM authority or an explicit diagnostic grant.';
		}
	}

	const bundleJson = $derived(bundle ? JSON.stringify(bundle, null, 2) : '');
</script>

<section data-testid="diagnostics-panel" aria-label="System diagnostics">
	<h2>System health &amp; diagnostics</h2>
	{#if diagnostics.kind === 'denied'}
		<p class="meta" role="status" data-testid="diagnostics-denied">
			Diagnostics are available to the DM or an actor with an explicit diagnostic grant.
		</p>
	{:else}
		<p class="meta" data-testid="diagnostics-health">
			Health: <strong data-testid="diagnostics-health-level">{diagnostics.health}</strong> • app
			{diagnostics.appVersion} • profile {diagnostics.platformProfileId} •
			{diagnostics.online ? 'online' : 'offline'}
		</p>

		<section aria-label="Sync and source status">
			<h3>Sync &amp; source status</h3>
			<ul class="scene-list" data-testid="diagnostics-sources">
				{#each diagnostics.syncSources as source (source.sourceId)}
					<li class="scene-card" data-testid={`diagnostics-source-${source.sourceId}`}>
						<div>
							<strong>{source.displayName}</strong>
							<div class="meta">
								{source.kind} • {source.state} • {source.pendingOperations} pending
							</div>
							{#if source.remediation}
								<div class="meta" data-testid={`diagnostics-source-remediation-${source.sourceId}`}>
									{source.remediation}
								</div>
							{/if}
						</div>
						<span class="meta" class:unavailable={source.state === 'error'}>{source.state}</span>
					</li>
				{/each}
			</ul>
		</section>

		<section aria-label="Platform capability status">
			<h3>Platform capabilities</h3>
			<ul class="scene-list" data-testid="diagnostics-capabilities">
				{#each diagnostics.capabilities as capability (capability.id)}
					<li class="scene-card" data-testid={`diagnostics-capability-${capability.id}`}>
						<div>
							<strong>{capability.displayName}</strong>
							{#if capability.detail}
								<div class="meta">{capability.detail}</div>
							{/if}
						</div>
						<span class="meta" class:unavailable={capability.availability === 'unsupported'}>
							{capability.availability}
						</span>
					</li>
				{/each}
			</ul>
		</section>

		<section aria-label="Schema and migration health">
			<h3>Schema &amp; migration</h3>
			<ul class="scene-list" data-testid="diagnostics-schema">
				{#each diagnostics.schema as entry (entry.documentId)}
					<li class="scene-card" data-testid={`diagnostics-schema-${entry.documentId}`}>
						<div>
							<strong>{entry.documentId}</strong>
							<div class="meta">
								v{entry.currentVersion ?? '—'} → v{entry.targetVersion}
							</div>
						</div>
						<span class="meta" class:unavailable={entry.blocked}>
							{#if entry.blocked}upgrade-required{:else if entry.migrationRequired}migration pending{:else}current{/if}
						</span>
					</li>
				{/each}
			</ul>
		</section>

		<section aria-label="Support bundle export">
			<h3>Export support bundle</h3>
			<label class="select-widget">
				<input
					type="checkbox"
					bind:checked={includeSecrets}
					data-testid="diagnostics-include-secrets"
				/>
				Include raw secrets and paths (not recommended)
			</label>
			<div class="toolbar">
				<button class="button" onclick={runExport} data-testid="diagnostics-export">
					Generate support bundle
				</button>
			</div>
			{#if exportError}
				<p class="error" role="alert" data-testid="diagnostics-export-error">{exportError}</p>
			{/if}
			{#if bundle}
				<p class="meta" data-testid="diagnostics-bundle-secrets">
					Secrets included: {bundle.secretsIncluded ? 'yes' : 'no (redacted)'}
				</p>
				<pre class="export-preview" data-testid="diagnostics-bundle">{bundleJson}</pre>
			{/if}
		</section>
	{/if}
</section>
