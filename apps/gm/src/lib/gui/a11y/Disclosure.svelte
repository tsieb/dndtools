<script lang="ts" module>
	let disclosureSeq = 0;
	function nextDisclosureId(): string {
		disclosureSeq += 1;
		return `disc-${disclosureSeq}`;
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * Disclosure primitive (UX-A11Y-012 disclosure pattern). A `<button>` with `aria-expanded` +
	 * `aria-controls` toggles a region that is shown/hidden via the `hidden` attribute — never via
	 * `aria-hidden` on the controlled element, which would hide it from AT without hiding it visually
	 * (UX-A11Y-012 §disclosure / AP-9). Enter and Space toggle (native button behaviour).
	 */
	interface Props {
		open?: boolean;
		summary: string;
		children: Snippet;
		testid?: string;
	}

	let { open = $bindable(false), summary, children, testid = 'disclosure' }: Props = $props();
	const regionId = nextDisclosureId();
</script>

<div class="disclosure" data-testid={testid}>
	<button
		type="button"
		class="disclosure-trigger"
		aria-expanded={open}
		aria-controls={regionId}
		data-testid={`${testid}-trigger`}
		onclick={() => (open = !open)}
	>
		<span class="disclosure-marker" aria-hidden="true">{open ? '▾' : '▸'}</span>
		{summary}
	</button>
	<div id={regionId} class="disclosure-region" data-testid={`${testid}-region`} hidden={!open}>
		{@render children()}
	</div>
</div>
