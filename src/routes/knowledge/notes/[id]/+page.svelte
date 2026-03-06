<script lang="ts">
	import LegacyNotePage from '../../../notes/[id]/+page.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<LegacyNotePage {data} />
