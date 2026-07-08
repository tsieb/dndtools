<script lang="ts">
	import { useLiveAnnouncer } from './live-announcer.svelte';

	/**
	 * The two product-wide ARIA live regions (UX-A11Y §6.2). Mounted once in the app shell; binds to
	 * the {@link LiveAnnouncer} from context. Visually hidden but always in the DOM so screen readers
	 * register the text changes the announcer writes. No surface adds its own `aria-live` node.
	 */
	const announcer = useLiveAnnouncer();
</script>

{#if announcer}
	<div
		class="visually-hidden"
		aria-live="polite"
		aria-atomic="true"
		data-testid="live-polite"
	>
		{announcer.polite}
	</div>
	<div
		class="visually-hidden"
		aria-live="assertive"
		aria-atomic="true"
		data-testid="live-assertive"
	>
		{announcer.assertive}
	</div>
{/if}
