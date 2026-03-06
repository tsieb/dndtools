<script lang="ts">
	import type { PrimarySection } from '$lib/state/navigation.svelte.js';

	interface Props {
		section: PrimarySection;
		sizeClass?: string;
	}

	let { section, sizeClass = 'h-5 w-5' }: Props = $props();
</script>

<svg
	class={sizeClass}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.8"
	aria-hidden="true"
>
	{#if section === 'knowledge'}
		<path
			stroke-linecap="round"
			stroke-linejoin="round"
			d="M5 5.5A2.5 2.5 0 0 1 7.5 3H20v14H7.5A2.5 2.5 0 0 0 5 19.5z"
		/>
		<path
			stroke-linecap="round"
			stroke-linejoin="round"
			d="M5 19.5V5.5A2.5 2.5 0 0 1 7.5 3H9v16.5"
		/>
	{:else if section === 'atlas'}
		<path
			stroke-linecap="round"
			stroke-linejoin="round"
			d="M3 6.5 8.5 4l7 2.5L21 4v13.5L15.5 20l-7-2.5L3 20z"
		/>
		<path stroke-linecap="round" stroke-linejoin="round" d="M8.5 4v13.5m7-11V20" />
	{:else if section === 'session'}
		<path stroke-linecap="round" stroke-linejoin="round" d="M12 3 4 8v8l8 5 8-5V8z" />
		<path stroke-linecap="round" stroke-linejoin="round" d="m8.2 10.3 3.8 2.2 3.8-2.2M12 12.5V21" />
	{:else if section === 'campaign'}
		<path stroke-linecap="round" stroke-linejoin="round" d="M6 3v18" />
		<path stroke-linecap="round" stroke-linejoin="round" d="M6 5h11l-2.4 3L17 11H6z" />
	{:else}
		<path
			stroke-linecap="round"
			stroke-linejoin="round"
			d="M10.3 3.2a1 1 0 0 1 1.4 0l.7.7a1 1 0 0 0 1 .25l1-.27a1 1 0 0 1 1.2.7l.3 1a1 1 0 0 0 .7.73l1 .27a1 1 0 0 1 .7 1.2l-.27 1a1 1 0 0 0 .25.98l.7.72a1 1 0 0 1 0 1.4l-.7.7a1 1 0 0 0-.25 1l.27 1a1 1 0 0 1-.7 1.2l-1 .3a1 1 0 0 0-.73.7l-.27 1a1 1 0 0 1-1.2.7l-1-.27a1 1 0 0 0-.98.25l-.72.7a1 1 0 0 1-1.4 0l-.7-.7a1 1 0 0 0-1-.25l-1 .27a1 1 0 0 1-1.2-.7l-.3-1a1 1 0 0 0-.7-.73l-1-.27a1 1 0 0 1-.7-1.2l.27-1a1 1 0 0 0-.25-.98l-.7-.72a1 1 0 0 1 0-1.4l.7-.7a1 1 0 0 0 .25-1l-.27-1a1 1 0 0 1 .7-1.2l1-.3a1 1 0 0 0 .73-.7l.27-1a1 1 0 0 1 1.2-.7l1 .27a1 1 0 0 0 .98-.25z"
		/>
		<circle cx="12" cy="12" r="2.6" />
	{/if}
</svg>
