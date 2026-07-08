<script lang="ts">
	import type { NavigationCrumb } from '@dndtools/core';
	import { useProfile } from '$lib/platform/platform-profile.svelte';
	import Dialog from '$lib/gui/a11y/Dialog.svelte';
	import {
		buildBreadcrumbView,
		buildCompactBreadcrumbView,
	} from '$lib/gui/ux-shell/breadcrumb-model';

	interface Props {
		crumbs: NavigationCrumb[];
	}
	const { crumbs }: Props = $props();
	const profile = useProfile();

	// UX-NAV-007: location-style breadcrumbs render at the second level and deeper only —
	// at a section root the global nav already conveys location, so the trail (one crumb)
	// is omitted. Derived once from the single current location (NAV-003); following a
	// crumb is an ordinary route change so browser history stays coherent (NAV-003 AC1).
	const view = $derived(buildBreadcrumbView(crumbs));
	const compact = $derived(buildCompactBreadcrumbView(crumbs));

	// The `…` collapsed-middle group expands inline on Desktop / Tablet landscape.
	let middleExpanded = $state(false);
	// The compact (Mobile / Tablet portrait) full-path sheet.
	let sheetOpen = $state(false);

	// UX-NAV-007 AC1: the breadcrumb appears at the SECOND level and deeper only — i.e. when an
	// entity is open below the section root. The core trail is Home (Command Center) -> Section ->
	// Entity, so a section root is exactly two crumbs (Home + Section) and shows no breadcrumb (the
	// global nav already conveys the active section); an open entity is three or more crumbs.
	const showTrail = $derived(crumbs.length > 2);
</script>

{#if showTrail}
	{#if profile.isCompact}
		<!-- UX-NAV-007 AC3: compact truncation — only `‹ <immediate parent>` shows inline;
		     tapping it opens a sheet with the full path. -->
		<nav aria-label="Breadcrumb" class="breadcrumbs breadcrumbs-compact" data-testid="breadcrumbs">
			<button
				type="button"
				class="breadcrumb-compact-trigger"
				data-testid="breadcrumb-compact-trigger"
				aria-haspopup="dialog"
				aria-expanded={sheetOpen}
				onclick={() => (sheetOpen = true)}
			>
				<span aria-hidden="true">‹</span>
				{compact.parent?.title ?? ''}
			</button>
		</nav>
		<Dialog
			bind:open={sheetOpen}
			title="Location"
			testid="breadcrumb-sheet"
			onclose={() => (sheetOpen = false)}
		>
			<nav aria-label="Breadcrumb" class="breadcrumb-sheet-nav">
				<ol>
					{#each compact.full as crumb (crumb.id)}
						<li>
							{#if crumb.current}
								<span aria-current="page" data-testid={`breadcrumb-${crumb.id}`}>{crumb.title}</span>
							{:else}
								<a
									href={crumb.route}
									data-testid={`breadcrumb-${crumb.id}`}
									onclick={() => (sheetOpen = false)}
								>
									{crumb.title}
								</a>
							{/if}
						</li>
					{/each}
				</ol>
			</nav>
		</Dialog>
	{:else}
		<!-- UX-NAV-007: full location trail with `Section › … › Parent › Current` collapse
		     when deeper than four crumbs. -->
		<nav aria-label="Breadcrumb" class="breadcrumbs" data-testid="breadcrumbs">
			<ol>
				{#each view.leading as crumb (crumb.id)}
					<li>
						{#if crumb.current}
							<span aria-current="page" data-testid={`breadcrumb-${crumb.id}`}>{crumb.title}</span>
						{:else}
							<a href={crumb.route} data-testid={`breadcrumb-${crumb.id}`}>{crumb.title}</a>
						{/if}
					</li>
				{/each}
				{#if view.isCollapsed}
					{#if middleExpanded}
						{#each view.collapsed as crumb (crumb.id)}
							<li>
								<a href={crumb.route} data-testid={`breadcrumb-${crumb.id}`}>{crumb.title}</a>
							</li>
						{/each}
					{:else}
						<li>
							<button
								type="button"
								class="breadcrumb-collapse"
								data-testid="breadcrumb-collapse"
								aria-label="Show full path"
								aria-expanded={middleExpanded}
								onclick={() => (middleExpanded = true)}
							>
								…
							</button>
						</li>
					{/if}
				{/if}
				{#each view.trailing as crumb (crumb.id)}
					<li>
						{#if crumb.current}
							<span aria-current="page" data-testid={`breadcrumb-${crumb.id}`}>{crumb.title}</span>
						{:else}
							<a href={crumb.route} data-testid={`breadcrumb-${crumb.id}`}>{crumb.title}</a>
						{/if}
					</li>
				{/each}
			</ol>
		</nav>
	{/if}
{/if}
