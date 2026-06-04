<script lang="ts">
	import type { NavigationCrumb } from '@dndtools/v2-core';

	interface Props {
		crumbs: NavigationCrumb[];
	}
	const { crumbs }: Props = $props();
</script>

<!-- Breadcrumbs (NAV-003): the trail is derived from the single current location.
     The current crumb is marked aria-current and is not a link; ancestors are
     ordinary links so following one updates the route and browser history
     coherently (NAV-003 AC1). Hidden when there is only the Home crumb. -->
{#if crumbs.length > 1}
	<nav aria-label="Breadcrumb" class="breadcrumbs" data-testid="breadcrumbs">
		<ol>
			{#each crumbs as crumb (crumb.id)}
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
