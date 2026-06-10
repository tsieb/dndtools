<script lang="ts">
	import type { ContextualLink } from '@dndtools/core';

	interface Props {
		backlinks: ContextualLink[];
		related: ContextualLink[];
	}
	const { backlinks, related }: Props = $props();
</script>

<!-- Contextual navigation (NAV-003): backlinks point *to* the open entity, related
     links point *from* it. Each is an ordinary link, so following a backlink updates
     the route and history coherently (NAV-003 AC1). The Processing Core has already
     visibility-filtered both lists, so a hidden source never appears here. -->
{#if backlinks.length > 0 || related.length > 0}
	<nav class="contextual-nav" aria-label="Related and backlinks" data-testid="contextual-nav">
		{#if backlinks.length > 0}
			<div class="contextual-group" data-testid="contextual-backlinks">
				<span class="contextual-label">Backlinks</span>
				<ul>
					{#each backlinks as link (link.id)}
						<li>
							<a href={link.route} data-testid={`backlink-${link.id}`}>{link.title}</a>
							<span class="contextual-reason">{link.relation}</span>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
		{#if related.length > 0}
			<div class="contextual-group" data-testid="contextual-related">
				<span class="contextual-label">Related</span>
				<ul>
					{#each related as link (link.id)}
						<li>
							<a href={link.route} data-testid={`related-${link.id}`}>{link.title}</a>
							<span class="contextual-reason">{link.relation}</span>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	</nav>
{/if}
