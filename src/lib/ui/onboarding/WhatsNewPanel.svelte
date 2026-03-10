<script lang="ts">
	import { resolve } from '$app/paths';
	import { getWhatsNewReleaseForVersion } from '$lib/domain/whats-new.js';
	import Button from '$lib/ui/common/Button.svelte';

	interface Props {
		version: string;
		onclose?: () => void;
	}

	let { version, onclose }: Props = $props();

	const release = $derived(getWhatsNewReleaseForVersion(version));

	function toHref(value: string): string {
		if (value.startsWith('/')) {
			return resolve(value);
		}
		return value;
	}
</script>

<section class="mb-6 rounded-xl border border-border bg-surface p-4 md:p-5">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h2 class="text-lg font-semibold text-ink">What's new</h2>
			<p class="mt-1 text-sm text-ink-muted">Version {version}</p>
		</div>
		{#if onclose}
			<Button variant="ghost" size="sm" onclick={onclose}>Hide</Button>
		{/if}
	</div>

	{#if release}
		<ul class="mt-4 space-y-2">
			{#each release.changes as change, index (`${release.version}-${index}`)}
				<li class="rounded-lg border border-border bg-surface-alt/40 p-3">
					<p class="text-sm text-ink">{change.text}</p>
					{#if change.links.length > 0}
						<div class="mt-2 flex flex-wrap items-center gap-2">
							{#each change.links as link (`${link.href}-${link.label}`)}
								<a
									href={toHref(link.href)}
									class="text-xs text-accent underline underline-offset-2 hover:text-accent-hover"
								>
									{link.label}
								</a>
							{/each}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<p class="mt-4 text-sm text-ink-muted">No release notes are available for this version yet.</p>
	{/if}
</section>
