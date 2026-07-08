<script lang="ts">
	import Dialog from '$lib/gui/a11y/Dialog.svelte';
</script>

<Dialog open title="Demo dialog">
	<button data-testid="inside-a">A</button>
	<button data-testid="inside-b">B</button>
</Dialog>
