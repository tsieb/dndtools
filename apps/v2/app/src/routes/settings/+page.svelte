<script lang="ts">
	import {
		listNavigationRegistryForActor,
		listNavigationSections,
		type SectionActorAvailability,
	} from '@dndtools/v2-core';
	import { useRuntime } from '$lib/state/runtime-context';
	import { useProfile } from '$lib/platform/platform-profile.svelte';

	const runtime = useRuntime();
	const profile = useProfile();

	// Local, device-scoped display preferences are GUI-owned state (Contract 1): the
	// platform profile and the "view as" actor are not durable vault state. This
	// surface reads the same actor-filtered navigation availability the primary nav
	// and palette use, so it reflects exactly what the active actor can reach.
	const activeActor = $derived(runtime.state.permissions.actors[runtime.activeActorId] ?? null);
	const sections = $derived(
		listNavigationSections(runtime.state.permissions, runtime.activeActorId),
	);

	// NAV-001 / NAV-009: the canonical top-level Navigation Section registry, filtered
	// for the active actor. DM-only sections are absent for players/observers (NAV-009
	// AC2). Planned sections appear as approved-but-unbuilt IA; only released sections
	// are reachable. The whole list is derived from the Processing Core registry, never
	// authored here.
	const registry = $derived(
		listNavigationRegistryForActor(runtime.state.permissions, runtime.activeActorId),
	);

	function availableRoles(availability: SectionActorAvailability): string {
		const roles = (['dm', 'player', 'observer'] as const).filter((role) => availability[role]);
		return roles.join(', ');
	}
</script>

<section data-testid="settings-view" aria-label="Settings">
	<p class="meta">Device-local display preferences for this prototype. Nothing here is synced.</p>

	<section aria-label="Platform profile">
		<h2>Platform profile</h2>
		<p class="meta" data-testid="settings-profile">
			profile: {profile.profileId} • viewport: {profile.viewportClass}
		</p>
	</section>

	<section aria-label="Active actor">
		<h2>Viewing as</h2>
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
		<h2>Sections you can reach</h2>
		<ul class="scene-list" data-testid="settings-sections">
			{#each sections as section (section.id)}
				<li class="scene-card" data-testid={`settings-section-${section.id}`}>
					<a href={section.route}><strong>{section.title}</strong></a>
					<span class="meta"> {section.category}</span>
				</li>
			{/each}
		</ul>
	</section>

	<section aria-label="Canonical navigation sections">
		<h2>Canonical navigation sections</h2>
		<p class="meta">
			The approved top-level information architecture. Each section declares its owning domain,
			route root, actor availability, and release status. DM-only sections never appear for players
			or observers.
		</p>
		<ul class="scene-list" data-testid="settings-ia-registry">
			{#each registry as entry (entry.id)}
				<li class="scene-card" data-testid={`ia-section-${entry.id}`}>
					<div>
						<strong>{entry.title}</strong>
						{#if entry.home}<span class="meta"> • home</span>{/if}
						<div class="meta">
							owner: {entry.owner} • root: <code>{entry.routeRoot}</code> • for: {availableRoles(
								entry.availability,
							)}
						</div>
						<div class="meta" data-testid={`ia-task-${entry.id}`}>serves: {entry.taskFit}</div>
						<div class="meta">local nav: {entry.localNav.description}</div>
					</div>
					<span
						class="meta"
						class:unavailable={!entry.reachable}
						data-testid={`ia-status-${entry.id}`}
					>
						{entry.releaseStatus}{entry.reachable ? ' • reachable' : ''}
					</span>
				</li>
			{/each}
		</ul>
	</section>
</section>
