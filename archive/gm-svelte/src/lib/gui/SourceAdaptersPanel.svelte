<script lang="ts">
	import {
		GOOGLE_DOCS_ADAPTER_CAPABILITY,
		SYNC_SOURCE_LIFECYCLE_STATES,
		deriveAuthorizationState,
		listSourceAdapterCapabilitySummaries,
		preflightSourceAdapter,
		type ContentNoteFeature,
		type SourceAdapterCapabilitySummary,
		type SyncSourceKind,
	} from '@dndtools/core';

	/**
	 * SYNC-003 / SYNC-004 / SYNC-005 / SYNC-015 / SYNC-016 — the SOURCE ADAPTER inspection surface.
	 *
	 * It renders the Processing-Core source-adapter registry: every declared adapter's CAPABILITY
	 * metadata (supported schema/source versions, auth modes, entity types, and per-feature transform
	 * fidelity), the EXPLICIT sync-state vocabulary (SYNC-016), and an interactive fail-closed PREFLIGHT
	 * + authorization-state demo. It reads NOTHING from raw storage or network and dispatches no command
	 * (Contract 1) — the live transports are deferred per ADR-014, so this is the seam + visibility only.
	 */

	const summaries = listSourceAdapterCapabilitySummaries();

	const FEATURE_LABEL: Record<ContentNoteFeature, string> = {
		'frontmatter-properties': 'Front matter properties',
		aliases: 'Aliases',
		tags: 'Tags',
		'inline-tags': 'Inline #tags',
		wikilinks: '[[wikilinks]]',
		'dndtools-namespaced-metadata': 'DND Tools metadata',
	};

	function featureLabels(features: ContentNoteFeature[]): string {
		return features.map((feature) => FEATURE_LABEL[feature]).join(', ') || 'none';
	}

	// SYNC-016 — interactive authorization-state demo for the remote (Google Docs) source. The state is
	// derived purely in the core from the auth posture; the GUI only renders it.
	let online = $state(true);
	let hasValidToken = $state(false);
	let tokenExpired = $state(false);
	const authState = $derived(
		deriveAuthorizationState(GOOGLE_DOCS_ADAPTER_CAPABILITY, {
			authMode: 'oauth',
			online,
			hasValidToken,
			tokenExpired,
		}),
	);

	// SYNC-015 — interactive fail-closed preflight demo. A lossy Google Docs write (front matter present)
	// is blocked until acknowledged; the core returns the explicit per-dimension rejections.
	let preflightKind = $state<SyncSourceKind>('google-docs');
	let includeFrontmatter = $state(true);
	let acknowledged = $state(false);
	const preflight = $derived(
		preflightSourceAdapter(preflightKind, {
			schemaVersion: 1,
			write: {
				presentFeatures: includeFrontmatter ? (['frontmatter-properties'] as const) : [],
				acknowledged,
			},
		}),
	);

	function summaryById(kind: SyncSourceKind): SourceAdapterCapabilitySummary | undefined {
		return summaries.find((summary) => summary.kind === kind);
	}
</script>

<section class="cwrap" data-testid="source-adapters-panel" aria-label="Sync source adapters">
	<h2>Source adapters</h2>
	<p class="meta">
		Every external source (local vault, Obsidian, Google Docs, and future sources) plugs in behind one
		adapter contract and transforms its content to and from canonical sync operations. Adapters declare
		typed capability metadata and fail closed for anything unsupported. Live transports are deferred;
		this surface shows the declared capabilities and explicit sync states.
	</p>

	<!-- SYNC-015: the declared capability registry. -->
	<section aria-label="Declared adapter capabilities">
		<h3>Declared capabilities</h3>
		<ul class="scene-list" data-testid="source-adapter-capabilities">
			{#each summaries as summary (summary.kind)}
				<li class="scene-card" data-testid={`source-adapter-${summary.kind}`}>
					<div>
						<strong>{summary.displayName}</strong>
						<div class="meta">{summary.summary}</div>
						<div class="meta">
							schema: {summary.supportedSchemaVersions.join(', ')} • source: {summary.supportedSourceVersions.join(
								', ',
							)} • auth: {summary.supportedAuthModes.join(', ')} • offline: {summary.offlineAvailability}
						</div>
						<div class="meta" data-testid={`source-adapter-supported-${summary.kind}`}>
							supported: {featureLabels(summary.supportedFeatures)}
						</div>
						{#if summary.lossyFeatures.length > 0}
							<div class="meta" data-testid={`source-adapter-lossy-${summary.kind}`}>
								lossy: {featureLabels(summary.lossyFeatures)}
							</div>
						{/if}
						{#if summary.unsupportedFeatures.length > 0}
							<div class="meta" data-testid={`source-adapter-unsupported-${summary.kind}`}>
								unsupported: {featureLabels(summary.unsupportedFeatures)}
							</div>
						{/if}
					</div>
					<span class="meta">
						{summary.canRead ? 'read' : ''}{summary.canRead && summary.canWrite ? ' + ' : ''}{summary.canWrite
							? 'write'
							: ''}
					</span>
				</li>
			{/each}
		</ul>
	</section>

	<!-- SYNC-016: the explicit sync-state vocabulary. -->
	<section aria-label="Explicit sync states">
		<h3>Explicit sync states</h3>
		<ul class="state-chips" data-testid="source-adapter-states">
			{#each SYNC_SOURCE_LIFECYCLE_STATES as state (state)}
				<li data-testid={`source-state-${state}`}>{state}</li>
			{/each}
		</ul>
	</section>

	<!-- SYNC-016: interactive authorization-state demo for the remote source. -->
	<section aria-label="Google Docs authorization state">
		<h3>Google Docs authorization</h3>
		<div class="controls">
			<label>
				<input type="checkbox" data-testid="auth-online" bind:checked={online} /> online
			</label>
			<label>
				<input type="checkbox" data-testid="auth-has-token" bind:checked={hasValidToken} /> valid token
			</label>
			<label>
				<input type="checkbox" data-testid="auth-token-expired" bind:checked={tokenExpired} /> token expired
			</label>
		</div>
		<p class="meta">
			State: <strong data-testid="auth-state">{authState.state}</strong>
		</p>
		<p class="meta" data-testid="auth-message">{authState.message}</p>
	</section>

	<!-- SYNC-015: interactive fail-closed preflight demo. -->
	<section aria-label="Fail-closed write preflight">
		<h3>Write preflight</h3>
		<div class="controls">
			<label>
				Source
				<select data-testid="preflight-source" bind:value={preflightKind}>
					{#each summaries as summary (summary.kind)}
						<option value={summary.kind}>{summary.displayName}</option>
					{/each}
				</select>
			</label>
			<label>
				<input type="checkbox" data-testid="preflight-frontmatter" bind:checked={includeFrontmatter} />
				note has front matter
			</label>
			<label>
				<input type="checkbox" data-testid="preflight-ack" bind:checked={acknowledged} /> acknowledge loss
			</label>
		</div>
		<p class="meta">
			Preflight: <strong data-testid="preflight-result">{preflight.ok ? 'allowed' : 'blocked'}</strong>
		</p>
		{#if !preflight.ok}
			<ul class="scene-list" data-testid="preflight-rejections">
				{#each preflight.rejections as rejection (rejection.reason)}
					<li class="scene-card" data-testid={`preflight-rejection-${rejection.reason}`}>
						<div class="meta">{rejection.message}</div>
					</li>
				{/each}
			</ul>
		{/if}
		{#if summaryById(preflightKind)}
			<p class="meta">
				{summaryById(preflightKind)!.displayName} can {summaryById(preflightKind)!.canWrite
					? 'write'
					: 'only read'}.
			</p>
		{/if}
	</section>
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
	.cwrap :global(h2),
	.cwrap :global(h3) {
		margin: 0;
	}
	.cwrap :global(h2) {
		font-family: var(--font-display);
		font-weight: var(--font-weight-bold);
		font-size: var(--text-lg);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text-primary);
	}
	.cwrap :global(h3) {
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
		flex-direction: column;
		gap: var(--space-1);
		padding: var(--space-3);
		background: var(--color-surface-alt);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}
	.cwrap :global(button),
	.cwrap :global(select) {
		min-height: var(--touch-target-min);
		padding: 0 var(--space-3);
		background: var(--color-surface-sunken);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		cursor: pointer;
		font: inherit;
	}
	.state-chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.state-chips li {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-full);
		padding: 0 var(--space-2);
		font-size: var(--text-2xs);
		color: var(--color-text-secondary);
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		align-items: center;
		margin: var(--space-1) 0;
	}
</style>
