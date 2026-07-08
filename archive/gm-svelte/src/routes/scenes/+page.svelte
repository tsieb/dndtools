<script lang="ts">
	import {
		buildWidgetPackageReviewSummary,
		exportWidgetPackage,
		listScenesForActor,
		type WidgetHostPermission,
		type WidgetPackageDefinition,
		type WidgetPackageRecord,
		type WidgetPackageReviewSummary,
	} from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';

	const runtime = useRuntime();

	const sampleNetworkPackage: WidgetPackageDefinition = {
		id: 'workspace.weather-panel',
		version: '1.0.0',
		displayName: 'Weather Panel',
		widgets: [
			{
				type: 'weather-panel',
				version: '1.0.0',
				displayName: 'Weather Panel',
				author: 'workspace',
				supportedProfiles: ['desktop', 'tablet', 'mobile', 'web'],
				defaultSize: { width: 260, height: 160 },
				minSize: { width: 180, height: 120 },
				resizePolicy: 'free',
				requiredBindings: [],
				optionalBindings: [],
				configurationSchema: { type: 'object', additionalProperties: true },
				runtimeStateSchema: { type: 'object', additionalProperties: true },
				capabilitySets: ['manager', 'operator', 'viewer'],
				commands: [],
				events: [],
				hostPermissions: ['network'],
			},
		],
		migrations: [],
		assets: [{ path: 'widgets/weather-panel/icon.png' }],
		portabilityWarnings: [],
	};

	let name = $state('');
	let description = $state('');
	let visibility = $state<'dm-only' | 'shared' | 'player-visible'>('dm-only');
	let tagsRaw = $state('');
	let submitting = $state(false);
	let lastCreatedId = $state<string | null>(null);
	let exportedPackage = $state<string | null>(null);

	// PLAT-018: the create button reflects the durable command lifecycle so a user sees a
	// pending state, a confirmed success, or a failure with retry guidance — never a partial
	// UI success. The lifecycle state itself is owned by the runtime/Processing Core.
	const lifecycle = $derived(runtime.lastLifecycle);
	const createLifecycle = $derived(
		lifecycle && lifecycle.commandType === 'scene.create' ? lifecycle : null,
	);

	const scenes = $derived(
		listScenesForActor(runtime.state.scenes, runtime.state.permissions, runtime.defaultActorId),
	);
	const packages = $derived(
		Object.values(runtime.state.widgets.packages).sort((a, b) =>
			a.package.displayName.localeCompare(b.package.displayName),
		),
	);

	function requestedPermissions(record: WidgetPackageRecord): WidgetHostPermission[] {
		return Array.from(new Set(record.package.widgets.flatMap((widget) => widget.hostPermissions)));
	}

	function reviewFor(record: WidgetPackageRecord): WidgetPackageReviewSummary {
		return buildWidgetPackageReviewSummary(record.package);
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!name.trim() || submitting) return;
		submitting = true;
		const result = await runtime.dispatch({
			type: 'scene.create',
			actorId: runtime.defaultActorId,
			payload: {
				name: name.trim(),
				description: description.trim(),
				visibility,
				tags: tagsRaw
					.split(',')
					.map((t) => t.trim())
					.filter(Boolean),
			},
		});
		submitting = false;
		if (result.status === 'accepted') {
			const created = result.events.find((e) => e.kind === 'scene.created');
			if (created && created.kind === 'scene.created') lastCreatedId = created.sceneId;
			name = '';
			description = '';
			tagsRaw = '';
			visibility = 'dm-only';
		}
	}

	async function installSamplePackage() {
		const result = await runtime.dispatch({
			type: 'widget.package.install',
			actorId: runtime.defaultActorId,
			payload: { package: sampleNetworkPackage },
		});
		if (result.status === 'accepted') exportedPackage = null;
	}

	async function enablePackage(packageId: string) {
		await runtime.dispatch({
			type: 'widget.package.enable',
			actorId: runtime.defaultActorId,
			payload: { packageId },
		});
	}

	async function disablePackage(packageId: string) {
		await runtime.dispatch({
			type: 'widget.package.disable',
			actorId: runtime.defaultActorId,
			payload: { packageId, reason: 'Disabled from widget package review.' },
		});
	}

	async function removePackage(packageId: string) {
		await runtime.dispatch({
			type: 'widget.package.remove',
			actorId: runtime.defaultActorId,
			payload: { packageId },
		});
	}

	function exportPackage(packageId: string) {
		// Id generation routes through the runtime's platform id generator, not a direct
		// crypto call from this GUI component (PLAT-006).
		const exported = exportWidgetPackage(
			runtime.state.widgets,
			{ ids: () => runtime.newId() },
			packageId,
		);
		exportedPackage = JSON.stringify(exported, null, 2);
	}
</script>

<section>
	<h2>Create a Scene</h2>
	<form class="form" onsubmit={submit} aria-label="Create Scene">
		<label>
			<span>Name</span>
			<input name="name" data-testid="scene-name" required bind:value={name} autocomplete="off" />
		</label>
		<label>
			<span>Description</span>
			<textarea name="description" data-testid="scene-description" bind:value={description} rows="2"
			></textarea>
		</label>
		<label>
			<span>Tags (comma separated)</span>
			<input
				name="tags"
				data-testid="scene-tags"
				bind:value={tagsRaw}
				placeholder="prep, dungeon"
			/>
		</label>
		<label>
			<span>Visibility</span>
			<select name="visibility" data-testid="scene-visibility" bind:value={visibility}>
				<option value="dm-only">DM only</option>
				<option value="shared">Shared</option>
				<option value="player-visible">Player visible</option>
			</select>
		</label>
		<button class="button" type="submit" data-testid="scene-create" disabled={submitting}>
			{submitting ? 'Saving…' : 'Create Scene'}
		</button>
	</form>
	{#if createLifecycle}
		<p
			class="meta"
			data-testid="create-lifecycle"
			data-status={createLifecycle.status}
			role={createLifecycle.status === 'failure' ? 'alert' : 'status'}
			aria-live="polite"
		>
			{#if createLifecycle.status === 'pending'}
				Saving Scene…
			{:else if createLifecycle.status === 'success'}
				Scene saved.
			{:else if createLifecycle.status === 'failure'}
				Could not save the Scene: {createLifecycle.error}. Fix the input and submit again to retry.
			{/if}
		</p>
	{/if}
	{#if lastCreatedId}
		<p class="meta" data-testid="last-created">Created: {lastCreatedId}</p>
	{/if}
</section>

<section>
	<h2>Widget Packages</h2>
	<div class="toolbar">
		<button
			class="button secondary"
			type="button"
			data-testid="install-weather-package"
			disabled={!!runtime.state.widgets.packages[sampleNetworkPackage.id]}
			onclick={installSamplePackage}
		>
			Install Weather Panel
		</button>
	</div>
	<div class="package-list" data-testid="widget-package-list">
		{#each packages as record (record.package.id)}
			{@const review = reviewFor(record)}
			<article class="package-row" data-testid={`package-${record.package.id}`}>
				<div>
					<strong>{record.package.displayName}</strong>
					<span class="meta"> v{record.package.version}</span>
					<div class="meta">
						{record.enabled ? 'enabled' : 'disabled'} • trust {record.trust.state}
						{#if record.removedAt}
							• removed{/if}
					</div>
					<div class="meta" data-testid={`review-${record.package.id}`}>
						Review {review.trustRecommendation}
						{#if review.customCodeWidgets.length > 0}
							• custom code {review.customCodeWidgets.join(', ')}
						{/if}
					</div>
					{#if review.requestedStyleAssets.length > 0 || review.requestedStyleCapabilities.length > 0}
						<div class="meta" data-testid={`style-review-${record.package.id}`}>
							Style
							{#if review.requestedStyleCapabilities.length > 0}
								{review.requestedStyleCapabilities.join(', ')}
							{/if}
							{#if review.requestedStyleAssets.length > 0}
								• {review.requestedStyleAssets.map((asset) => asset.assetPath).join(', ')}
							{/if}
						</div>
					{/if}
					{#if requestedPermissions(record).length > 0}
						<ul class="permission-list" data-testid={`permissions-${record.package.id}`}>
							{#each requestedPermissions(record) as permission (permission)}
								<li>
									{permission}: {record.trust.hostPermissions[permission]}
								</li>
							{/each}
						</ul>
					{/if}
					{#if record.migrationStatus.state !== 'none'}
						<div class="meta">migration {record.migrationStatus.state}</div>
					{/if}
					{#if review.diagnostics.length > 0}
						<ul class="permission-list" data-testid={`diagnostics-${record.package.id}`}>
							{#each review.diagnostics as diagnostic (diagnostic.id)}
								<li>{diagnostic.severity}: {diagnostic.message}</li>
							{/each}
						</ul>
					{/if}
				</div>
				<div class="row-actions">
					<button
						type="button"
						data-testid={`enable-package-${record.package.id}`}
						disabled={record.enabled || !!record.removedAt}
						onclick={() => enablePackage(record.package.id)}
					>
						Enable
					</button>
					<button
						type="button"
						data-testid={`disable-package-${record.package.id}`}
						disabled={!record.enabled || record.package.id.startsWith('system.')}
						onclick={() => disablePackage(record.package.id)}
					>
						Disable
					</button>
					<button
						type="button"
						data-testid={`remove-package-${record.package.id}`}
						disabled={!!record.removedAt || record.package.id.startsWith('system.')}
						onclick={() => removePackage(record.package.id)}
					>
						Remove
					</button>
					<button
						type="button"
						data-testid={`export-package-${record.package.id}`}
						disabled={!!record.removedAt}
						onclick={() => exportPackage(record.package.id)}
					>
						Export
					</button>
				</div>
			</article>
		{/each}
	</div>
	{#if exportedPackage}
		<pre class="export-preview" data-testid="package-export">{exportedPackage}</pre>
	{/if}
</section>

<section>
	<h2>All Scenes</h2>
	<p class="meta">{scenes.length} scene{scenes.length === 1 ? '' : 's'} in this vault</p>
	<ul class="scene-list" data-testid="scene-list">
		{#each scenes as scene (scene.id)}
			<li class="scene-card" data-testid={`scene-card-${scene.id}`}>
				<div>
					<a href={`../scene/${scene.id}/`} data-testid={`scene-link-${scene.id}`}>
						<strong>{scene.name}</strong>
					</a>
					<div class="meta">
						visibility {scene.visibility} • updated {scene.updatedAt}
					</div>
					{#if scene.isTemplate}
						<div class="meta">template</div>
					{/if}
				</div>
			</li>
		{/each}
		{#if scenes.length === 0}
			<li class="meta" data-testid="scene-list-empty">No scenes yet — create one above.</li>
		{/if}
	</ul>
</section>
