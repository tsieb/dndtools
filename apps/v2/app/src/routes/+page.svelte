<script lang="ts">
	import { listScenesForActor } from '@dndtools/v2-core';
	import { useRuntime } from '$lib/state/runtime-context';

	const runtime = useRuntime();

	let name = $state('');
	let description = $state('');
	let visibility = $state<'dm-only' | 'shared' | 'player-visible'>('dm-only');
	let tagsRaw = $state('');
	let submitting = $state(false);
	let lastCreatedId = $state<string | null>(null);

	const scenes = $derived(
		listScenesForActor(runtime.state.scenes, runtime.state.permissions, runtime.defaultActorId),
	);

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
</script>

<section>
	<h2>Create a Scene</h2>
	<form class="form" onsubmit={submit} aria-label="Create Scene">
		<label>
			<span>Name</span>
			<input
				name="name"
				data-testid="scene-name"
				required
				bind:value={name}
				autocomplete="off"
			/>
		</label>
		<label>
			<span>Description</span>
			<textarea
				name="description"
				data-testid="scene-description"
				bind:value={description}
				rows="2"
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
			Create Scene
		</button>
	</form>
	{#if lastCreatedId}
		<p class="meta" data-testid="last-created">Created: {lastCreatedId}</p>
	{/if}
</section>

<section>
	<h2>Scenes</h2>
	<p class="meta">{scenes.length} scene{scenes.length === 1 ? '' : 's'} in this vault</p>
	<ul class="scene-list" data-testid="scene-list">
		{#each scenes as scene (scene.id)}
			<li class="scene-card" data-testid={`scene-card-${scene.id}`}>
				<div>
					<a href={`scene/${scene.id}/`} data-testid={`scene-link-${scene.id}`}>
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
