<script lang="ts">
	import {
		deriveAssetAvailability,
		previewMapImport,
		type MapImportElementKind,
		type MapImportPreview,
		type MapProjectionKind,
		type SceneVisibility,
	} from '@dndtools/core';
	import { SvelteSet } from 'svelte/reactivity';
	import { useRuntime } from '$lib/state/runtime-context';

	/**
	 * MAP-001 / MAP-002 / MAP-020 — the DM map authoring + safe import surface.
	 *
	 * MAP-001: create a map entity (name, scale, projection, default visibility, initial layers). The
	 * form dispatches a single `map.create` Processing-Core command; default visibility fails closed to
	 * `dm-only` when left unspecified.
	 *
	 * MAP-002: import a native image/SVG as a CONTENT-ADDRESSED asset, or an external scene format that
	 * requires a DECLARED ADAPTER. An undeclared external format is rejected fail-closed.
	 *
	 * MAP-020: import is a TRANSACTION with a PREVIEW first. The DM sees the adapter capability summary
	 * and per-element diagnostics (importable / lossy / unsupported) BEFORE committing. Cancelling from
	 * preview writes nothing (rollback); committing applies the staged state atomically.
	 *
	 * The whole panel is DM-only authoring; the GUI dispatches command intents and renders core query
	 * results and the pure preview model — it never touches storage directly (Contract 1).
	 */
	const runtime = useRuntime();

	const actor = $derived(runtime.state.permissions.actors[runtime.activeActorId]);
	const isDm = $derived(actor?.role === 'dm');

	let busy = $state(false);

	// --- MAP-001: create-map form state ------------------------------------------------------------
	let mapName = $state('');
	let scaleUnits = $state('');
	let scaleUnit = $state('miles');
	let projectionKind = $state<MapProjectionKind>('flat');
	let mapVisibility = $state<SceneVisibility>('dm-only');

	// --- MAP-002 / MAP-020: import form state ------------------------------------------------------
	type ImportMode = 'native' | 'external';
	let importMode = $state<ImportMode>('native');
	// A native asset: a tiny deterministic byte payload (a stand-in for file bytes; ADR-014 keeps
	// binary handling prototype-appropriate — the hash + metadata is the deliverable).
	let assetName = $state('battlemap.png');
	let assetMime = $state('image/png');
	// External import: the declared format id and the element kinds the file declares.
	let externalFormat = $state('vtt-scene');
	const ALL_ELEMENTS: MapImportElementKind[] = [
		'dimensions',
		'grid',
		'background-image',
		'walls',
		'lights',
		'notes',
		'tokens',
	];
	const selectedElements = new SvelteSet<MapImportElementKind>([
		'dimensions',
		'grid',
		'walls',
		'lights',
	]);

	// The staged preview. Set when the DM presses "Preview import"; cleared on cancel/commit. While a
	// preview is held, NOTHING is committed — this is the transaction's staging phase (MAP-020).
	let preview = $state<MapImportPreview | null>(null);

	const adapterFormats = $derived(runtime.mapImportAdapters.formats());

	function toggleElement(kind: MapImportElementKind) {
		if (selectedElements.has(kind)) selectedElements.delete(kind);
		else selectedElements.add(kind);
	}

	// A deterministic byte payload derived from the asset name, so the same name always content-
	// addresses to the same asset id (dedupe is observable in the UI). Stand-in for real file bytes.
	function bytesForName(name: string): number[] {
		const bytes: number[] = [137, 80, 78, 71]; // a PNG-ish signature prefix
		for (let i = 0; i < name.length; i += 1) bytes.push(name.charCodeAt(i) & 0xff);
		return bytes;
	}

	async function createMap(event: SubmitEvent) {
		event.preventDefault();
		const name = mapName.trim();
		if (!name || busy) return;
		busy = true;
		try {
			const units = Number(scaleUnits);
			const scale =
				scaleUnits.trim().length > 0 && Number.isFinite(units) && units > 0
					? { unitsPerMap: units, unit: scaleUnit.trim() || 'units' }
					: null;
			await runtime.dispatch({
				type: 'map.create',
				actorId: runtime.activeActorId,
				payload: {
					name,
					visibility: mapVisibility,
					scale,
					projection: { kind: projectionKind, rotationDegrees: 0 },
					initialLayers: [{ name: 'Base', category: 'base', visibility: mapVisibility }],
				},
			});
			mapName = '';
			scaleUnits = '';
		} finally {
			busy = false;
		}
	}

	// MAP-020 staging: build the preview WITHOUT mutating any state. The DM reviews it before commit.
	function runPreview(event: SubmitEvent) {
		event.preventDefault();
		const now = new Date().toISOString();
		if (importMode === 'native') {
			preview = previewMapImport(runtime.mapImportAdapters, {
				formatId: null,
				asset: {
					bytes: Uint8Array.from(bytesForName(assetName.trim() || 'asset')),
					mimeType: assetMime,
					fileName: assetName.trim() || 'asset',
				},
				declaredElements: [],
				importedBy: runtime.activeActorId,
				importedAt: now,
			});
		} else {
			preview = previewMapImport(runtime.mapImportAdapters, {
				formatId: externalFormat.trim(),
				declaredElements: [...selectedElements],
				importedBy: runtime.activeActorId,
				importedAt: now,
			});
		}
	}

	// MAP-020 rollback: discarding the preview writes nothing. The prior state is byte-identical.
	function cancelImport() {
		preview = null;
	}

	// MAP-020 commit: apply the staged import as a single Processing-Core transaction.
	async function commitImport() {
		if (!preview || !preview.ok || busy) return;
		busy = true;
		try {
			const payload =
				importMode === 'native'
					? {
							mapName: assetName.trim() || 'Imported Map',
							formatId: null,
							bytes: bytesForName(assetName.trim() || 'asset'),
							asset: { mimeType: assetMime, fileName: assetName.trim() || 'asset' },
							declaredElements: [],
						}
					: {
							mapName: `Imported ${externalFormat}`,
							formatId: externalFormat.trim(),
							bytes: null,
							asset: null,
							declaredElements: [...selectedElements],
						};
			await runtime.dispatch({
				type: 'map.commit-import',
				actorId: runtime.activeActorId,
				payload,
			});
			preview = null;
		} finally {
			busy = false;
		}
	}

	const importedMapCount = $derived(Object.keys(runtime.state.maps.maps).length);
	const assetCount = $derived(Object.keys(runtime.state.maps.assets).length);

	// SYNC-009 AC2: content-addressed asset availability. In the single-device prototype the device
	// has resolved exactly the asset BLOBS whose records are in the store; the Processing Core derives
	// the per-map availability model and the GUI renders an asset-missing/degraded state from it
	// (never embedding bytes — only ids and availability flags). A map that references an asset whose
	// blob has not synced to this device opens degraded rather than failing.
	const resolvedBlobIds = $derived(new Set(Object.keys(runtime.state.maps.assets)));
	const mapAvailability = $derived(
		Object.values(runtime.state.maps.maps)
			.filter((map) => map.assetIds.length > 0)
			.map((map) =>
				deriveAssetAvailability(
					{ id: map.id, assetIds: map.assetIds },
					runtime.state.maps.assets,
					resolvedBlobIds,
				),
			),
	);
</script>

{#if isDm}
	<section class="authoring" data-testid="map-authoring" aria-label="Map authoring">
		<h2>Map authoring</h2>
		<p class="meta" data-testid="map-store-summary">
			{importedMapCount} map{importedMapCount === 1 ? '' : 's'} · {assetCount} asset{assetCount === 1
				? ''
				: 's'} in the content-addressed store.
		</p>

		<!-- SYNC-009 AC2: asset availability. Each map's referenced assets sync by content hash; when a
		     blob has not synced to this device the map opens in an asset-missing/degraded state. -->
		{#if mapAvailability.length > 0}
			<section aria-label="Asset availability" data-testid="map-asset-availability">
				<h3>Asset availability</h3>
				<ul class="scene-list">
					{#each mapAvailability as availability (availability.mapId)}
						<li class="scene-card" data-testid={`asset-availability-${availability.mapId}`}>
							<div>
								<strong>{runtime.state.maps.maps[availability.mapId]?.name ?? availability.mapId}</strong
								>
								{#if availability.message}
									<div class="meta" data-testid={`asset-availability-message-${availability.mapId}`}>
										{availability.message}
									</div>
								{/if}
							</div>
							<span
								class="meta"
								class:unavailable={availability.availability !== 'available'}
								data-testid={`asset-availability-state-${availability.mapId}`}
							>
								{availability.availability}
							</span>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<!-- MAP-001: create a map entity. -->
		<form class="block" data-testid="create-map-form" onsubmit={createMap}>
			<h3>Create a map</h3>
			<label>
				Name
				<input
					data-testid="create-map-name"
					bind:value={mapName}
					placeholder="e.g. Sunless Citadel"
					required
				/>
			</label>
			<div class="row">
				<label>
					Scale
					<input
						data-testid="create-map-scale-units"
						bind:value={scaleUnits}
						inputmode="decimal"
						placeholder="120"
					/>
				</label>
				<label>
					Unit
					<input data-testid="create-map-scale-unit" bind:value={scaleUnit} placeholder="miles" />
				</label>
			</div>
			<div class="row">
				<label>
					Projection
					<select data-testid="create-map-projection" bind:value={projectionKind}>
						<option value="flat">Flat</option>
						<option value="equirectangular">Equirectangular</option>
						<option value="web-mercator">Web Mercator</option>
					</select>
				</label>
				<label>
					Default visibility
					<select data-testid="create-map-visibility" bind:value={mapVisibility}>
						<option value="dm-only">DM only</option>
						<option value="player-visible">Player visible</option>
						<option value="shared">Shared</option>
					</select>
				</label>
			</div>
			<button type="submit" class="button" data-testid="create-map-submit" disabled={busy || !mapName.trim()}>
				Create map
			</button>
		</form>

		<!-- MAP-002 / MAP-020: safe import with preview, diagnostics, and rollback. -->
		<form class="block" data-testid="import-form" onsubmit={runPreview}>
			<h3>Import a map</h3>
			<fieldset class="row" data-testid="import-mode">
				<legend>Source</legend>
				<label>
					<input type="radio" name="import-mode" value="native" bind:group={importMode} />
					Image / SVG (native)
				</label>
				<label>
					<input type="radio" name="import-mode" value="external" bind:group={importMode} />
					External scene format
				</label>
			</fieldset>

			{#if importMode === 'native'}
				<label>
					File name
					<input data-testid="import-asset-name" bind:value={assetName} />
				</label>
				<label>
					MIME type
					<select data-testid="import-asset-mime" bind:value={assetMime}>
						<option value="image/png">image/png</option>
						<option value="image/jpeg">image/jpeg</option>
						<option value="image/svg+xml">image/svg+xml</option>
						<option value="image/webp">image/webp</option>
						<!-- An external format chosen here has no native adapter and is rejected fail-closed. -->
						<option value="application/x-foundry">application/x-foundry (no adapter)</option>
					</select>
				</label>
			{:else}
				<label>
					Format id
					<input data-testid="import-external-format" bind:value={externalFormat} list="adapter-formats" />
					<datalist id="adapter-formats">
						{#each adapterFormats as format (format)}
							<option value={format}></option>
						{/each}
					</datalist>
				</label>
				<fieldset data-testid="import-elements">
					<legend>Declared elements</legend>
					{#each ALL_ELEMENTS as kind (kind)}
						<label class="element">
							<input
								type="checkbox"
								checked={selectedElements.has(kind)}
								data-testid={`import-element-${kind}`}
								onchange={() => toggleElement(kind)}
							/>
							{kind}
						</label>
					{/each}
				</fieldset>
			{/if}

			<button type="submit" class="button secondary" data-testid="import-preview-submit" disabled={busy}>Preview import</button>
		</form>

		<!-- MAP-020: the preview surface. The transaction is staged here; nothing is committed yet. -->
		{#if preview}
			<section class="preview" data-testid="import-preview" aria-label="Import preview">
				<h3>Import preview</h3>
				{#if !preview.ok}
					<p class="error" role="alert" data-testid="import-preview-error">{preview.message}</p>
					<button type="button" class="button secondary" data-testid="import-cancel" onclick={cancelImport}>Dismiss</button>
				{:else}
					{#if preview.capabilitySummary}
						<div data-testid="import-capability-summary">
							<h4>Adapter: {preview.capabilitySummary.displayName}</h4>
							<p class="meta">
								Imports: {preview.capabilitySummary.importable.join(', ') || 'none'} ·
								Lossy: {preview.capabilitySummary.lossy.join(', ') || 'none'} ·
								Unsupported: {preview.capabilitySummary.unsupported.join(', ') || 'none'} ·
								Blocked: {preview.capabilitySummary.blocked.join(', ') || 'none'}
							</p>
						</div>
					{/if}
					{#if preview.asset}
						<p class="meta" data-testid="import-asset-preview">
							Asset {preview.asset.fileName} · {preview.asset.byteLength} bytes · id
							<code>{preview.asset.id}</code>
						</p>
					{/if}
					{#if preview.diagnostics.length > 0}
						<ul class="diagnostics" data-testid="import-diagnostics">
							{#each preview.diagnostics as diag (diag.kind)}
								<li data-testid={`import-diagnostic-${diag.kind}`} data-support={diag.support}>
									<strong>{diag.kind}</strong>: {diag.support} — {diag.message}
								</li>
							{/each}
						</ul>
					{/if}
					{#if preview.droppedElements.length > 0}
						<p class="meta warn" data-testid="import-dropped">
							Dropped (reported, not silently lost): {preview.droppedElements.join(', ')}
						</p>
					{/if}
					<div class="row">
						<button type="button" class="button" data-testid="import-commit" onclick={commitImport} disabled={busy}>
							Commit import
						</button>
						<button type="button" class="button secondary" data-testid="import-cancel" onclick={cancelImport} disabled={busy}>
							Cancel (rollback)
						</button>
					</div>
				{/if}
			</section>
		{/if}
	</section>
{/if}

<style>
	/* MAP-001/002/020 — the DM authoring + safe-import card. Reads as a supporting panel (flat
	   surface, eyebrow sub-headings) under the library, with the package form-control treatment. */
	.authoring {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding: var(--space-4);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
	}
	.authoring > h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--text-lg);
		letter-spacing: var(--tracking-tight);
	}
	.authoring h3 {
		margin: 0;
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--tracking-wider);
		text-transform: uppercase;
		/* Secondary, not tertiary: this small uppercase heading sits on the flat panel bg where
		   tertiary parchment ink is < 4.5:1 (axe color-contrast). Secondary clears it. */
		color: var(--color-text-secondary);
	}
	.authoring h4 {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-text-primary);
	}
	.block {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding-bottom: var(--space-3);
		border-bottom: 1px solid var(--color-border);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
	}
	label {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
	}
	label.element {
		flex-direction: row;
		align-items: center;
		gap: var(--space-1-5);
	}
	/* A label that directly wraps a radio/checkbox lays out inline (control beside its text). */
	.authoring label:has(input[type='radio']),
	.authoring label:has(input[type='checkbox']) {
		flex-direction: row;
		align-items: center;
		gap: var(--space-1-5);
	}
	/* Package Input / Select treatment: sunken field, strong resting border firming to the focus
	   token on keyboard focus (the global :focus-visible baseline still draws the gold ring). */
	.authoring input:not([type='radio']):not([type='checkbox']),
	.authoring select {
		min-height: var(--density-input-height);
		padding: var(--component-input-py) var(--component-input-px);
		background: var(--color-surface-sunken);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-sm);
		font: inherit;
	}
	.authoring input:focus-visible,
	.authoring select:focus-visible {
		border-color: var(--color-border-focus);
	}
	.authoring fieldset {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-4);
		margin: 0;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}
	.authoring legend {
		padding: 0 var(--space-1);
		font-size: var(--text-xs);
		letter-spacing: var(--tracking-wide);
		text-transform: uppercase;
		/* Secondary, not tertiary: small uppercase legend on the flat panel bg needs >= 4.5:1
		   (axe color-contrast); tertiary parchment ink falls short. */
		color: var(--color-text-secondary);
	}
	.meta {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
	}
	.warn {
		color: var(--color-status-warning-text);
	}
	.error {
		color: var(--color-status-error-text);
		font-weight: var(--font-weight-semibold);
	}
	.diagnostics {
		list-style: none;
		padding: 0;
		margin: var(--space-1) 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	/* MAP-020 — per-element import diagnostics carry the status hue beside the printed support word
	   (importable / lossy / unsupported), mirroring the ImportWizard support legend; colour is never
	   the sole signal. */
	.diagnostics li[data-support='importable'] {
		color: var(--color-status-success-text);
	}
	.diagnostics li[data-support='unsupported'] {
		color: var(--color-status-error-text);
	}
	.diagnostics li[data-support='lossy'] {
		color: var(--color-status-warning-text);
	}
	/* MAP-020 — the staged import preview reads as a sunken inset transaction surface. */
	.preview {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-3);
		background: var(--color-surface-sunken);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}
	.authoring button {
		align-self: flex-start;
	}
	code {
		font-size: var(--text-xs);
		font-family: var(--font-mono);
	}
</style>
