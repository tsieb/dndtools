<script lang="ts">
	import StateBadge from '$lib/gui/a11y/StateBadge.svelte';
	import type { StateKind } from '$lib/gui/a11y/state-indicator';

	let { kind, value }: { kind: StateKind; value: string } = $props();
</script>

<StateBadge {kind} {value} testid="badge" />
