<script lang="ts">
	import type { NavEntry } from '$lib/platform/navigation-history';
	import { useNavigationHistory } from '$lib/platform/navigation-history.svelte';

	interface Props {
		/** The current destination, offered as a pin/unpin target. Already reachability-filtered by
		 *  the shell, so it is only ever a route the active actor can reach (fail closed). */
		current: NavEntry | null;
	}
	const { current }: Props = $props();
	const history = useNavigationHistory();
</script>

<!-- UX-NAV-015: the per-page pin/unpin toggle. The pinned/recent LISTS render in the sidebar strip
     (PinnedRecentStrip); this is the affordance to pin the page you are on, available on every
     profile. Pinned/recent are device-local GUI preferences, never synced (Contract 1/2). -->
{#if current}
	<nav class="quick-access" aria-label="Pin this page" data-testid="quick-access">
		<button
			type="button"
			class="quick-pin-toggle"
			data-testid="quick-pin-current"
			aria-pressed={history.isPinned(current.route)}
			onclick={() => history.togglePin(current)}
		>
			{history.isPinned(current.route) ? '★ Pinned' : '☆ Pin this'}
		</button>
	</nav>
{/if}
