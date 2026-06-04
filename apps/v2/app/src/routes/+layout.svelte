<script lang="ts">
	import { onMount } from 'svelte';
	import { listNavigationSections } from '@dndtools/v2-core';
	import { SceneRuntime, defaultEnvironment } from '$lib/canvas-runtime/runtime.svelte';
	import { provideRuntime } from '$lib/state/runtime-context';
	import { PlatformProfileStore, provideProfile } from '$lib/platform/platform-profile.svelte';
	import CommandPalette from '$lib/gui/CommandPalette.svelte';
	import './styles.css';

	const { children } = $props();

	const runtime = new SceneRuntime({
		env: defaultEnvironment(),
		defaultActorId: 'local-dm',
	});
	provideRuntime(runtime);

	const profile = new PlatformProfileStore();
	provideProfile(profile);

	onMount(() => {
		void runtime.load();
		return profile.init();
	});

	// Primary navigation reads the same actor-filtered availability API the command
	// palette and visible controls use (NAV-010): DM-only sections are absent for
	// players/observers rather than disabled, so navigation never leaks a hidden
	// section (NAV-010 AC1).
	const sections = $derived(listNavigationSections(runtime.state.permissions, runtime.activeActorId));
</script>

<header class="app-header">
	<h1>DND Tools v2</h1>
	<p class="tagline">Scene-first command platform — local prototype</p>
	<nav aria-label="Primary">
		{#each sections as section (section.id)}
			<a href={section.route} data-testid={`nav-${section.id}`}>{section.title}</a>
		{/each}
		<CommandPalette />
		<label class="view-as">
			<span class="visually-hidden">View as</span>
			<select
				data-testid="view-as-select"
				value={runtime.activeActorId}
				onchange={(event) => runtime.setActiveActor(event.currentTarget.value)}
			>
				{#each runtime.actors as actor (actor.id)}
					<option value={actor.id}>View as: {actor.displayName} ({actor.role})</option>
				{/each}
			</select>
		</label>
	</nav>
</header>

<main class="app-main">
	{#if !runtime.loaded}
		<p class="loading" role="status">Loading local Scene store…</p>
	{:else}
		{@render children?.()}
	{/if}
	{#if runtime.lastError}
		<p class="error" role="alert">{runtime.lastError}</p>
	{/if}
</main>
