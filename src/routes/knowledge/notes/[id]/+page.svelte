<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { layoutState } from '$lib/state/layout.svelte.js';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import LegacyNotePage from '../../../notes/[id]/+page.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	$effect(() => {
		if (!layoutState.isMedium) return;
		const targetPath = resolve('/knowledge/notes');
		if (page.url.pathname === targetPath) return;
		const searchParams = new SvelteURLSearchParams(page.url.searchParams);
		searchParams.set('note', String(data.noteId));
		const query = searchParams.toString();
		goto(query ? `${targetPath}?${query}` : targetPath, {
			replaceState: true,
			keepFocus: true,
			noScroll: true,
		});
	});
</script>

<LegacyNotePage {data} />
