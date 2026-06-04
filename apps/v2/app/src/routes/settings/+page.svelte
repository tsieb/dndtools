<script lang="ts">
	import { listNavigationSections } from '@dndtools/v2-core';
	import { useRuntime } from '$lib/state/runtime-context';
	import { useProfile } from '$lib/platform/platform-profile.svelte';

	const runtime = useRuntime();
	const profile = useProfile();

	// Local, device-scoped display preferences are GUI-owned state (Contract 1): the
	// platform profile and the "view as" actor are not durable vault state. This
	// surface reads the same actor-filtered navigation availability the primary nav
	// and palette use, so it reflects exactly what the active actor can reach.
	const activeActor = $derived(runtime.state.permissions.actors[runtime.activeActorId] ?? null);
	const sections = $derived(listNavigationSections(runtime.state.permissions, runtime.activeActorId));
</script>

<section data-testid="settings-view" aria-label="Settings">
	<h2>Settings</h2>
	<p class="meta">Device-local display preferences for this prototype. Nothing here is synced.</p>

	<section aria-label="Platform profile">
		<h3>Platform profile</h3>
		<p class="meta" data-testid="settings-profile">
			profile: {profile.profileId} • viewport: {profile.viewportClass}
		</p>
	</section>

	<section aria-label="Active actor">
		<h3>Viewing as</h3>
		<p class="meta" data-testid="settings-active-actor">
			{#if activeActor}
				{activeActor.displayName} ({activeActor.role})
			{:else}
				Unknown actor
			{/if}
		</p>
		<p class="meta">Switch the viewing actor from the “View as” control in the header.</p>
	</section>

	<section aria-label="Reachable sections">
		<h3>Sections you can reach</h3>
		<ul class="scene-list" data-testid="settings-sections">
			{#each sections as section (section.id)}
				<li class="scene-card" data-testid={`settings-section-${section.id}`}>
					<a href={section.route}><strong>{section.title}</strong></a>
					<span class="meta"> {section.category}</span>
				</li>
			{/each}
		</ul>
	</section>
</section>
