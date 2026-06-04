<script lang="ts">
	import type { NavigationDestination } from '@dndtools/v2-core';
	import { filterReachable, type NavEntry } from '$lib/platform/navigation-history';
	import { useNavigationHistory } from '$lib/platform/navigation-history.svelte';

	interface Props {
		/** Routes the active actor can currently reach, used to fail closed. */
		reachable: NavigationDestination[];
		/** The current destination, offered as a pin/unpin target. */
		current: NavEntry | null;
	}
	const { reachable, current }: Props = $props();
	const history = useNavigationHistory();

	// Pinned and recent items are device-local preferences; before display they are
	// filtered to currently-reachable routes so a route the active actor can no longer
	// reach (e.g. a DM-only Scene while viewing as a player) is never surfaced.
	const pinned = $derived(filterReachable(history.pinned, reachable));
	const recent = $derived(
		filterReachable(history.recent, reachable).filter(
			(entry) => !history.isPinned(entry.route) && entry.route !== current?.route,
		),
	);
	const currentPinnable = $derived(
		current && reachable.some((destination) => destination.route === current.route)
			? current
			: null,
	);
</script>

<!-- Pinned/recent quick access (NAV-003). These are device-local GUI preferences,
     never synced (Contract 1/2). Hidden until there is something to show. -->
{#if pinned.length > 0 || recent.length > 0 || currentPinnable}
	<nav class="quick-access" aria-label="Pinned and recent" data-testid="quick-access">
		{#if currentPinnable}
			<button
				type="button"
				class="quick-pin-toggle"
				data-testid="quick-pin-current"
				aria-pressed={history.isPinned(currentPinnable.route)}
				onclick={() => history.togglePin(currentPinnable)}
			>
				{history.isPinned(currentPinnable.route) ? '★ Pinned' : '☆ Pin this'}
			</button>
		{/if}
		{#if pinned.length > 0}
			<div class="quick-group" data-testid="quick-pinned">
				<span class="quick-label">Pinned</span>
				<ul>
					{#each pinned as entry (entry.route)}
						<li>
							<a href={entry.route} data-testid={`quick-pinned-${entry.route}`}>{entry.title}</a>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
		{#if recent.length > 0}
			<div class="quick-group" data-testid="quick-recent">
				<span class="quick-label">Recent</span>
				<ul>
					{#each recent as entry (entry.route)}
						<li>
							<a href={entry.route} data-testid={`quick-recent-${entry.route}`}>{entry.title}</a>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	</nav>
{/if}
