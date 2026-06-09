<script lang="ts">
	import Tabs from '$lib/gui/a11y/Tabs.svelte';

	let selected = $state('one');
	const tabs = [
		{ id: 'one', label: 'One' },
		{ id: 'two', label: 'Two' },
		{ id: 'three', label: 'Three' },
	];
</script>

<Tabs {tabs} bind:selected label="Demo tabs">
	{#snippet panel(id)}
		<p data-testid="panel-content">Panel {id}</p>
	{/snippet}
</Tabs>
