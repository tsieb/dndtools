<script lang="ts">
	import type { ContextualLink } from '@dndtools/core';

	interface Props {
		related: ContextualLink[];
	}
	const { related }: Props = $props();
</script>

<!-- Contextual related links (NAV-003): links that point *from* the open entity (e.g. the
     template it was created from). Backlinks (links *to* the entity) are owned by the
     UX-NAV-008 BacklinksPanel. Each is an ordinary link, so following one updates the route
     and history coherently (NAV-003 AC1). The Processing Core has already visibility-filtered
     the list, so a hidden target never appears here. -->
{#if related.length > 0}
	<nav class="contextual-nav" aria-label="Related" data-testid="related-nav">
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
	</nav>
{/if}
