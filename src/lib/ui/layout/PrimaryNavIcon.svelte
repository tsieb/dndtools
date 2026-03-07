<script lang="ts">
	import Icon from '$lib/ui/common/Icon.svelte';
	import type { IconName } from '$lib/ui/common/Icon.svelte';
	import type { PrimarySection } from '$lib/state/navigation.svelte.js';

	interface Props {
		section: PrimarySection;
		sizeClass?: string;
	}

	const SECTION_ICONS: Record<PrimarySection, IconName> = {
		knowledge: 'book',
		atlas: 'map',
		session: 'hexagon',
		campaign: 'flag',
		settings: 'settings',
	};

	let { section, sizeClass = 'h-5 w-5' }: Props = $props();

	/** Map the Tailwind size class to an Icon size token. */
	const size = $derived.by(() => {
		if (sizeClass.includes('h-7')) return 'lg' as const;
		return 'md' as const;
	});
</script>

<Icon name={SECTION_ICONS[section]} {size} />
