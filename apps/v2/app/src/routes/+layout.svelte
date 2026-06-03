<script lang="ts">
	import { onMount } from 'svelte';
	import { SceneRuntime, defaultEnvironment } from '$lib/canvas-runtime/runtime.svelte';
	import { provideRuntime } from '$lib/state/runtime-context';
	import './styles.css';

	const { children } = $props();

	const runtime = new SceneRuntime({
		env: defaultEnvironment(),
		defaultActorId: 'local-dm',
	});
	provideRuntime(runtime);

	onMount(() => {
		void runtime.load();
	});
</script>

<header class="app-header">
	<h1>DND Tools v2</h1>
	<p class="tagline">Scene-first command platform — local prototype</p>
	<nav>
		<a href="./" data-testid="nav-scenes">Scenes</a>
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
